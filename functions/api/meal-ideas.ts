import { jsonError, jsonOk } from "../_lib/response";
import { getMealIdeas, getOrCreateMealIdeas, putMealIdeas, Env } from "../_lib/store";
import { validateMealIdeasDoc } from "../_lib/validate";
import { MealIdeasDoc } from "../../src/domain/types";

export async function onRequest({
  request,
  env,
}: {
  request: Request;
  env: Env;
}) {
  if (request.method === "GET") {
    const doc = await getOrCreateMealIdeas(env);
    return jsonOk(doc);
  }

  if (request.method === "PUT") {
    let body: MealIdeasDoc;
    try {
      body = (await request.json()) as MealIdeasDoc;
    } catch {
      return jsonError("INVALID_JSON", "Invalid JSON body", 400);
    }

    const errors = validateMealIdeasDoc(body);
    if (errors.length > 0) {
      return jsonError("VALIDATION_FAILED", errors.join(","), 400);
    }

    const stored = (await getMealIdeas(env)) ?? (await getOrCreateMealIdeas(env));
    const headerVersion = request.headers.get("If-Match-Version");
    const headerValue = headerVersion ? Number(headerVersion) : undefined;
    const bodyValue = body.version;
    if (stored.version !== headerValue && stored.version !== bodyValue) {
      return jsonError(
        "VERSION_CONFLICT",
        "Meal ideas updated elsewhere",
        409
      );
    }

    const updated: MealIdeasDoc = {
      ...body,
      version: stored.version + 1,
      updatedAt: new Date().toISOString(),
    };

    await putMealIdeas(env, updated);
    return jsonOk(updated);
  }

  return jsonError("METHOD_NOT_ALLOWED", "Method not allowed", 405);
}
