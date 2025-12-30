import { jsonError, jsonOk } from "../../_lib/response";
import { Env } from "../../_lib/store";
import { getViewerInfo } from "../../_lib/auth";
import {
  getPushSubscriptions,
  removePushSubscription,
  savePushSubscriptions,
} from "../../_lib/push";
import { validatePushUnsubscribeRequest } from "../../_lib/pushValidation";
import { PushUnsubscribeRequest } from "../../../src/domain/types";

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

  const viewer = getViewerInfo(request, env);
  if (!viewer?.personId) {
    return jsonError("UNAUTHORIZED", "Not permitted", 401);
  }

  let body: PushUnsubscribeRequest;
  try {
    body = (await request.json()) as PushUnsubscribeRequest;
  } catch {
    return jsonError("INVALID_JSON", "Invalid JSON body", 400);
  }

  const errors = validatePushUnsubscribeRequest(body);
  if (errors.length > 0) {
    return jsonError("VALIDATION_FAILED", errors.join(","), 400);
  }

  const list = await getPushSubscriptions(env, viewer.personId);
  const { list: next, removed } = removePushSubscription(list, {
    deviceId: body.deviceId,
    endpoint: body.endpoint,
  });
  if (removed > 0) {
    await savePushSubscriptions(env, viewer.personId, next);
  }
  return jsonOk({ removed, count: next.length });
}
