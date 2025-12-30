import { normalizeTimeInput } from "./time";

export interface QuickEventParseResult {
  title: string;
  time: string;
  location: string;
}

function parseTimeToken(token: string): string {
  const compact = token.trim().toLowerCase().replace(/\s+/g, "");
  if (!compact) {
    return "";
  }
  const ampmMatch = compact.match(/^(\d{1,2})(am|pm)$/);
  if (ampmMatch) {
    const hour = Number(ampmMatch[1]);
    const period = ampmMatch[2];
    if (!Number.isInteger(hour) || hour < 1 || hour > 12) {
      return "";
    }
    const hour24 = period === "pm" ? (hour % 12) + 12 : hour % 12;
    return `${String(hour24).padStart(2, "0")}:00`;
  }
  if (/^\d{1,2}[:.]\d{2}$/.test(compact)) {
    const normalized = normalizeTimeInput(compact.replace(".", ":"));
    return normalized ?? "";
  }
  if (/^\d{3,4}$/.test(compact)) {
    const normalized = normalizeTimeInput(compact);
    return normalized ?? "";
  }
  return "";
}

function extractTime(input: string): { time: string; rest: string } | null {
  const timePattern = /\b(\d{1,2}[:.]\d{2}|\d{3,4}|\d{1,2}\s?(?:am|pm))\b/gi;
  let match: RegExpExecArray | null = null;
  let lastMatch: RegExpExecArray | null = null;
  while ((match = timePattern.exec(input)) !== null) {
    const after = input.slice(match.index + match[0].length);
    if (!/^\s*$/.test(after) && !/^\s+@/.test(after)) {
      continue;
    }
    const normalized = parseTimeToken(match[0]);
    if (normalized) {
      lastMatch = match;
    }
  }
  if (!lastMatch) {
    return null;
  }
  const normalized = parseTimeToken(lastMatch[0]);
  if (!normalized) {
    return null;
  }
  const before = input.slice(0, lastMatch.index);
  const after = input.slice(lastMatch.index + lastMatch[0].length);
  const rest = `${before} ${after}`.replace(/\s+/g, " ").trim();
  return { time: normalized, rest };
}

function cleanTitle(input: string): string {
  return input.replace(/^[\s,.-]+|[\s,.-]+$/g, "").trim();
}

export function parseQuickEventInput(input: string): QuickEventParseResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { title: "", time: "", location: "" };
  }

  let working = trimmed;
  let time = "";
  const extracted = extractTime(working);
  if (extracted) {
    time = extracted.time;
    working = extracted.rest;
  }

  let location = "";
  const locationMatch = working.match(/(?:^|\s)@([^@]+)$/);
  if (locationMatch && locationMatch.index !== undefined) {
    location = locationMatch[1].trim();
    working = working.slice(0, locationMatch.index).trim();
  }

  const title = cleanTitle(working);
  return { title, time, location };
}
