import {
  UniversalAddMode,
  UniversalAddParseRequest,
  UniversalAddParseResult,
  UniversalAddParseEvent,
  UniversalAddParseTodo,
  PersonId,
  EventTag,
  Effort,
} from "../../../src/domain/types";
import { jsonError, jsonOk } from "../../_lib/response";
import { Env } from "../../_lib/store";
import { parseWeekId, PEOPLE } from "../../_lib/week";

const TIMEZONE = "Europe/London" as const;
const MAX_TEXT_LENGTH = 500;
const MAX_TITLE_LENGTH = 140;
const MAX_LOCATION_LENGTH = 80;
const TAGS: EventTag[] = ["school", "sport", "family", "work", "other", "recurring"];
const EFFORTS: Effort[] = ["5m", "15m", "30m", "1h+"];
const MODES: UniversalAddMode[] = ["auto", "event", "todo"];
const CONFIDENCE_LEVELS: UniversalAddParseResult["confidence"][] = [
  "high",
  "medium",
  "low",
];

interface ValidatedRequest {
  value: UniversalAddParseRequest;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isValidTime(value: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return false;
  }
  const [hour, minute] = value.split(":").map(Number);
  return (
    Number.isInteger(hour) &&
    Number.isInteger(minute) &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59
  );
}

function parseRequest(body: unknown): ValidatedRequest | { error: string } {
  if (!isRecord(body)) {
    return { error: "Body must be an object" };
  }

  const rawText = typeof body.text === "string" ? body.text : "";
  const text = rawText.trim();
  if (!text || text.length > MAX_TEXT_LENGTH) {
    return { error: "Text must be between 1 and 500 characters" };
  }

  const mode = typeof body.mode === "string" ? body.mode : "";
  if (!MODES.includes(mode as UniversalAddMode)) {
    return { error: "Mode is invalid" };
  }

  const timezone = body.timezone;
  if (timezone !== TIMEZONE) {
    return { error: "Timezone must be Europe/London" };
  }

  const nowIso = typeof body.nowIso === "string" ? body.nowIso : "";
  if (!nowIso || Number.isNaN(Date.parse(nowIso))) {
    return { error: "nowIso is invalid" };
  }

  const rawWeekId = typeof body.currentWeekId === "string" ? body.currentWeekId : "";
  const currentWeekId = rawWeekId.trim().toUpperCase();
  if (!parseWeekId(currentWeekId)) {
    return { error: "currentWeekId is invalid" };
  }

  const rawPeople = body.people;
  if (!Array.isArray(rawPeople) || rawPeople.length === 0) {
    return { error: "people is invalid" };
  }
  const people: PersonId[] = [];
  for (const person of rawPeople) {
    if (typeof person !== "string" || !PEOPLE.includes(person as PersonId)) {
      return { error: "people contains invalid entries" };
    }
    people.push(person as PersonId);
  }

  const defaultOwner = typeof body.defaultOwner === "string" ? body.defaultOwner : "";
  if (!PEOPLE.includes(defaultOwner as PersonId)) {
    return { error: "defaultOwner is invalid" };
  }
  if (!people.includes(defaultOwner as PersonId)) {
    return { error: "defaultOwner must be in people" };
  }

  return {
    value: {
      text,
      mode: mode as UniversalAddMode,
      timezone: TIMEZONE,
      nowIso,
      defaultOwner: defaultOwner as PersonId,
      people,
      currentWeekId,
    },
  };
}

function parseOptionalString(
  value: unknown,
  maxLength: number
): string | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    return null;
  }
  return trimmed;
}

function parseRequiredString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    return null;
  }
  return trimmed;
}

function parsePersonArray(value: unknown, people: PersonId[]): PersonId[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const result: PersonId[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !people.includes(entry as PersonId)) {
      return null;
    }
    result.push(entry as PersonId);
  }
  return result;
}

function parseEvent(value: unknown, people: PersonId[]): UniversalAddParseEvent | null {
  if (!isRecord(value)) {
    return null;
  }
  if (value.kind !== "event") {
    return null;
  }
  const title = parseRequiredString(value.title, MAX_TITLE_LENGTH);
  if (!title) {
    return null;
  }
  const who = parsePersonArray(value.who, people);
  if (!who) {
    return null;
  }

  const date = parseOptionalString(value.date, 10);
  if (date === null || (date && !isValidIsoDate(date))) {
    return null;
  }
  const dayValue = value.day;
  const day =
    dayValue === undefined
      ? undefined
      : Number.isInteger(dayValue)
      ? (dayValue as number)
      : null;
  if (day === null || (day !== undefined && (day < 0 || day > 6))) {
    return null;
  }

  const time = parseOptionalString(value.time, 5);
  if (time === null || (time && !isValidTime(time))) {
    return null;
  }

  const location = parseOptionalString(value.location, MAX_LOCATION_LENGTH);
  if (location === null) {
    return null;
  }

  const tagValue = value.tag;
  if (tagValue !== undefined && (!tagValue || !TAGS.includes(tagValue as EventTag))) {
    return null;
  }
  const tag = tagValue ? (tagValue as EventTag) : undefined;

  return {
    kind: "event",
    title,
    date,
    day,
    time: time || undefined,
    location: location || undefined,
    who,
    tag,
  };
}

function parseTodo(value: unknown, people: PersonId[]): UniversalAddParseTodo | null {
  if (!isRecord(value)) {
    return null;
  }
  if (value.kind !== "todo") {
    return null;
  }
  const title = parseRequiredString(value.title, MAX_TITLE_LENGTH);
  if (!title) {
    return null;
  }
  const ownerValue = value.owner;
  if (typeof ownerValue !== "string" || !people.includes(ownerValue as PersonId)) {
    return null;
  }
  const owner = ownerValue as PersonId;

  const effortValue = value.effort;
  if (effortValue !== undefined && (!effortValue || !EFFORTS.includes(effortValue as Effort))) {
    return null;
  }
  const effort = effortValue ? (effortValue as Effort) : undefined;

  return {
    kind: "todo",
    title,
    owner,
    effort,
  };
}

function parseResult(
  value: unknown,
  people: PersonId[]
): UniversalAddParseResult | null {
  if (!isRecord(value)) {
    return null;
  }
  const kind = value.kind;
  if (kind !== "event" && kind !== "todo") {
    return null;
  }
  const confidence = value.confidence;
  if (!CONFIDENCE_LEVELS.includes(confidence as UniversalAddParseResult["confidence"])) {
    return null;
  }
  const reasoning = parseOptionalString(value.reasoning, 240);
  if (reasoning === null) {
    return null;
  }

  if (kind === "event") {
    const event = parseEvent(value.event, people);
    if (!event) {
      return null;
    }
    return {
      kind,
      confidence: confidence as UniversalAddParseResult["confidence"],
      reasoning,
      event,
    };
  }

  const todo = parseTodo(value.todo, people);
  if (!todo) {
    return null;
  }
  return {
    kind,
    confidence: confidence as UniversalAddParseResult["confidence"],
    reasoning,
    todo,
  };
}

function buildPrompt(request: UniversalAddParseRequest): string {
  return [
    "You are a strict JSON generator.",
    "Return only JSON with no extra text or markdown.",
    "Output must match the schema exactly:",
    "UniversalAddParseResult: { kind: \"event\"|\"todo\", confidence: \"high\"|\"medium\"|\"low\", reasoning?: string, event?: UniversalAddParseEvent, todo?: UniversalAddParseTodo }",
    "UniversalAddParseEvent: { kind: \"event\", title: string, date?: YYYY-MM-DD, day?: 0..6 (Mon=0..Sun=6), time?: HH:MM, location?: string, who: PersonId[], tag?: EventTag }",
    "UniversalAddParseTodo: { kind: \"todo\", title: string, owner: PersonId, effort?: Effort }",
    "Rules:",
    "- If mode is event, kind must be event. If mode is todo, kind must be todo.",
    "- Prefer date when a specific date is mentioned.",
    "- Use 24-hour time HH:MM when time is present.",
    "- who is required; use [] for Everyone/unspecified.",
    "- If todo owner is unclear, use defaultOwner.",
    "- title must be <= 140 chars; location <= 80 chars.",
    "- If unsure, set confidence to low and omit optional fields.",
    "Allowed enums:",
    `PersonId: ${JSON.stringify(request.people)}`,
    `EventTag: ${JSON.stringify(TAGS)}`,
    `Effort: ${JSON.stringify(EFFORTS)}`,
    "Input:",
    `text: ${JSON.stringify(request.text)}`,
    `mode: ${request.mode}`,
    `timezone: ${request.timezone}`,
    `nowIso: ${request.nowIso}`,
    `currentWeekId: ${request.currentWeekId}`,
    `defaultOwner: ${request.defaultOwner}`,
  ].join("\n");
}

function extractCandidateText(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }
  const candidates = payload.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }
  const candidate = candidates[0];
  if (!isRecord(candidate)) {
    return null;
  }
  const content = candidate.content;
  if (!isRecord(content)) {
    return null;
  }
  const parts = content.parts;
  if (!Array.isArray(parts)) {
    return null;
  }
  for (const part of parts) {
    if (isRecord(part) && typeof part.text === "string") {
      return part.text;
    }
  }
  return null;
}

function parseJsonFromText(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const slice = trimmed.slice(start, end + 1);
      try {
        return JSON.parse(slice);
      } catch {
        return null;
      }
    }
  }
  return null;
}

export async function onRequest({
  request,
  env,
}: {
  request: Request;
  env: Env;
}) {
  if (request.method !== "POST") {
    return jsonError("METHOD_NOT_ALLOWED", "Method not allowed", 405);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("INVALID_JSON", "Invalid JSON body", 400);
  }

  const parsed = parseRequest(body);
  if ("error" in parsed) {
    return jsonError("INVALID_REQUEST", parsed.error, 400);
  }

  if (!env.GEMINI_API_KEY) {
    return jsonError("GEMINI_UPSTREAM", "Gemini API key missing", 502);
  }

  const model = env.GEMINI_MODEL || "gemini-1.5-flash";
  const prompt = buildPrompt(parsed.value);

  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
          },
        }),
      }
    );
  } catch {
    return jsonError("GEMINI_UPSTREAM", "Gemini request failed", 502);
  }

  if (!response.ok) {
    return jsonError("GEMINI_UPSTREAM", "Gemini request failed", 502);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return jsonError("GEMINI_UPSTREAM", "Gemini response invalid", 502);
  }

  const text = extractCandidateText(payload);
  if (!text) {
    return jsonError("PARSE_FAILED", "No response content", 500);
  }

  const jsonValue = parseJsonFromText(text);
  const result = jsonValue ? parseResult(jsonValue, parsed.value.people) : null;
  if (!result) {
    return jsonError("PARSE_FAILED", "Unable to parse response", 500);
  }
  if (parsed.value.mode === "event" && result.kind !== "event") {
    return jsonError("PARSE_FAILED", "Result kind mismatch", 500);
  }
  if (parsed.value.mode === "todo" && result.kind !== "todo") {
    return jsonError("PARSE_FAILED", "Result kind mismatch", 500);
  }

  return jsonOk(result);
}
