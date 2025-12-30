import { PersonId, ViewerInfo } from "../../src/domain/types";
import { Env } from "./store";

const PERSON_IDS: PersonId[] = ["mum", "dad", "son"];

function isPersonId(value: string): value is PersonId {
  return PERSON_IDS.includes(value as PersonId);
}

function parseUserEmailMap(raw?: string): Record<string, PersonId> | null {
  if (!raw || !raw.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const result: Record<string, PersonId> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const email = key.trim().toLowerCase();
      if (!email) {
        continue;
      }
      if (typeof value === "string" && isPersonId(value)) {
        result[email] = value;
      }
    }
    return Object.keys(result).length > 0 ? result : null;
  } catch {
    console.warn("Invalid USER_EMAIL_MAP JSON.");
    return null;
  }
}

function getViewerEmail(request: Request, env: Env): string | null {
  const headerEmail = request.headers.get("cf-access-authenticated-user-email");
  if (headerEmail && headerEmail.trim()) {
    return headerEmail.trim();
  }
  if (env.DEV_USER_EMAIL && env.DEV_USER_EMAIL.trim()) {
    return env.DEV_USER_EMAIL.trim();
  }
  return null;
}

export function getViewerInfo(
  request: Request,
  env: Env,
  people?: PersonId[]
): ViewerInfo | null {
  const rawEmail = getViewerEmail(request, env);
  if (!rawEmail) {
    return null;
  }
  const email = rawEmail.toLowerCase();
  const map = parseUserEmailMap(env.USER_EMAIL_MAP);
  const mapped = map?.[email];
  const personId =
    mapped && (!people || people.includes(mapped)) ? mapped : undefined;
  return { email, personId };
}
