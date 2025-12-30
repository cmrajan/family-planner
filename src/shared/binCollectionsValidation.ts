import { BinCollectionEvent, BinCollectionsDoc, BinServiceId } from "../domain/types";
import { isValidIsoDate } from "./schoolDatesValidation";

export const BIN_SERVICE_IDS: BinServiceId[] = [
  "food",
  "recycling",
  "domestic",
  "garden",
  "unknown",
];

const MAX_FIELD_LENGTH = 200;

export function binsKey(uprn: string): string {
  return `bins:${uprn}`;
}

export function validateBinCollectionsDoc(doc: BinCollectionsDoc): string[] {
  const errors: string[] = [];
  if (doc.schemaVersion !== 1) {
    errors.push("schema_version_invalid");
  }
  if (!doc.uprn || typeof doc.uprn !== "string") {
    errors.push("uprn_invalid");
  }
  if (!isValidIsoDate(doc.rangeFrom)) {
    errors.push("range_from_invalid");
  }
  if (!isValidIsoDate(doc.rangeTo)) {
    errors.push("range_to_invalid");
  }
  if (isValidIsoDate(doc.rangeFrom) && isValidIsoDate(doc.rangeTo)) {
    if (doc.rangeFrom > doc.rangeTo) {
      errors.push("range_order_invalid");
    }
  }
  if (!doc.sourceHash || typeof doc.sourceHash !== "string") {
    errors.push("source_hash_invalid");
  }
  if (!doc.updatedAt || typeof doc.updatedAt !== "string") {
    errors.push("updated_at_invalid");
  } else if (Number.isNaN(Date.parse(doc.updatedAt))) {
    errors.push("updated_at_invalid");
  }
  if (!Array.isArray(doc.events)) {
    errors.push("events_invalid");
  } else {
    doc.events.forEach((event, index) => {
      errors.push(...validateBinCollectionEvent(event, index));
    });
    if (!isSorted(doc.events)) {
      errors.push("events_unsorted");
    }
  }
  return errors;
}

function validateBinCollectionEvent(event: BinCollectionEvent, index: number): string[] {
  const errors: string[] = [];
  if (!isValidIsoDate(event.date)) {
    errors.push(`event_date_invalid:${index}`);
  }
  if (!BIN_SERVICE_IDS.includes(event.serviceId)) {
    errors.push(`event_service_id_invalid:${index}`);
  }
  errors.push(...validateStringField(event.serviceName, "service_name", index));
  errors.push(...validateStringField(event.round, "round", index));
  errors.push(...validateStringField(event.schedule, "schedule", index));
  errors.push(...validateStringField(event.dayName, "day", index));
  errors.push(...validateStringField(event.readDate, "read_date", index));
  return errors;
}

function validateStringField(value: string, label: string, index: number): string[] {
  if (typeof value !== "string") {
    return [`event_${label}_invalid:${index}`];
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return [`event_${label}_empty:${index}`];
  }
  if (trimmed !== value) {
    return [`event_${label}_trim:${index}`];
  }
  if (trimmed.length > MAX_FIELD_LENGTH) {
    return [`event_${label}_too_long:${index}`];
  }
  return [];
}

function isSorted(events: BinCollectionEvent[]): boolean {
  for (let i = 1; i < events.length; i += 1) {
    if (compareEvents(events[i - 1], events[i]) > 0) {
      return false;
    }
  }
  return true;
}

export function compareEvents(a: BinCollectionEvent, b: BinCollectionEvent): number {
  if (a.date !== b.date) {
    return a.date.localeCompare(b.date);
  }
  if (a.serviceId !== b.serviceId) {
    return a.serviceId.localeCompare(b.serviceId);
  }
  const nameDiff = a.serviceName.localeCompare(b.serviceName);
  if (nameDiff !== 0) {
    return nameDiff;
  }
  const scheduleDiff = a.schedule.localeCompare(b.schedule);
  if (scheduleDiff !== 0) {
    return scheduleDiff;
  }
  const roundDiff = a.round.localeCompare(b.round);
  if (roundDiff !== 0) {
    return roundDiff;
  }
  const dayDiff = a.dayName.localeCompare(b.dayName);
  if (dayDiff !== 0) {
    return dayDiff;
  }
  return a.readDate.localeCompare(b.readDate);
}
