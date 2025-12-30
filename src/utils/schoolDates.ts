import { SchoolDateItem, SchoolDatesDocument, SchoolDayPart, SchoolDateType } from "../domain/types";
import { TIMEZONE, getWeekStartDate } from "../domain/week";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const SCHOOL_TYPE_LABELS: Record<SchoolDateType, string> = {
  term_start: "Term starts",
  term_end: "Term ends",
  holiday: "Half term",
  reading_week: "Reading week",
  staff_day: "Staff day",
  bank_holiday: "Bank holiday",
  exam: "Exam",
  reopen: "Reopens",
  info: "Info",
};

export function flattenSchoolItems(doc: SchoolDatesDocument): SchoolDateItem[] {
  return doc.academicYears.flatMap((year) => year.items);
}

export function getAcademicYearLabel(date: Date = new Date(), timeZone = TIMEZONE): string {
  const parts = getDatePartsInTimeZone(date, timeZone);
  const startYear = parts.month >= 9 ? parts.year : parts.year - 1;
  return `${startYear}-${startYear + 1}`;
}

export function getWeekDateRange(weekId: string, timeZone = TIMEZONE): {
  startDate: string;
  endDate: string;
} | null {
  const weekStart = getWeekStartDate(weekId);
  if (!weekStart) {
    return null;
  }
  const startDate = getIsoDateInTimeZone(weekStart, timeZone);
  const endDate = addDaysToIsoDate(startDate, 6);
  return { startDate, endDate };
}

export function formatDayPart(part: SchoolDayPart): string {
  if (part === "am") {
    return "AM";
  }
  if (part === "pm") {
    return "PM";
  }
  return "";
}

export function sortByStartDate(a: SchoolDateItem, b: SchoolDateItem): number {
  const diff = dateValue(a.startDate) - dateValue(b.startDate);
  if (diff !== 0) {
    return diff;
  }
  return a.label.localeCompare(b.label);
}

export function intersectsRange(
  item: SchoolDateItem,
  startDate: string,
  endDate: string
): boolean {
  return item.startDate <= endDate && item.endDate >= startDate;
}

export function formatDateRange(
  startDate: string,
  endDate: string,
  timeZone = TIMEZONE
): string {
  if (startDate === endDate) {
    return formatDateInTimeZone(startDate, timeZone, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  const startLabel = formatDateInTimeZone(startDate, timeZone, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const endLabel = formatDateInTimeZone(endDate, timeZone, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${startLabel} - ${endLabel}`;
}

export function formatWeekRangeLabel(
  item: SchoolDateItem,
  weekStart: string,
  weekEnd: string,
  timeZone = TIMEZONE
): string {
  const rangeStart = item.startDate > weekStart ? item.startDate : weekStart;
  const rangeEnd = item.endDate < weekEnd ? item.endDate : weekEnd;
  const startLabel = formatDateInTimeZone(rangeStart, timeZone, {
    weekday: "short",
  });
  const endLabel = formatDateInTimeZone(rangeEnd, timeZone, {
    weekday: "short",
  });
  if (rangeStart === rangeEnd) {
    const part = formatDayPart(item.startDayPart);
    return part ? `${startLabel} (${part})` : startLabel;
  }
  return `${startLabel}-${endLabel}`;
}

export function getUpcomingItems(
  doc: SchoolDatesDocument,
  daysAhead = 90,
  timeZone = TIMEZONE
): SchoolDateItem[] {
  const todayIso = getTodayIso(timeZone);
  const windowEnd = addDaysToIsoDate(todayIso, daysAhead);
  return flattenSchoolItems(doc)
    .filter((item) => intersectsRange(item, todayIso, windowEnd))
    .sort(sortByStartDate);
}

export function getTodayIso(timeZone = TIMEZONE): string {
  const parts = getDatePartsInTimeZone(new Date(), timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function addDaysToIsoDate(dateIso: string, days: number): string {
  const value = dateValue(dateIso);
  if (!Number.isFinite(value)) {
    return dateIso;
  }
  const next = new Date(value + days * 24 * 60 * 60 * 1000);
  return formatIsoDateFromDate(next);
}

function dateValue(dateIso: string): number {
  if (!DATE_RE.test(dateIso)) {
    return Number.NaN;
  }
  const [year, month, day] = dateIso.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function formatIsoDateInTimeZone(date: Date, timeZone: string): string {
  const parts = getDatePartsInTimeZone(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function getIsoDateInTimeZone(date: Date, timeZone = TIMEZONE): string {
  return formatIsoDateInTimeZone(date, timeZone);
}

function formatIsoDateFromDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatDateInTimeZone(
  dateIso: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions
): string {
  const date = isoToDate(dateIso);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    ...options,
  }).format(date);
}

function isoToDate(dateIso: string): Date {
  if (!DATE_RE.test(dateIso)) {
    return new Date("invalid");
  }
  const [year, month, day] = dateIso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
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
