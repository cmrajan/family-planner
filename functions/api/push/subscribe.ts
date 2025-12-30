import { jsonError, jsonOk } from "../../_lib/response";
import { Env } from "../../_lib/store";
import { getViewerInfo } from "../../_lib/auth";
import {
  getPushSubscriptions,
  savePushSubscriptions,
  upsertPushSubscription,
} from "../../_lib/push";
import { validatePushSubscribeRequest } from "../../_lib/pushValidation";
import { PushSubscribeRequest, PushSubscribeResponse } from "../../../src/domain/types";

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

  let body: PushSubscribeRequest;
  try {
    body = (await request.json()) as PushSubscribeRequest;
  } catch {
    return jsonError("INVALID_JSON", "Invalid JSON body", 400);
  }

  const errors = validatePushSubscribeRequest(body);
  if (errors.length > 0) {
    return jsonError("VALIDATION_FAILED", errors.join(","), 400);
  }

  const nowIso = new Date().toISOString();
  const userAgent = body.userAgent ?? request.headers.get("user-agent") ?? undefined;
  const list = await getPushSubscriptions(env, viewer.personId);
  const next = upsertPushSubscription(list, {
    deviceId: body.deviceId,
    subscription: body.subscription,
    userAgent,
    nowIso,
  });
  await savePushSubscriptions(env, viewer.personId, next);
  const response: PushSubscribeResponse = { stored: true, count: next.length };
  return jsonOk(response);
}
