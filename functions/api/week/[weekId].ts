import { getArchive, getOrCreateWeek, getWeek, putWeek, Env } from "../../_lib/store";
import { jsonError, jsonOk } from "../../_lib/response";
import { validateWeekDoc } from "../../_lib/validate";
import { parseWeekId } from "../../_lib/week";
import { WeekDoc } from "../../../src/domain/types";
import { getViewerInfo } from "../../_lib/auth";

export async function onRequest({
  request,
  params,
  env,
}: {
  request: Request;
  params: { weekId: string };
  env: Env;
}) {
  const weekId = params.weekId;
  if (!parseWeekId(weekId)) {
    return jsonError("INVALID_WEEK_ID", "Week ID is invalid", 400);
  }

  if (request.method === "GET") {
    const archived = await getArchive(env, weekId);
    const week = archived ?? (await getOrCreateWeek(env, weekId));
    const viewer = getViewerInfo(request, env, week.people);
    return jsonOk({ week, readOnly: Boolean(archived), viewer });
  }

  if (request.method === "PUT") {
    const archived = await getArchive(env, weekId);
    if (archived) {
      return jsonError("ARCHIVED_READONLY", "Archived weeks are read-only", 403);
    }

    let body: WeekDoc;
    try {
      body = (await request.json()) as WeekDoc;
    } catch {
      return jsonError("INVALID_JSON", "Invalid JSON body", 400);
    }

    const errors = validateWeekDoc(body, weekId);
    if (errors.length > 0) {
      return jsonError("VALIDATION_FAILED", errors.join(","), 400);
    }

    const stored = (await getWeek(env, weekId)) ?? (await getOrCreateWeek(env, weekId));

    const headerVersion = request.headers.get("If-Match-Version");
    const headerValue = headerVersion ? Number(headerVersion) : undefined;
    const bodyValue = body.version;
    if (stored.version !== headerValue && stored.version !== bodyValue) {
      return jsonError(
        "VERSION_CONFLICT",
        "Week has been updated elsewhere",
        409
      );
    }

    const updated: WeekDoc = {
      ...body,
      version: stored.version + 1,
      updatedAt: new Date().toISOString(),
    };

    await putWeek(env, updated);
    return jsonOk(updated);
  }

  return jsonError("METHOD_NOT_ALLOWED", "Method not allowed", 405);
}
