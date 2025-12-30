import { BinCollectionEvent, BinCollectionsDoc, BinServiceId } from "../domain/types";
import {
  binsKey,
  compareEvents,
  validateBinCollectionsDoc,
} from "./binCollectionsValidation";
import { isValidIsoDate } from "./schoolDatesValidation";

const USER_AGENT = "family-planner/bin-collections";
const MAX_FIELD_LENGTH = 200;
const TIMEZONE = "Europe/London";

export interface BinCollectionsRefreshContext {
  env: {
    FAMILY_PLANNER_KV: KVNamespace;
    BIN_COLLECTIONS_UPRN?: string;
    BIN_COLLECTIONS_SOURCE_BASE?: string;
  };
  fetchImpl?: typeof fetch;
  logger?: (message: string) => void;
  now?: () => Date;
}

export interface BinCollectionsRefreshResult {
  changed: boolean;
  doc: BinCollectionsDoc;
}

export class BinCollectionsRefreshError extends Error {
  code: "bins_source_fetch_failed" | "bins_source_invalid" | "bins_internal_error";
  status?: number;
  details?: string[];

  constructor(
    code: "bins_source_fetch_failed" | "bins_source_invalid" | "bins_internal_error",
    message: string,
    options: { status?: number; details?: string[] } = {}
  ) {
    super(message);
    this.code = code;
    this.status = options.status;
    this.details = options.details;
  }
}

export async function refreshBinCollections(
  context: BinCollectionsRefreshContext
): Promise<BinCollectionsRefreshResult> {
  const uprn = resolveRequiredValue(
    context.env.BIN_COLLECTIONS_UPRN,
    "BIN_COLLECTIONS_UPRN"
  );
  const sourceBase = resolveRequiredValue(
    context.env.BIN_COLLECTIONS_SOURCE_BASE,
    "BIN_COLLECTIONS_SOURCE_BASE"
  );
  const now = (context.now ?? (() => new Date()))();
  const range = buildDateRange(now);
  const url = buildUrl(sourceBase, uprn, range.rangeFrom, range.rangeTo);
  const fetcher = context.fetchImpl ?? fetch;
  const response = await fetcher(url, {
    headers: {
      "User-Agent": USER_AGENT,
    },
  });
  log(context, `Fetch status ${response.status}`);
  if (!response.ok) {
    throw new BinCollectionsRefreshError(
      "bins_source_fetch_failed",
      `Fetch failed: ${response.status}`,
      { status: response.status }
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new BinCollectionsRefreshError(
      "bins_source_invalid",
      "Invalid JSON payload",
      { details: [String(error)] }
    );
  }

  const events = normalizePayload(payload, uprn);
  const sortedEvents = [...events].sort(compareEvents);
  const sourceHash = await hashEvents(sortedEvents);
  const nextDoc: BinCollectionsDoc = {
    schemaVersion: 1,
    uprn,
    rangeFrom: range.rangeFrom,
    rangeTo: range.rangeTo,
    sourceHash,
    updatedAt: now.toISOString(),
    events: sortedEvents,
  };

  const validationErrors = validateBinCollectionsDoc(nextDoc);
  if (validationErrors.length > 0) {
    throw new BinCollectionsRefreshError(
      "bins_source_invalid",
      "Validation failed",
      { details: validationErrors }
    );
  }

  const key = binsKey(uprn);
  const existing = await context.env.FAMILY_PLANNER_KV.get<BinCollectionsDoc>(key, "json");
  if (existing?.sourceHash === sourceHash) {
    log(context, `Unchanged: ${events.length} event(s), hash ${sourceHash}`);
    return { changed: false, doc: existing };
  }

  await context.env.FAMILY_PLANNER_KV.put(key, JSON.stringify(nextDoc));
  log(context, `Updated KV: ${events.length} event(s), hash ${sourceHash}`);
  return { changed: true, doc: nextDoc };
}

function resolveRequiredValue(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (trimmed && trimmed.length > 0) {
    return trimmed;
  }
  throw new BinCollectionsRefreshError(
    "bins_internal_error",
    `${name} is required`
  );
}

function buildUrl(
  sourceBase: string,
  uprn: string,
  rangeFrom: string,
  rangeTo: string
): string {
  const params = new URLSearchParams({
    from_date: rangeFrom,
    to_date: rangeTo,
  });
  return `${sourceBase.replace(/\/+$/, "")}/${encodeURIComponent(uprn)}?${params.toString()}`;
}

function buildDateRange(now: Date): { rangeFrom: string; rangeTo: string } {
  const parts = getDatePartsInTimeZone(now, TIMEZONE);
  const base = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const rangeFrom = formatIsoDate(base);
  const rangeTo = addDays(base, 365);
  return { rangeFrom, rangeTo };
}

function addDays(base: Date, days: number): string {
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return formatIsoDate(next);
}

function formatIsoDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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

function normalizePayload(payload: unknown, expectedUprn: string): BinCollectionEvent[] {
  if (!payload || typeof payload !== "object") {
    throw new BinCollectionsRefreshError("bins_source_invalid", "Payload not an object");
  }
  const data = payload as Record<string, unknown>;
  const success = data.success === true;
  const errorCode = typeof data.error_code === "number" ? data.error_code : null;
  if (!success || errorCode !== 0) {
    throw new BinCollectionsRefreshError("bins_source_invalid", "Source error");
  }
  const uprnValue = normalizeUprn(data.uprn);
  if (!uprnValue || uprnValue !== expectedUprn) {
    throw new BinCollectionsRefreshError("bins_source_invalid", "UPRN mismatch");
  }
  if (!Array.isArray(data.collections)) {
    throw new BinCollectionsRefreshError("bins_source_invalid", "Collections missing");
  }

  const events: BinCollectionEvent[] = [];
  data.collections.forEach((item, index) => {
    try {
      events.push(normalizeCollection(item));
    } catch (error) {
      const message = error instanceof Error ? error.message : "collection_invalid";
      throw new BinCollectionsRefreshError("bins_source_invalid", message, {
        details: [`collection:${index}`],
      });
    }
  });

  if (events.length === 0) {
    throw new BinCollectionsRefreshError("bins_source_invalid", "No collections returned");
  }

  return events;
}

function normalizeCollection(item: unknown): BinCollectionEvent {
  if (!item || typeof item !== "object") {
    throw new Error("collection_not_object");
  }
  const value = item as Record<string, unknown>;
  const serviceName = requireString(value.service, "service");
  const round = requireString(value.round, "round");
  const schedule = requireString(value.schedule, "schedule");
  const dayName = requireString(value.day, "day");
  const readDate = requireString(value.read_date, "read_date");
  const dateInput = requireString(value.date, "date");
  const date = parseSourceDate(dateInput);
  if (!date) {
    throw new Error("date_invalid");
  }
  const serviceId = mapServiceId(serviceName);
  return {
    date,
    serviceId,
    serviceName,
    round,
    schedule,
    dayName,
    readDate,
  };
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label}_invalid`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label}_empty`);
  }
  if (trimmed.length > MAX_FIELD_LENGTH) {
    throw new Error(`${label}_too_long`);
  }
  return trimmed;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeUprn(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return normalizeString(value);
}

export function parseSourceDate(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})\s+\d{2}:\d{2}:\d{2}$/.exec(value);
  if (!match) {
    return null;
  }
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) {
    return null;
  }
  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (!isValidIsoDate(date)) {
    return null;
  }
  return date;
}

export function mapServiceId(serviceName: string): BinServiceId {
  if (serviceName === "Food Waste Collection Service") {
    return "food";
  }
  if (serviceName === "Recycling Collection Service") {
    return "recycling";
  }
  if (serviceName === "Domestic Waste Collection Service") {
    return "domestic";
  }
  if (serviceName === "Garden Waste Collection Service") {
    return "garden";
  }
  return "unknown";
}

async function hashEvents(events: BinCollectionEvent[]): Promise<string> {
  const canonical = events.map((event) => ({
    date: event.date,
    serviceId: event.serviceId,
    serviceName: event.serviceName,
    round: event.round,
    schedule: event.schedule,
    dayName: event.dayName,
    readDate: event.readDate,
  }));
  const json = JSON.stringify(canonical);
  return await hashString(json);
}

async function hashString(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  const bytes = new Uint8Array(hash);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function log(context: BinCollectionsRefreshContext, message: string) {
  if (context.logger) {
    context.logger(message);
  }
}
