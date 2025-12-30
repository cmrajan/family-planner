import { getCurrentDayIndex, getCurrentWeekId } from "../../../src/domain/week";
import {
  PersonId,
  PlannerEvent,
  PushMessagePayload,
  WeekDoc,
} from "../../../src/domain/types";
import { getPractice, getWeek } from "../../../functions/_lib/store";
import { normalizePracticeDoc } from "../../../functions/_lib/practice";
import { pushPracticeSentKey, pushSentKey, sendPushToPerson } from "../../../functions/_lib/push";

export interface Env {
  FAMILY_PLANNER_KV: KVNamespace;
  PUSH_VAPID_PUBLIC_KEY?: string;
  PUSH_VAPID_PRIVATE_KEY?: string;
  PUSH_VAPID_SUBJECT?: string;
}

const TIMEZONE = "Europe/London";
const LEAD_MINUTES = 15;
const SENT_TTL_SECONDS = 14 * 24 * 60 * 60;
const PRACTICE_SENT_TTL_SECONDS = 3 * 24 * 60 * 60;

function formatTimeHHMM(value: Date): string {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return formatter.format(value);
}

function buildRecipients(event: PlannerEvent, week: WeekDoc): PersonId[] {
  if (Array.isArray(event.who) && event.who.length > 0) {
    return event.who;
  }
  return week.people;
}

async function dispatchReminders(env: Env) {
  const target = new Date(Date.now() + LEAD_MINUTES * 60_000);
  const weekId = getCurrentWeekId(target);
  const dayIndex = getCurrentDayIndex(target);
  const timeHHMM = formatTimeHHMM(target);

  const week = await getWeek(env, weekId);
  if (!week) {
    console.log(`[push] week ${weekId} not found`);
    return;
  }

  const matches = week.events.filter(
    (event) => event.day === dayIndex && event.time === timeHHMM
  );
  if (matches.length === 0) {
    console.log(`[push] no events at ${weekId} ${dayIndex} ${timeHHMM}`);
    return;
  }

  let attempted = 0;
  let sent = 0;
  let removed = 0;

  for (const event of matches) {
    if (!event.time) {
      continue;
    }
    const recipients = buildRecipients(event, week);
    for (const personId of recipients) {
      const dedupeKey = pushSentKey({
        personId,
        weekId,
        eventId: event.id,
        leadMinutes: LEAD_MINUTES,
        day: event.day,
        time: event.time,
      });
      const alreadySent = await env.FAMILY_PLANNER_KV.get(dedupeKey);
      if (alreadySent) {
        continue;
      }
      await env.FAMILY_PLANNER_KV.put(dedupeKey, "1", {
        expirationTtl: SENT_TTL_SECONDS,
      });
      const payload: PushMessagePayload = {
        title: "Upcoming",
        body: `${event.title} at ${event.time}`,
        url: `/?week=${weekId}&tab=events&day=${event.day}`,
        tag: `event:${weekId}:${event.id}`,
        timestamp: new Date().toISOString(),
      };
      const result = await sendPushToPerson(env, personId, payload);
      attempted += result.attempted;
      sent += result.sent;
      removed += result.removed;
    }
  }

  console.log(
    `[push] events=${matches.length} attempted=${attempted} sent=${sent} removed=${removed}`
  );
}

async function dispatchPracticeReminders(env: Env) {
  const practice = await getPractice(env);
  if (!practice) {
    return;
  }
  const doc = normalizePracticeDoc(practice);
  const now = new Date();
  const weekId = getCurrentWeekId(now);
  const dayIndex = getCurrentDayIndex(now);
  const timeHHMM = formatTimeHHMM(now);

  const scheduledTimes =
    dayIndex >= 5 ? doc.reminders.weekendTimes : doc.reminders.weekdayTimes;
  const times = Array.isArray(scheduledTimes) ? scheduledTimes : [];
  if (!times.includes(timeHHMM)) {
    return;
  }

  const practicedToday = new Set<PersonId>();
  for (const entry of doc.logs) {
    if (entry.weekId === weekId && entry.day === dayIndex) {
      practicedToday.add(entry.personId);
    }
  }

  let attempted = 0;
  let sent = 0;
  let removed = 0;
  let eligible = 0;

  for (const personId of doc.people) {
    if (!doc.reminders.enabledByPerson?.[personId]) {
      continue;
    }
    if (practicedToday.has(personId)) {
      continue;
    }
    eligible += 1;
    const dedupeKey = pushPracticeSentKey({
      personId,
      weekId,
      day: dayIndex,
      time: timeHHMM,
    });
    const alreadySent = await env.FAMILY_PLANNER_KV.get(dedupeKey);
    if (alreadySent) {
      continue;
    }
    await env.FAMILY_PLANNER_KV.put(dedupeKey, "1", {
      expirationTtl: PRACTICE_SENT_TTL_SECONDS,
    });
    const payload: PushMessagePayload = {
      title: "Practice check-in",
      body: "Log a quick session if you can.",
      url: "/?tab=practice",
      tag: `practice:${weekId}:${personId}:d${dayIndex}:t${timeHHMM}`,
      timestamp: new Date().toISOString(),
    };
    const result = await sendPushToPerson(env, personId, payload);
    attempted += result.attempted;
    sent += result.sent;
    removed += result.removed;
  }

  console.log(
    `[push] practice time=${timeHHMM} eligible=${eligible} attempted=${attempted} sent=${sent} removed=${removed}`
  );
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      dispatchReminders(env).catch((error) => {
        console.error("[push] event dispatch failed", error);
        throw error;
      })
    );
    ctx.waitUntil(
      dispatchPracticeReminders(env).catch((error) => {
        console.error("[push] practice dispatch failed", error);
        throw error;
      })
    );
  },
};
