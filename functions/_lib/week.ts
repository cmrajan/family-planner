import { WeekDoc, PersonId } from "../../src/domain/types";

const TIMEZONE = "Europe/London" as const;

export const PEOPLE: PersonId[] = ["mum", "dad", "son"];

export function getCurrentWeekId(now: Date = new Date()): string {
  const parts = getDatePartsInTimeZone(now, TIMEZONE);
  return isoWeekIdFromDate(parts.year, parts.month, parts.day);
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
