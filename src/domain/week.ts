import { WeekDoc, PersonId } from "./types";

export const TIMEZONE = "Europe/London" as const;

export const PEOPLE: PersonId[] = ["mum", "dad", "son"];

export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function getCurrentWeekId(now: Date = new Date()): string {
  const parts = getDatePartsInTimeZone(now, TIMEZONE);
  return isoWeekIdFromDate(parts.year, parts.month, parts.day);
}

export function getCurrentDayIndex(now: Date = new Date()): number {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    weekday: "short",
  });
  const label = formatter.format(now);
  const index = DAY_LABELS.indexOf(label);
  return index >= 0 ? index : 0;
}

export function defaultWeekDoc(weekId: string): WeekDoc {
  const meals: Record<string, string> = {};
  for (let i = 0; i < 7; i += 1) {
    meals[String(i)] = "";
  }

  const focus: Record<PersonId, string> = {
    mum: "",
    dad: "",
    son: "",
  };

  return {
    weekId,
    timezone: TIMEZONE,
    people: [...PEOPLE],
    version: 1,
    updatedAt: new Date().toISOString(),
    events: [],
    todos: [],
    meals,
    focus,
    notes: "",
  };
}

export function nextWeekId(weekId: string): string {
  const parsed = parseWeekId(weekId);
  if (!parsed) {
    return weekId;
  }
  const { year, week } = parsed;
  const totalWeeks = weeksInYear(year);
  if (week < totalWeeks) {
    return formatWeekId(year, week + 1);
  }
  return formatWeekId(year + 1, 1);
}

export function shiftWeekId(weekId: string, offset: number): string {
  const parsed = parseWeekId(weekId);
  if (!parsed || offset === 0) {
    return weekId;
  }
  let { year, week } = parsed;
  let remaining = offset;
  while (remaining > 0) {
    const totalWeeks = weeksInYear(year);
    if (week < totalWeeks) {
      week += 1;
    } else {
      year += 1;
      week = 1;
    }
    remaining -= 1;
  }
  while (remaining < 0) {
    if (week > 1) {
      week -= 1;
    } else {
      year -= 1;
      week = weeksInYear(year);
    }
    remaining += 1;
  }
  return formatWeekId(year, week);
}

export function getWeekStartDate(weekId: string): Date | null {
  const parsed = parseWeekId(weekId);
  if (!parsed) {
    return null;
  }
  const { year, week } = parsed;
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayIndex = (jan4.getUTCDay() + 6) % 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - dayIndex);
  const target = new Date(week1Monday);
  target.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return target;
}

export function parseWeekId(weekId: string): { year: number; week: number } | null {
  const match = /^\d{4}-W\d{2}$/.exec(weekId);
  if (!match) {
    return null;
  }
  const year = Number(weekId.slice(0, 4));
  const week = Number(weekId.slice(6, 8));
  if (!Number.isInteger(year) || !Number.isInteger(week)) {
    return null;
  }
  return { year, week };
}

export function getWeekIdFromDateString(dateValue: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return isoWeekIdFromDate(year, month, day);
}

function formatWeekId(year: number, week: number): string {
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function getDatePartsInTimeZone(date: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
} {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const lookup: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      lookup[part.type] = part.value;
    }
  }
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
  };
}

function isoWeekIdFromDate(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayIndex = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayIndex + 3);
  const isoYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayIndex = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayIndex + 3);
  const week =
    1 +
    Math.round(
      (date.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000)
    );
  return formatWeekId(isoYear, week);
}

function weeksInYear(year: number): number {
  const dec28 = new Date(Date.UTC(year, 11, 28));
  const dayIndex = (dec28.getUTCDay() + 6) % 7;
  dec28.setUTCDate(dec28.getUTCDate() - dayIndex + 3);
  const isoYear = dec28.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayIndex = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayIndex + 3);
  return (
    1 +
    Math.round(
      (dec28.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000)
    )
  );
}
