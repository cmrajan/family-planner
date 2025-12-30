import { jsonError } from "../../_lib/response";
import { Env } from "../../_lib/store";
import { refreshSchoolDates } from "../../../src/shared/schoolDatesRefresh";

export async function onRequest({ env, request }: { env: Env; request: Request }) {
  if (request.method !== "POST") {
    return jsonError("METHOD_NOT_ALLOWED", "Method not allowed", 405);
  }
  const url = new URL(request.url);
  const school = url.searchParams.get("school");
  if (!school) {
    return jsonError("SCHOOL_REQUIRED", "School is required", 400);
  }
  const configuredSchool = (env.SCHOOL_DATES_SCHOOL_SLUG ?? "example-school").trim();
  if (school !== configuredSchool) {
    return jsonError("SCHOOL_NOT_FOUND", "School not found", 400);
  }
  if (!env.SCHOOL_DATES_SOURCE_URL) {
    return jsonError(
      "SCHOOL_DATES_NOT_CONFIGURED",
      "SCHOOL_DATES_SOURCE_URL is required",
      400
    );
  }
  try {
    const result = await refreshSchoolDates({ env });
    return jsonResponse({
      ok: true,
      updated: result.updated,
      school,
      fetchedAt: result.fetchedAt,
      items: result.items,
      academicYears: result.academicYears,
    });
  } catch (error) {
    console.log("School dates refresh failed", error);
    return jsonError("SCHOOL_DATES_REFRESH_FAILED", "Unable to refresh school dates", 500);
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
