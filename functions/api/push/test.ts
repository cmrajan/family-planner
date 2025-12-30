import { jsonError, jsonOk } from "../../_lib/response";
import { Env } from "../../_lib/store";
import { getViewerInfo } from "../../_lib/auth";
import {
  getPushSubscriptions,
  requireVapidKeys,
  savePushSubscriptions,
  sendPushToSubscriptions,
} from "../../_lib/push";
import { validatePushTestRequest } from "../../_lib/pushValidation";
import {
  PushMessagePayload,
  PushSendTestResponse,
  PushTestRequest,
} from "../../../src/domain/types";

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

  let body: PushTestRequest;
  try {
    body = (await request.json()) as PushTestRequest;
  } catch {
    return jsonError("INVALID_JSON", "Invalid JSON body", 400);
  }

  const errors = validatePushTestRequest(body);
  if (errors.length > 0) {
    return jsonError("VALIDATION_FAILED", errors.join(","), 400);
  }

  try {
    requireVapidKeys(env);
  } catch {
    return jsonError(
      "PUSH_NOT_CONFIGURED",
      "Push notifications are not configured",
      500
    );
  }

  const payload: PushMessagePayload = {
    title: "Family Planner",
    body: "Test notification",
    url: "/",
    tag: "test",
    timestamp: new Date().toISOString(),
  };
  const list = await getPushSubscriptions(env, viewer.personId);
  const targets = list.filter((item) => item.deviceId === body.deviceId);
  if (targets.length === 0) {
    return jsonError(
      "SUBSCRIPTION_NOT_FOUND",
      "No subscription found for this device",
      404
    );
  }
  const result = await sendPushToSubscriptions(env, targets, payload);
  let removed = 0;
  if (result.staleEndpoints.size > 0) {
    const next = list.filter(
      (item) => !result.staleEndpoints.has(item.endpoint)
    );
    removed = list.length - next.length;
    await savePushSubscriptions(env, viewer.personId, next);
  }
  const response: PushSendTestResponse = {
    attempted: result.attempted,
    sent: result.sent,
    removed,
  };
  return jsonOk(response);
}
