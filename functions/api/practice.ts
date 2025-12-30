import { jsonError, jsonOk } from "../_lib/response";
import { getPractice, getOrCreatePractice, putPractice, Env } from "../_lib/store";
import { normalizePracticeDoc } from "../_lib/practice";
import { validatePracticeDoc } from "../_lib/validate";
import { PracticeDoc } from "../../src/domain/types";

export async function onRequest({
  request,
  env,
}: {
  request: Request;
  env: Env;
}) {
  if (request.method === "GET") {
    const doc = normalizePracticeDoc(await getOrCreatePractice(env));
    return jsonOk({ doc });
  }

  if (request.method === "PUT") {
    const headerVersion = request.headers.get("If-Match-Version");
    if (!headerVersion) {
      return jsonError(
        "VALIDATION_FAILED",
        "If-Match-Version header is required",
        400
      );
    }
    const headerValue = Number(headerVersion);
    if (!Number.isInteger(headerValue)) {
      return jsonError(
        "VALIDATION_FAILED",
        "If-Match-Version header is invalid",
        400
      );
    }

    let body: PracticeDoc;
    try {
      body = (await request.json()) as PracticeDoc;
    } catch {
      return jsonError("INVALID_JSON", "Invalid JSON body", 400);
    }

    const normalized = normalizePracticeDoc(body);
    const errors = validatePracticeDoc(normalized);
    if (errors.length > 0) {
      return jsonError("VALIDATION_FAILED", errors.join(","), 400);
    }

    const stored = (await getPractice(env)) ?? (await getOrCreatePractice(env));
    if (stored.version !== headerValue || stored.version !== normalized.version) {
      return jsonError(
        "VERSION_CONFLICT",
        "Practice doc updated elsewhere",
        409
      );
    }

    const updated: PracticeDoc = {
      ...normalized,
      version: stored.version + 1,
      updatedAt: new Date().toISOString(),
    };

    await putPractice(env, updated);
    return jsonOk(updated);
  }

  return jsonError("METHOD_NOT_ALLOWED", "Method not allowed", 405);
}
