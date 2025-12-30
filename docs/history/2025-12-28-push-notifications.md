# Push Notifications (2025-12-28)

Notification mechanism (web page)

Because this is a web app, there are two distinct notification paths:

    In-page notifications (tab open):
    Use the Notifications API plus setTimeout timers while the app is open. This can show alerts even without a service worker, but only while the page is active.

    Background notifications (tab closed):
    Use Service Workers + Push API (Web Push). This requires:

        HTTPS (required for push/notifications).

        User permission (Notification.requestPermission()).

        A service worker that subscribes to push and shows notifications.

        Server-side support to send push messages to the subscription endpoints (VAPID keys, store subscriptions in KV).

Important constraints in this repo:

    The initial spec explicitly lists push notifications as out of scope (`docs/history/2025-12-20-initial-spec.md`).

    The project rules say no background jobs/cron, so “send at a future time” requires either:

        The app being open (client-side timers), or

        Changing the rules to allow scheduled server-side delivery.

If you want true “remind me at X time even when the app is closed,” you will need to allow a scheduled worker or an external scheduler to trigger push sends.
Recommended notification settings

These settings align with the existing WeekDoc structure (people, who, owner) and help avoid surprises:
Recipients (“who gets notified”)

    Per-event recipients: use the existing who: PersonId[] on events.

    Default recipient: based on defaultOwner or current “me”.

    Per-device opt-in: each device can subscribe/unsubscribe independently.

    Role-based filters: “Only my items,” “Everyone on the event,” or “Family-wide.”

Timing (“when”)

    Lead time presets: 5, 15, 30, 60 minutes; 1 day.

    All-day timing: choose a default time (e.g., 08:00 local).

    Event start vs. reminder: optionally notify at start + lead time.

    Change notifications: notify if time/owner changes.

Quiet hours / DND

    Quiet hours: e.g., 21:00–07:00 (Europe/London).

    Weekend behavior: allow a separate weekend schedule.

Digest options

    Daily digest at a chosen time.

    Weekly digest for next week planning.

Notification channels

    In-app only vs. Push.

    Optional sound/vibration toggle (mobile).

If you want me to outline an implementation approach that stays within the current “no background jobs” rule (i.e., in-page only), or if you want to relax that constraint for real push reminders, say the word and I’ll propose a concrete plan.
Testing

Not run (read-only QA review).
Ok we can relax the constraint for proper push reminders. I do use cloud flare workers for getting bin data etc. could we use that for proper push? Or is there some other free cloud flare service that would help?

Below is a direct, repo‑aware answer about using Cloudflare for proper push notifications (background delivery when the tab is closed), and what free Cloudflare services are suitable.
Short answer: Yes, Cloudflare Workers can deliver Web Push

You can implement Web Push using Cloudflare Pages Functions / Workers to:

    Store subscriptions (in KV).

    Send push payloads using VAPID keys.

    Schedule deliveries via Cron Triggers (Workers) or an external scheduler.

This is the standard approach for “proper” push reminders. It does not require a separate paid service.
What Cloudflare services are useful?
✅ Cloudflare Workers + KV (what you already use)

    Best fit for server‑side push delivery.

    KV can store push subscription objects keyed by user/device.

    Workers can send Web Push messages to subscription endpoints.

This aligns with your current architecture (Pages Functions + KV). The existing repo assumes a KV binding and server functions already, so this is the natural place to add push delivery logic.
Reference: current repo design uses Pages Functions and KV for week documents and API responses.
Source: README.md (API + KV binding overview).【README.md】
✅ Cron Triggers (Workers feature)

    Use Cloudflare Cron Triggers to send scheduled notifications at fixed times.

    If you need per‑event exact scheduling (e.g., arbitrary time per event), you still need a scheduler that can evaluate the schedule frequently (e.g., every minute) and decide what to send.

✅ Cloudflare Queues (optional)

    If you want to “fan out” many notifications, Queues can help.

    Not strictly required for a small family planner.

Key decision: How to schedule reminders
Option A — Worker Cron (recommended)

How it works: A cron‑triggered Worker runs every minute (or 5 minutes), loads upcoming events, and sends notifications whose “reminder time” falls in that window.

Pros

    Fully within Cloudflare, no third‑party services.

    Works with free tier (within limits).

Cons

    You need to evaluate upcoming reminders repeatedly.

    Must design for idempotency (avoid duplicates).

Option B — External scheduler (not necessary but possible)

    Use something like GitHub Actions, or any hosted cron, to hit a Worker endpoint.

    Avoids Cloudflare cron constraints but adds moving parts.

What needs to change architecturally?

The initial spec explicitly said push notifications were out of scope for v1, which you’re now relaxing.
Source: `docs/history/2025-12-20-initial-spec.md` (“OUT OF SCOPE (v1) – Push notifications”).

To implement push:

    Frontend: request notification permission and subscribe to push.

    Backend: store subscriptions + send push payloads.

    Scheduler: run cron to dispatch reminders.

Practical settings recommendation (still applies)

Even with push enabled, I still recommend these defaults:

    Recipients: based on event who list (existing model).

    Default reminder: 15–30 minutes.

    All‑day reminders: 08:00 local time (Europe/London).

    Quiet hours: 21:00–07:00.

    Per‑device opt‑in: each browser/device can subscribe separately.

Next step if you want implementation

If you want me to implement it, I’ll propose a design that:

    Stores subscriptions in KV (e.g., pushsub:{personId}:{deviceId})

    Uses Cron Triggers to poll upcoming events and send notifications

    Adds explicit “notification preferences” to WeekDoc or a separate settings doc

Sources used

    README.md (Pages Functions + KV usage, API overview).【README.md】

    `docs/history/2025-12-20-initial-spec.md` (Push notifications originally out of scope).

---

# Review + Proposed Approach (my notes)

## Reality check vs this app

1. **Auto-save + PUT-on-every-edit makes “change push notifications” very noisy.** If we blindly push on every `PUT /api/week/:weekId`, family devices will get spammed. If we want “week updated” notifications, we should either:
   - make it **manual** (“Notify family” button), or
   - add **server-side throttling** (“max 1 every N minutes per week/person”), or
   - delay until the user is “done editing” (hard to define with auto-save).
2. **Scheduled reminders are the “real value” use-case**, and the repo already contains cron-triggered Workers under `workers/`, so adding one more worker is consistent with the existing pattern.
3. **Workers runtime + Web Push is totally viable**, but “doing Web Push properly” means VAPID + payload encryption. Implementing that from scratch is error-prone; a small Workers-compatible library is the boring/maintainable choice.

## Key design choices

- **Push transport:** Standard Web Push (Service Worker + Push API). No third-party notification service.
- **Server environment:** Cloudflare Pages Functions for subscribe/unsubscribe + “send test”, plus a **separate scheduled Worker** for reminders (Pages Functions don’t do cron).
- **Recipient model:** Use existing `PersonId` (mum/dad/son) and Cloudflare Access mapping (`USER_EMAIL_MAP`) to associate subscriptions to a person.
- **Reminder model v1 (simple):**
  - only timed events (`event.time` present)
  - default lead time = **15 minutes**
  - recipients = `event.who` (if empty, treat as “everyone”)
  - quiet hours optional (skip 21:00–07:00 London)

---

# Implementation Spec (hand to another agent)

This spec is intentionally “phaseable”: you can implement Phase 1 first (subscribe + test), then Phase 2 (scheduled reminders).

## Phase 1: Web Push subscribe/unsubscribe + test send

### 1) Add shared domain types (source of truth)

Update `src/domain/types.ts` with types used by both frontend and backend:

- `WebPushSubscriptionJson` (subset of the standard `PushSubscriptionJSON`)
- `PushSubscribeRequest`, `PushSubscribeResponse`
- `PushUnsubscribeRequest`
- `PushSendTestResponse`
- `PushMessagePayload` (the JSON payload shown by the service worker)

Keep these intentionally small and validated:
- `endpoint` max length (e.g. 2000)
- `keys.p256dh` and `keys.auth` required strings (base64url-ish)

### 2) KV storage shape

Add new KV keys (valid reason: push subscriptions are cross-week state):

- Per-person subscription list:
  - Key: `push_subs:v1:<personId>`
  - Value: JSON array of:
    - `deviceId: string` (client-generated UUID stored in localStorage)
    - `endpoint: string`
    - `keys: { p256dh: string; auth: string }`
    - `createdAt: string` (ISO)
    - `updatedAt: string` (ISO)
    - `userAgent?: string` (optional)
- Optional “unknown mapping” bucket (only if needed):
  - Key: `push_subs:v1:unmapped`

Notes:
- Keep the list small; cap at e.g. **50 subs per person** (cleanup oldest).
- On send failures (410/404), remove dead subscriptions from the list.

### 3) Backend endpoints (Pages Functions)

Create:

- `GET /api/push/vapid-public-key`
  - returns `{ publicKey: string }` (base64url), used by `PushManager.subscribe`.
  - Public key comes from env (see Cloudflare setup).
- `POST /api/push/subscribe`
  - body: `PushSubscribeRequest`
  - auth:
    - require a mapped viewer (`getViewerInfo(request, env, PEOPLE)` returns `{ personId }`)
    - local dev works via `DEV_USER_EMAIL` + `USER_EMAIL_MAP` in `.dev.vars`
  - upsert subscription into `push_subs:v1:<personId>` by `deviceId` (or `endpoint`).
- `POST /api/push/unsubscribe`
  - body: `PushUnsubscribeRequest` (at least `deviceId`)
  - removes from `push_subs:v1:<personId>` (viewer-mapped) and returns success even if missing.
- `POST /api/push/test`
  - sends a test push to the caller’s current `deviceId` (viewer-mapped person), returns counts `{ attempted, sent, removed }`

All responses must follow the existing `{ ok: true, data } / { ok: false, error }` shape and include explicit status codes.

### 4) Web Push sending implementation

Add dependency (small, Workers-compatible):
- `@block65/webcrypto-web-push`

Implement a tiny wrapper in `functions/_lib/push.ts`:
- `loadVapidKeys(env)` from env strings
- `sendPushToSubscription(subscription, payload)` using the library
- `sendPushToPerson(env, personId, payload)` loops subscriptions + cleanup

Payload schema (sent as encrypted JSON):
- `title: string`
- `body: string`
- `url: string` (relative URL, e.g. `/?week=2026-W02&tab=events`)
- `tag?: string` (for notification grouping)
- `timestamp: string` (ISO)

### 5) Frontend UI + Service Worker

#### 5.1 Service worker

Add `public/sw.js`:
- `self.addEventListener('push', ...)`:
  - parse `event.data.json()` into `PushMessagePayload`
  - `showNotification(payload.title, { body: payload.body, data: { url: payload.url }, tag: payload.tag })`
  - fallback: show a generic notification if parsing fails
- `self.addEventListener('notificationclick', ...)`:
  - `clients.openWindow(notification.data.url || '/')`

#### 5.2 Device ID

Add a stable device ID in localStorage:
- Key: `family-planner:device-id`
- Value: `crypto.randomUUID()` (fallback to existing `createId()` helper)

#### 5.3 Subscribe flow

Add a small “Notifications” modal reachable from the existing “More” menu in `src/app/App.tsx`:
- Show current permission state (`Notification.permission`)
- Button: “Enable push notifications”
  - registers SW (`/sw.js`)
  - fetches `GET /api/push/vapid-public-key`
  - subscribes via `registration.pushManager.subscribe(...)`
  - POSTs `subscription.toJSON()` + `deviceId` to `/api/push/subscribe`
- Button: “Disable push notifications” (unsubscribe + `/api/push/unsubscribe`)
- Button: “Send test notification” → `POST /api/push/test`

UX: Keep it blunt and explicit; push permission prompts should be user-initiated.

---

## Phase 2: Scheduled event reminders (Worker cron)

### 1) New Worker

Create `workers/push-reminders-dispatcher/`:
- `wrangler.toml` with:
  - KV binding `FAMILY_PLANNER_KV`
  - cron trigger: every minute (`* * * * *`) or every 2/5 minutes to reduce load
- `src/index.ts` implements `scheduled()`

### 2) Dispatch algorithm (timezone-safe, no date library)

For each tick:
1. Compute `target = new Date(Date.now() + 15 * 60_000)` (lead time).
2. Compute:
   - `weekId = getCurrentWeekId(target)` from `src/domain/week.ts` (London-aware)
   - `dayIndex = getCurrentDayIndex(target)` (London-aware)
   - `timeHHMM` using `Intl.DateTimeFormat(... { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hour12: false })`
3. Load WeekDoc from KV: `week:{weekId}` (create-if-missing is OK but not required for reminders).
4. Find matching events: `event.day === dayIndex && event.time === timeHHMM`.
5. For each matching event:
   - compute recipients:
     - if `event.who.length > 0` → those people
     - else → all `week.people`
   - for each `personId`, enforce idempotency:
     - key: `push_sent:v1:${personId}:${weekId}:${event.id}:m15:d${event.day}:t${event.time}`
     - if exists → skip
     - else write with TTL (e.g. 14 days), then send push payload

Reminder notification payload (v1):
- title: `Upcoming`
- body: `${event.title} at ${event.time}`
- url: `/?week=${weekId}&tab=events&day=${event.day}`
- tag: `event:${weekId}:${event.id}`

### 3) Failure handling + cleanup

- If sending to a subscription returns 404/410: remove it from `push_subs:v1:<personId>`.
- Log counts: events matched, pushes attempted/sent/removed.
- Keep the worker “fail loud” for scheduled runs (throw on unexpected errors).

---

# Cloudflare Setup (after code)

## 1) Generate VAPID keys

Generate a VAPID key pair (P-256). Store:
- `PUSH_VAPID_PUBLIC_KEY` (base64url)
- `PUSH_VAPID_PRIVATE_KEY` (base64url or JWK/PEM depending on the chosen server implementation)
- `PUSH_VAPID_SUBJECT` (e.g. `mailto:you@example.com`)

Recommendation: store the private key as a **secret**.

## 2) Pages (Functions) environment variables

In the Cloudflare Pages project:
- Add `PUSH_VAPID_PUBLIC_KEY`
- Add secret `PUSH_VAPID_PRIVATE_KEY`
- Add `PUSH_VAPID_SUBJECT`
- Ensure KV binding `FAMILY_PLANNER_KV` remains set

If you rely on Cloudflare Access mapping for person IDs (recommended):
- Set `USER_EMAIL_MAP` (JSON string) in Pages env

## 3) Worker for reminders (Phase 2)

Deploy `workers/push-reminders-dispatcher`:
- Bind the same KV namespace as `FAMILY_PLANNER_KV`
- Set the same VAPID env vars/secrets on the Worker
- Enable the cron trigger (defined in that worker’s `wrangler.toml`)

---

# Local Testing (before deploying)

## Prereqs

- Chrome (or another browser with Push API support)
- Run `npm run dev` (Pages Functions + Vite via Wrangler)

## Local env vars

Add VAPID vars to `.dev.vars` (don’t commit secrets):
- `PUSH_VAPID_PUBLIC_KEY=...`
- `PUSH_VAPID_PRIVATE_KEY=...`
- `PUSH_VAPID_SUBJECT=mailto:...`

Ensure local viewer mapping exists so subscribe endpoints work:
- `DEV_USER_EMAIL=...`
- `USER_EMAIL_MAP='{"you@example.com":"dad"}'`

## Manual test flow (Phase 1)

1. Open the local site.
2. Open “More” → “Notifications”.
3. Click “Enable push notifications” and allow permission.
4. Click “Send test notification” and confirm it appears even if the tab is in the background.
5. Click the notification and confirm it opens the app.

## Scheduled worker test (Phase 2)

Options:
- Run the worker locally and simulate scheduled events (Wrangler supports scheduled testing), OR
- Add a temporary `POST /api/push/reminders/dispatch?dryRun=1` endpoint that calls the same dispatch function (recommended for quick iteration).
