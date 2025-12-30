import { Env } from "./store";
import { EXAMPLE_SCHOOL_DATES } from "./schoolDatesData";
import {
  schoolDatesKey,
  validateSchoolDatesDocument,
} from "../../src/shared/schoolDatesValidation";
import { SchoolDatesDocument } from "../../src/domain/types";

export async function getSchoolDates(
  env: Env,
  schoolSlug: string
): Promise<SchoolDatesDocument | null> {
  return await env.FAMILY_PLANNER_KV.get(schoolDatesKey(schoolSlug), "json");
}

export async function getOrCreateSchoolDates(
  env: Env,
  schoolSlug: string
): Promise<SchoolDatesDocument> {
  const existing = await getSchoolDates(env, schoolSlug);
  if (existing) {
    return existing;
  }
  const seed = getSeedDocument(schoolSlug);
  if (!seed) {
    throw new Error("school_not_found");
  }
  const errors = validateSchoolDatesDocument(seed);
  if (errors.length > 0) {
    throw new Error(`school_dates_invalid:${errors.join(",")}`);
  }
  await env.FAMILY_PLANNER_KV.put(schoolDatesKey(schoolSlug), JSON.stringify(seed));
  return seed;
}

function getSeedDocument(schoolSlug: string): SchoolDatesDocument | null {
  if (schoolSlug === "example-school") {
    return EXAMPLE_SCHOOL_DATES;
  }
  return null;
}
