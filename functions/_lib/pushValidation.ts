import {
  PushSubscribeRequest,
  PushTestRequest,
  PushUnsubscribeRequest,
  WebPushSubscriptionJson,
} from "../../src/domain/types";

const MAX_ENDPOINT_LENGTH = 2000;
const MAX_KEY_LENGTH = 512;
const MAX_DEVICE_ID_LENGTH = 120;

export function validatePushSubscribeRequest(
  body: PushSubscribeRequest
): string[] {
  const errors: string[] = [];
  if (!body || typeof body !== "object") {
    return ["push_body_invalid"];
  }
  if (!isValidDeviceId(body.deviceId)) {
    errors.push("device_id_invalid");
  }
  if (!body.subscription || typeof body.subscription !== "object") {
    errors.push("subscription_invalid");
  } else {
    errors.push(...validateSubscription(body.subscription));
  }
  if (body.userAgent !== undefined && typeof body.userAgent !== "string") {
    errors.push("user_agent_invalid");
  }
  return errors;
}

export function validatePushUnsubscribeRequest(
  body: PushUnsubscribeRequest
): string[] {
  const errors: string[] = [];
  if (!body || typeof body !== "object") {
    return ["push_body_invalid"];
  }
  if (body.deviceId !== undefined && !isValidDeviceId(body.deviceId)) {
    errors.push("device_id_invalid");
  }
  if (body.endpoint !== undefined && !isValidEndpoint(body.endpoint)) {
    errors.push("endpoint_invalid");
  }
  if (!body.deviceId && !body.endpoint) {
    errors.push("unsubscribe_target_missing");
  }
  return errors;
}

export function validatePushTestRequest(body: PushTestRequest): string[] {
  const errors: string[] = [];
  if (!body || typeof body !== "object") {
    return ["push_body_invalid"];
  }
  if (!isValidDeviceId(body.deviceId)) {
    errors.push("device_id_invalid");
  }
  return errors;
}

function validateSubscription(subscription: WebPushSubscriptionJson): string[] {
  const errors: string[] = [];
  if (!isValidEndpoint(subscription.endpoint)) {
    errors.push("endpoint_invalid");
  }
  if (!subscription.keys || typeof subscription.keys !== "object") {
    errors.push("keys_invalid");
  } else {
    if (!isValidKey(subscription.keys.p256dh)) {
      errors.push("keys_invalid");
    }
    if (!isValidKey(subscription.keys.auth)) {
      errors.push("keys_invalid");
    }
  }
  return errors;
}

function isValidEndpoint(value: string | undefined): boolean {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ENDPOINT_LENGTH
  );
}

function isValidKey(value: string | undefined): boolean {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_KEY_LENGTH
  );
}

function isValidDeviceId(value: string | undefined): boolean {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_DEVICE_ID_LENGTH
  );
}
