# Universal Add (LLM-assisted) — Build Spec (Mobile-first)

## Goals
- Add a **single, universal “+”** entry point available on every screen.
- Let a user type **plain English** (free-form) and convert it into either:
  - a `PlannerEvent` (with day/time/location/who/tag when possible), or
  - a `TodoItem` (with owner/due day/effort when possible).
- Keep the app’s existing **WeekDoc-as-source-of-truth** workflow:
  - All edits are applied to a full `WeekDoc` in memory and persisted via existing `PUT /api/week/:weekId`.
  - No partial updates.
  - Preserve optimistic concurrency via `version` and existing 409 handling.
- Mobile-first UX (>= 90% usage): one-hand friendly, safe-area aware, not in the way.

## Non-goals (v1)
- Changing the WeekDoc schema.
- Adding any new KV keys for this feature.
- Recurrence parsing/creation via the LLM (keep recurring behavior as-is).
- A “chat” UI or multi-turn assistant.
- Client-side LLM calls (API key must not ship to the browser).

---

## Existing Constraints to Preserve
- Timezone: fixed `Europe/London`.
- Weeks: ISO week IDs (`YYYY-Www`).
- Archived weeks are read-only (403 on PUT); UI must respect `readOnly`.
- Backend and frontend types must remain aligned (shared types live in `src/domain/types.ts`).
- Defensive server-side validation before writing to KV (applies to WeekDoc only; parse endpoint must still validate its own input/output).

---

## UX Overview

### 1) Universal floating “+” button (FAB)
- Visible on every tab/screen (except print/share view; match existing `share-hidden` behavior).
- Placement:
  - `position: fixed`
  - bottom-right by default (right-handed friendly)
  - respects safe area: `bottom: calc(16px + env(safe-area-inset-bottom))`
  - does not cover the mobile “More” button (currently bottom-ish); ensure at least ~64px clearance.
- Disabled / hidden rules:
  - If current week is `readOnly`, show a disabled FAB with a short tooltip/label: “Archived week (read-only)”.
  - If app is still loading or `week` is null, hide FAB.

### 2) “Universal Add” modal (single modal, 2-step flow)
Open modal when FAB tapped.

#### Step A: Input
- Primary field: a multiline `textarea` (mobile-friendly) with placeholder examples:
  - `Meet with friends on 2 Jan 2026 at my house`
  - `Pay school trip tomorrow`
  - `Dentist Tue 15:30 @ High St Clinic`
- A small, optional “mode” selector (defaults based on current tab):
  - `Auto (recommended)`
  - `Event`
  - `To-do`
- Primary action: `Parse` (or `Continue`) to call the server parse endpoint.
- Secondary actions:
  - `Cancel`
  - (Optional) `Use simple parser` if Gemini unavailable (fallback path can be v2).

#### Step B: Review + Confirm
Show a compact preview card that is editable (no heavy UI):
- If type is `event`:
  - Title (required)
  - Date (local, Europe/London) OR week/day representation
  - Time (optional; HH:MM)
  - Location (optional)
  - Who (chips or multi-select; default “Everyone” → `who: []` or `who: all people` depending on existing semantics; see “Who semantics” below)
  - Tag (optional)
- If type is `todo`:
  - Title (required)
  - Owner (required; defaults to current “me”)
  - Due day (Mon..Sun or Anytime)
  - Effort (optional)
  - Status (default `todo`; do not ask the model to create `done`)

Buttons:
- Primary: `Add` (applies to WeekDoc in memory, then existing autosave persists)
- Secondary: `Back` (returns to input step, keeps text)
- Optional: `Add & New` (adds item and clears modal to input step for rapid entry)

#### “Target week” banner (when parsed date is not in currently loaded week)
If the parse result implies a `targetWeekId` different from the currently loaded `week.weekId`:
- Show a banner in the review step:
  - `Will add to Week 2026-W01 (Fri)`
- Confirm action becomes:
  - `Go to week & add` (loads that week, applies add, persists)
  - (Optional) `Add to current week instead` (forces mapping to current week’s chosen day; this is a deliberate override)

### Error handling (UX)
- If parse fails: show a concise error and keep the user’s input intact.
- If week save conflicts (409) occur as part of cross-week add: reuse existing conflict UI patterns (reload + retry), and never overwrite silently.

---

## Who semantics (important)
Current `PlannerEvent.who` is an array of `PersonId[]`. The UI often treats “Everyone” as a distinct display state.

For this feature, keep a single rule:
- `who: []` means “Everyone / unspecified”.
- If the model returns specific people, store those in `who`.

(This matches existing Events/Calendar UI behavior that displays “Everyone” when `who.length === 0`.)

---

## Data: New Types (Shared)
Add these types to `src/domain/types.ts` (and import from there in functions) so frontend/backend remain aligned.

```ts
export type UniversalAddMode = "auto" | "event" | "todo";

export type UniversalAddKind = "event" | "todo";

export interface UniversalAddParseRequest {
  text: string;                 // raw user input
  mode: UniversalAddMode;       // UI-selected mode
  timezone: "Europe/London";
  nowIso: string;               // new Date().toISOString() from client
  defaultOwner: PersonId;       // current “me”
  people: PersonId[];           // from current WeekDoc
  currentWeekId: string;        // week currently shown in the UI
}

export interface UniversalAddParseEvent {
  kind: "event";
  title: string;
  date?: string;                // YYYY-MM-DD (Europe/London local date), preferred
  day?: number;                 // 0..6 (only if date omitted)
  time?: string;                // HH:MM
  location?: string;
  who: PersonId[];              // [] means Everyone
  tag?: EventTag;
}

export interface UniversalAddParseTodo {
  kind: "todo";
  title: string;
  owner: PersonId;
  dueDate?: string;             // YYYY-MM-DD preferred
  dueDay?: number;              // 0..6, only if dueDate omitted
  effort?: Effort;
}

export interface UniversalAddParseResult {
  kind: UniversalAddKind;
  confidence: "high" | "medium" | "low";
  reasoning?: string;           // short, shown only on “Details” (optional)
  event?: UniversalAddParseEvent;
  todo?: UniversalAddParseTodo;
}
```

Notes:
- The model should prefer returning `date`/`dueDate` as `YYYY-MM-DD`. The frontend can derive `weekId` via existing `getWeekIdFromDateString`.
- Keep `reasoning` optional; never require it for functionality.

---

## Backend: New API Endpoint (Pages Functions)

### Route
`POST /api/universal-add/parse`

Purpose: Convert free-form text to a validated `UniversalAddParseResult`. This endpoint **does not write to KV**.

### Env
Add to Pages Functions environment:
- `GEMINI_API_KEY` (required in production)
- `GEMINI_MODEL` (optional; default a fast/cheap model, e.g. `gemini-1.5-flash`)

Local dev:
- Add `GEMINI_API_KEY=...` to `.dev.vars` (keep it out of git).

### Request body
`UniversalAddParseRequest`

Validation (server-side, before calling Gemini):
- `text`: string, trimmed length 1..500 (or similar small limit)
- `mode`: `"auto" | "event" | "todo"`
- `nowIso`: valid ISO-ish string (basic check; don’t overcomplicate)
- `currentWeekId`: must match `parseWeekId`
- `people`: must be the known set (or at least subset of `PEOPLE`)
- Always assume timezone is `Europe/London` (reject others)

### Response
Success: `200` with `{ ok: true, data: UniversalAddParseResult }`

Errors:
- `400 INVALID_REQUEST` (validation failed)
- `502 GEMINI_UPSTREAM` (Gemini call failed / non-200)
- `500 PARSE_FAILED` (Gemini returned unusable output, or internal validation failed)

All error bodies follow the existing `{ ok: false, error: { code, message } }` shape.

### Gemini call (implementation notes)
- Use `fetch` from the function runtime.
- Do not introduce new dependencies.
- Prefer low temperature for consistency.

Prompt requirements:
- Provide the allowed enums (`PersonId`, `EventTag`, `Effort`) directly in the prompt.
- Require **JSON only** output (no markdown, no prose).
- Require a single object shaped exactly as `UniversalAddParseResult`.
- Force date format `YYYY-MM-DD` when a date is present.
- For ambiguous cases, allow `confidence: "low"` and omit optional fields rather than guessing.

Example prompt skeleton (conceptual):
- System: “You are a strict JSON generator…”
- User: includes:
  - `text`
  - `mode`
  - `timezone`
  - `nowIso`
  - `people`, `defaultOwner`
  - brief schema and constraints

### Server-side validation of Gemini output
Treat Gemini output as untrusted input:
- Ensure `kind` is `event` or `todo`.
- Ensure required fields are present and trimmed.
- Validate `time` matches `HH:MM` if present.
- Validate `date`/`dueDate` matches `YYYY-MM-DD` if present.
- Validate `day`/`dueDay` in 0..6 if present.
- Validate `owner` and `who[]` are allowed `PersonId`s.
- Validate `tag` and `effort` enums if present.
- Enforce max lengths consistent with `validateWeekDoc` (title <= 140, location <= 80).

If invalid: return `500 PARSE_FAILED` (and include a concise message; do not leak raw upstream responses).

Here is the documentation page of google gemini api:
https://ai.google.dev/gemini-api/docs
Here is a curl example of a call to Gemini API

curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent" \
  -H 'Content-Type: application/json' \
  -H 'X-goog-api-key: ADD_API_KY_HERE' \
  -X POST \
  -d '{
    "contents": [
      {
        "parts": [
          {
            "text": "Explain how AI works in a few words"
          }
        ]
      }
    ]
  }'
---

## Frontend: Applying the Result to WeekDoc

### Where to mount the FAB
In `src/app/App.tsx`, render a new component near the root so it overlays all tabs:
- `UniversalAddFab` (FAB + modal)

Inputs needed:
- `week` (current `WeekDoc`)
- `readOnly`
- `tab` (current tab key, to pick default mode)
- `me` (default owner)
- `loadWeekById` (existing callback, for cross-week adds)
- `onUpdate` (existing mutation helper for WeekDoc)

### Parsing request (client → server)
Add `parseUniversalAdd(...)` to `src/api/client.ts`:
- Calls `POST /api/universal-add/parse`
- Uses existing `requestJson<T>` helper.

### Deriving target week/day from parsed date
If parse returns `event.date`:
- Convert `date` to `weekId` using `getWeekIdFromDateString(date)`
- Convert `date` to day index (Mon..Sun) using `Intl.DateTimeFormat` in `Europe/London`

If parse returns only `event.day`:
- Use `currentWeekId` and that `day`.

Same for todo via `dueDate` or `dueDay`.

### Adding an event (local mutation)
When confirmed, create a new `PlannerEvent`:
- `id`: `createId()`
- `day`: computed day index
- `time`, `title`, `location`, `who`, `tag`: from parse result after trimming
- `order`: compute next order for that day (use the same logic already used in Events/Calendar: max existing order + 1, else 0)

### Adding a todo (local mutation)
Create a new `TodoItem`:
- `id`: `createId()`
- `title`: trimmed
- `owner`: from parse (or default)
- `status`: `"todo"`
- `dueDay`: computed or undefined (Anytime)
- `effort`: optional
- `order`: next order within that due day group (existing Todos logic)

### Cross-week add behavior (important)
If target `weekId !== week.weekId`:
1. Load the target week via `fetchWeek(weekId)` (reuse `loadWeekById` or a new helper that returns the fetched payload).
2. Apply the mutation to that loaded `WeekDoc`.
3. Persist it via `putWeek`.
4. Update UI state to show that week (so the user sees what happened).
5. Handle 409 conflicts explicitly (do not overwrite): show existing conflict UI / retry flow.

---

## Styling + Accessibility Requirements
- FAB tap target >= 48x48 and visible on all backgrounds.
- Modal:
  - autofocus the textarea on open
  - trap focus (reuse existing `Modal` behavior)
  - `aria-label` / accessible name for the FAB, e.g. “Add”
- Mobile keyboard:
  - use `enterKeyHint="done"` where possible
  - ensure primary action button is reachable when the keyboard is open (avoid being behind it)

---

## Testing / Verification (manual, v1)
On mobile viewport (~390x844):
1. FAB is visible on every tab and doesn’t block existing controls.
2. Add an event via text with explicit date/time/location:
   - Input: `meet with friends on 2 jan 2026 at my house`
   - Result: event created on the correct ISO week/day, with location set, time omitted unless provided.
3. Add a todo with owner inference:
   - Input: `dad: book dentist`
   - Result: todo created with owner `dad` (if model returns it) else defaults to current `me`.
4. Cross-week add loads and displays the correct week after save.
5. When viewing an archived week, FAB is disabled and cannot add.
