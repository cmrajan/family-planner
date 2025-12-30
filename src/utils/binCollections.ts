import { BinCollectionEvent, BinCollectionsDoc, BinServiceId } from "../domain/types";
import { TIMEZONE } from "../domain/week";
import { addDaysToIsoDate, getTodayIso } from "./schoolDates";

export const BIN_SERVICE_LABELS: Record<BinServiceId, string> = {
  food: "Food waste",
  recycling: "Recycling",
  domestic: "Domestic waste",
  garden: "Garden waste",
  unknown: "Other",
};

export const BIN_SERVICE_ICON_PATHS: Record<BinServiceId, string | null> = {
  food: "/images/bin-food.svg",
  recycling: "/images/bin-recycling.svg",
  domestic: "/images/bin-domestic.svg",
  garden: "/images/bin-garden.svg",
  unknown: null,
};

export function groupEventsByDate(
  events: BinCollectionEvent[]
): { date: string; events: BinCollectionEvent[] }[] {
  const groups: { date: string; events: BinCollectionEvent[] }[] = [];
  events.forEach((event) => {
    const last = groups[groups.length - 1];
    if (last && last.date === event.date) {
      last.events.push(event);
    } else {
      groups.push({ date: event.date, events: [event] });
    }
  });
  return groups;
}

export function getUpcomingGroups(
  doc: BinCollectionsDoc,
  weeksAhead = 8,
  timeZone = TIMEZONE
): { date: string; events: BinCollectionEvent[] }[] {
  const todayIso = getTodayIso(timeZone);
  const windowEnd = addDaysToIsoDate(todayIso, weeksAhead * 7);
  const filtered = doc.events.filter(
    (event) => event.date >= todayIso && event.date <= windowEnd
  );
  return groupEventsByDate(filtered);
}

export function getGroupsInRange(
  doc: BinCollectionsDoc,
  startDate: string,
  endDate: string
): { date: string; events: BinCollectionEvent[] }[] {
  const filtered = doc.events.filter(
    (event) => event.date >= startDate && event.date <= endDate
  );
  return groupEventsByDate(filtered);
}

export function getNextGroup(
  doc: BinCollectionsDoc,
  timeZone = TIMEZONE
): { date: string; events: BinCollectionEvent[] } | null {
  const todayIso = getTodayIso(timeZone);
  const groups = groupEventsByDate(doc.events);
  return groups.find((group) => group.date >= todayIso) ?? null;
}

export function formatBinDayLabel(value: string, timeZone = TIMEZONE): string {
  const date = isoToDate(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
  }).format(date);
}

export function formatBinDate(value: string, timeZone = TIMEZONE): string {
  const date = isoToDate(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatUpdatedLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatServiceLabel(event: BinCollectionEvent): string {
  if (event.serviceId === "unknown") {
    return event.serviceName;
  }
  return BIN_SERVICE_LABELS[event.serviceId];
}

export function getServiceIcon(
  event: BinCollectionEvent
): { src: string; alt: string } | null {
  const src = BIN_SERVICE_ICON_PATHS[event.serviceId];
  if (!src) {
    return null;
  }
  return { src, alt: `${formatServiceLabel(event)} bin` };
}

function isoToDate(dateIso: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso);
  if (!match) {
    return new Date("invalid");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(Date.UTC(year, month - 1, day));
}
