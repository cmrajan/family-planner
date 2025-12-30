import { jsonError, jsonOk } from "../_lib/response";
import { getOrCreateTodos, getTodos, putTodos, Env } from "../_lib/store";
import { validateTodosDoc } from "../_lib/validate";
import { TodosDoc } from "../../src/domain/types";
import { getViewerInfo } from "../_lib/auth";
import { PEOPLE } from "../_lib/week";

export async function onRequest({
  request,
  env,
}: {
  request: Request;
  env: Env;
}) {
  if (request.method === "GET") {
    const doc = await getOrCreateTodos(env);
    const viewer = getViewerInfo(request, env, PEOPLE);
    return jsonOk({ doc, viewer });
  }

  if (request.method === "PUT") {
    let body: TodosDoc;
    try {
      body = (await request.json()) as TodosDoc;
    } catch {
      return jsonError("INVALID_JSON", "Invalid JSON body", 400);
    }

    const errors = validateTodosDoc(body);
    if (errors.length > 0) {
      return jsonError("VALIDATION_FAILED", errors.join(","), 400);
    }

    const stored = (await getTodos(env)) ?? (await getOrCreateTodos(env));
    const headerVersion = request.headers.get("If-Match-Version");
    const headerValue = headerVersion ? Number(headerVersion) : undefined;
    const bodyValue = body.version;
    if (stored.version !== headerValue && stored.version !== bodyValue) {
      return jsonError("VERSION_CONFLICT", "Todos updated elsewhere", 409);
    }

    const updated: TodosDoc = {
      ...body,
      version: stored.version + 1,
      updatedAt: new Date().toISOString(),
    };

    await putTodos(env, updated);
    return jsonOk(updated);
  }

  return jsonError("METHOD_NOT_ALLOWED", "Method not allowed", 405);
}
