import { jsonError, jsonOk } from "../_lib/response";
import { getOrCreateSchoolDates } from "../_lib/schoolDates";
import { Env } from "../_lib/store";

export async function onRequest({
  env,
  request,
}: {
  env: Env;
  request: Request;
}) {
  if (request.method !== "GET") {
    return jsonError("METHOD_NOT_ALLOWED", "Method not allowed", 405);
  }
  const url = new URL(request.url);
  const school = url.searchParams.get("school");
  if (!school) {
    return jsonError("SCHOOL_REQUIRED", "School is required", 400);
  }
  try {
    const doc = await getOrCreateSchoolDates(env, school);
    return jsonOk(doc);
  } catch (error) {
    if (error instanceof Error && error.message === "school_not_found") {
      return jsonError("SCHOOL_NOT_FOUND", "School not found", 404);
    }
    return jsonError("SCHOOL_DATES_ERROR", "Unable to load school dates", 500);
  }
}
