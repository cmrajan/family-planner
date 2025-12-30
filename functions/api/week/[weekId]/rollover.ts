import { getOrCreateWeek, putArchive, putWeek } from "../../../_lib/store";
import { jsonError, jsonOk } from "../../../_lib/response";
import { defaultWeekDoc, nextWeekId, parseWeekId } from "../../../_lib/week";
import { WeekDoc, PlannerEvent } from "../../../../src/domain/types";
import { createId } from "../../../_lib/id";

export async function onRequest({
  request,
  params,
  env,
}: {
  request: Request;
  params: { weekId: string };
  env: { FAMILY_PLANNER_KV: KVNamespace };
}) {
  const weekId = params.weekId;
  if (!parseWeekId(weekId)) {
    return jsonError("INVALID_WEEK_ID", "Week ID is invalid", 400);
  }

  if (request.method !== "POST") {
    return jsonError("METHOD_NOT_ALLOWED", "Method not allowed", 405);
  }

  const url = new URL(request.url);
  const carryMeals = url.searchParams.get("carryMeals") === "1";
  const carryFocus = url.searchParams.get("carryFocus") === "1";
  const carryRecurring = url.searchParams.get("carryRecurring") === "1";

  const current = await getOrCreateWeek(env, weekId);
  await putArchive(env, weekId, current);

  const nextId = nextWeekId(weekId);
  const nextWeek = defaultWeekDoc(nextId);

  if (carryMeals) {
    for (let i = 0; i < 7; i += 1) {
      const key = String(i);
      nextWeek.meals[key] = current.meals[key] ?? "";
    }
  }

  if (carryFocus) {
    nextWeek.focus = { ...current.focus };
  }

  if (carryRecurring) {
    const recurringEvents = current.events
      .filter((event) => event.tag === "recurring")
      .sort((a, b) => {
        if (a.day !== b.day) {
          return a.day - b.day;
        }
        const ao = a.order ?? Number.MAX_SAFE_INTEGER;
        const bo = b.order ?? Number.MAX_SAFE_INTEGER;
        if (ao !== bo) {
          return ao - bo;
        }
        const at = a.time ?? "";
        const bt = b.time ?? "";
        if (at !== bt) {
          return at.localeCompare(bt);
        }
        return a.title.localeCompare(b.title);
      });
    const orderByDay = new Map<number, number>();
    const nextOrder = (day: number) => {
      const currentOrder = orderByDay.get(day);
      if (currentOrder === undefined) {
        orderByDay.set(day, 0);
        return 0;
      }
      const next = currentOrder + 1;
      orderByDay.set(day, next);
      return next;
    };
    recurringEvents.forEach((event) => {
      const carried: PlannerEvent = {
        ...event,
        id: createId(),
        order: nextOrder(event.day),
      };
      nextWeek.events.push(carried);
    });
  }

  const stored: WeekDoc = {
    ...nextWeek,
    updatedAt: new Date().toISOString(),
  };

  await putWeek(env, stored);

  return jsonOk({
    archivedWeekId: weekId,
    nextWeekId: nextId,
    nextWeek: stored,
  });
}
