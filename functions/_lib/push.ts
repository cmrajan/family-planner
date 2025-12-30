import {
  type PushMessage,
  type PushSubscription,
  type VapidKeys,
  buildPushPayload,
} from "@block65/webcrypto-web-push";
import {
  PersonId,
  PushMessagePayload,
  WebPushSubscriptionJson,
} from "../../src/domain/types";
import { Env } from "./store";

const MAX_SUBSCRIPTIONS_PER_PERSON = 50;

export interface StoredPushSubscription extends WebPushSubscriptionJson {
  deviceId: string;
  createdAt: string;
  updatedAt: string;
  userAgent?: string;
}

export function pushSubsKey(personId: PersonId): string {
  return `push_subs:v1:${personId}`;
}

export function pushSentKey(options: {
  personId: PersonId;
  weekId: string;
  eventId: string;
  leadMinutes: number;
  day: number;
  time: string;
}): string {
  const { personId, weekId, eventId, leadMinutes, day, time } = options;
  return `push_sent:v1:${personId}:${weekId}:${eventId}:m${leadMinutes}:d${day}:t${time}`;
}

export function pushPracticeSentKey(options: {
  personId: PersonId;
  weekId: string;
  day: number;
  time: string;
}): string {
  const { personId, weekId, day, time } = options;
  return `push_sent:v1:practice:${personId}:${weekId}:d${day}:t${time}`;
}

export async function getPushSubscriptions(
  env: Env,
  personId: PersonId
): Promise<StoredPushSubscription[]> {
  const raw = await env.FAMILY_PLANNER_KV.get(pushSubsKey(personId), "json");
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(isStoredPushSubscription);
}

export async function savePushSubscriptions(
  env: Env,
  personId: PersonId,
  list: StoredPushSubscription[]
): Promise<void> {
  await env.FAMILY_PLANNER_KV.put(pushSubsKey(personId), JSON.stringify(list));
}

export function upsertPushSubscription(
  list: StoredPushSubscription[],
  input: {
    deviceId: string;
    subscription: WebPushSubscriptionJson;
    userAgent?: string;
    nowIso: string;
  }
): StoredPushSubscription[] {
  const { deviceId, subscription, userAgent, nowIso } = input;
  const next = [...list];
  const index = next.findIndex(
    (item) =>
      item.deviceId === deviceId || item.endpoint === subscription.endpoint
  );
  if (index >= 0) {
    const existing = next[index];
    next[index] = {
      ...existing,
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      updatedAt: nowIso,
      userAgent: userAgent ?? existing.userAgent,
    };
  } else {
    next.push({
      deviceId,
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      createdAt: nowIso,
      updatedAt: nowIso,
      userAgent,
    });
  }
  return trimSubscriptions(next);
}

export function removePushSubscription(
  list: StoredPushSubscription[],
  criteria: { deviceId?: string; endpoint?: string }
): { list: StoredPushSubscription[]; removed: number } {
  const { deviceId, endpoint } = criteria;
  if (!deviceId && !endpoint) {
    return { list, removed: 0 };
  }
  const filtered = list.filter((item) => {
    if (deviceId && item.deviceId === deviceId) {
      return false;
    }
    if (endpoint && item.endpoint === endpoint) {
      return false;
    }
    return true;
  });
  return { list: filtered, removed: list.length - filtered.length };
}

export function requireVapidKeys(env: Env): VapidKeys {
  if (!env.PUSH_VAPID_PUBLIC_KEY || !env.PUSH_VAPID_PRIVATE_KEY) {
    throw new Error("Push VAPID keys not configured.");
  }
  const subject = env.PUSH_VAPID_SUBJECT?.trim();
  if (!subject) {
    throw new Error("Push VAPID subject not configured.");
  }
  return {
    subject,
    publicKey: env.PUSH_VAPID_PUBLIC_KEY,
    privateKey: env.PUSH_VAPID_PRIVATE_KEY,
  };
}

export async function sendPushToSubscription(
  env: Env,
  subscription: StoredPushSubscription,
  payload: PushMessagePayload,
  vapidOverride?: VapidKeys
): Promise<Response> {
  const vapid = vapidOverride ?? requireVapidKeys(env);
  const pushSubscription: PushSubscription = {
    endpoint: subscription.endpoint,
    expirationTime: null,
    keys: subscription.keys,
  };
  const message: PushMessage = {
    data: payload as unknown as Record<string, string>,
    options: {
      ttl: 60,
    },
  };
  const requestInit = await buildPushPayload(message, pushSubscription, vapid);
  const init: RequestInit = {
    ...requestInit,
    body: requestInit.body as BodyInit,
  };
  return fetch(pushSubscription.endpoint, init);
}

export async function sendPushToPerson(
  env: Env,
  personId: PersonId,
  payload: PushMessagePayload
): Promise<{ attempted: number; sent: number; removed: number }> {
  const list = await getPushSubscriptions(env, personId);
  if (list.length === 0) {
    return { attempted: 0, sent: 0, removed: 0 };
  }
  const result = await sendPushToSubscriptions(env, list, payload);
  let removed = 0;
  if (result.staleEndpoints.size > 0) {
    const next = list.filter(
      (item) => !result.staleEndpoints.has(item.endpoint)
    );
    removed = list.length - next.length;
    await savePushSubscriptions(env, personId, next);
  }
  return { attempted: result.attempted, sent: result.sent, removed };
}

export async function sendPushToSubscriptions(
  env: Env,
  list: StoredPushSubscription[],
  payload: PushMessagePayload
): Promise<{
  attempted: number;
  sent: number;
  staleEndpoints: Set<string>;
}> {
  const vapid = requireVapidKeys(env);
  let sent = 0;
  const staleEndpoints = new Set<string>();
  for (const subscription of list) {
    try {
      const response = await sendPushToSubscription(
        env,
        subscription,
        payload,
        vapid
      );
      if (response.ok) {
        sent += 1;
      } else if (response.status === 404 || response.status === 410) {
        staleEndpoints.add(subscription.endpoint);
      }
    } catch (error) {
      console.warn("[push] send failed", error);
    }
  }
  return { attempted: list.length, sent, staleEndpoints };
}

function isStoredPushSubscription(value: unknown): value is StoredPushSubscription {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as StoredPushSubscription;
  return (
    typeof record.deviceId === "string" &&
    typeof record.endpoint === "string" &&
    typeof record.createdAt === "string" &&
    typeof record.updatedAt === "string" &&
    Boolean(record.keys) &&
    typeof record.keys.p256dh === "string" &&
    typeof record.keys.auth === "string"
  );
}

function trimSubscriptions(
  list: StoredPushSubscription[]
): StoredPushSubscription[] {
  if (list.length <= MAX_SUBSCRIPTIONS_PER_PERSON) {
    return list;
  }
  const sorted = [...list].sort((a, b) => {
    const aTime = Date.parse(a.updatedAt || a.createdAt || "");
    const bTime = Date.parse(b.updatedAt || b.createdAt || "");
    if (!Number.isNaN(aTime) && !Number.isNaN(bTime)) {
      return aTime - bTime;
    }
    return 0;
  });
  return sorted.slice(sorted.length - MAX_SUBSCRIPTIONS_PER_PERSON);
}
