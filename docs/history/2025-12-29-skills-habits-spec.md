# Practice Dashboard (Skills + Habits) — Spec v1

## Summary

Add a new **top-level “Practice” tab** to the existing Family Planner. This tab is a calm, family-wide dashboard for **skills tracking + habit forming** (e.g. guitar, piano, chess, reading) using **“votes”** instead of streaks.

Key properties:

- No streaks, no penalties, no red “missed” states.
- “Votes” = showing up. A “Tiny Win” always counts.
- Separate storage from the planner’s `WeekDoc` (no changes to planner KV keys).
- Same persistence philosophy as the planner: edit full document in memory, save via `PUT`, optimistic concurrency via `version`, explicit 409 handling.

---

## Goals

- Keep the family planner’s functionality unchanged and uncluttered.
- Provide a **family dashboard** that makes practice visible without turning it into a competition.
- Support per-person skill lists and two tracking modes: **minutes** or **count**.
- Make it “simple but fun” via light badges and satisfying interactions, without gamification that creates shame.

## Non-goals (v1)

- No leaderboards or rankings.
- No streak counters.
- No push notifications for practice (only in-app nudges on open).
- No automatic “quality scoring” or judging practice.
- No cross-device offline persistence beyond standard local state + server.

---

## UX / Screens

### Navigation

- Add a new top-level tab: **Practice**.
- The planner tabs remain intact; Practice is a sibling, not embedded inside planner screens.

### Screen A — Family Dashboard (default in Practice tab)

Purpose: one shared view answering: “Did we cast votes recently?”

Layout (mobile-first cards):

- One card per person (`mum`, `dad`, `son`), each showing:
  - Person label
  - A short list of that person’s active skills (icon + name)
  - **Weekly dots** per skill: `●` if that day has ≥1 vote for that skill, otherwise `○`
  - “Votes this week: N” (total votes across all skills)

Interactions:

- Tap a person card → Screen B (Personal Dashboard)
- Optional: a subtle family badge row at top:
  - `Everyone practiced at least once this week` (only shows when true)

Tone rules:

- Empty circles are neutral. No “missed”, no red.

### Screen B — Personal Dashboard

Purpose: quick action + a small amount of feedback.

Sections:

1) **Today**
- For each active skill:
  - Primary button: **Tiny Win**
  - Plus buttons by tracking type:
    - Minutes skills: `+10 min`, `+20 min` (optionally `+30 min`)
    - Count skills: `+1`, `+5` (optionally `+10`)
  - Show the skill’s plan line if present: `Plan: After dinner → guitar (living room)`

2) **This Week (per-skill dots)**
- Same dot row as Family Dashboard but can be slightly larger.

3) **Summary**
- “Votes this week”
- “Best week” (best week in stored history; definition below)

In-app nudge (soft):
- If “Never miss twice” condition is met, show:
  - `Looks like it’s been a couple of days. A Tiny Win still counts.`

### Screen C — Skill Detail

Purpose: make the “habit system” visible without being wordy.

Sections:

- Header: icon + skill name
- **Identity** (editable string)
- **This week**
  - Votes this week
  - Consistency (weeks with ≥3 votes for this skill)
  - Best week (max votes in a week for this skill)
- **Tiny Win** (editable string; always visible)
- **Plan** (optional, editable)
- **Environment** (optional checklist, editable)

### Screen D — Weekly Review (family + per-person)

Shown/linked from Practice tab (no modal required; can be a section or separate sub-view).

Display:
- `Family votes this week: X`
- Badge line if true: `Everyone practiced at least once this week`

Prompts (free text; stored per person per week):
- `What helped practice happen this week?`
- `What’s one small tweak for next week?`

---

## Metrics & Rules (code-ready)

### Vote

- Any practice log entry counts as **1 vote**.
- **Max 2 votes per person per skill per day** (prevents grinding/comparison).

### Weekly dots

- A dot is filled for a skill/day if there is **≥1 vote** for that skill on that day.

### “Good week” threshold (never shown as “bad”)

- `Good week`: ≥3 votes (per skill per week; used for consistency)
- `Great week`: ≥5 votes (optional; can be shown only as positive copy)

### Consistency (per skill)

- `Consistency = number of weeks where votes(skill, week) >= 3`
- Display copy: `3 consistent weeks` (no percentages).

### Best week (per skill)

- `Best week = max over stored weeks of votes(skill, week)`
- Display copy: `Best week: 4 votes`

### Family badge (optional)

- `Everyone practiced once this week` if:
  - For each person: `votes(person, week) >= 1` (across all skills)

### Never miss twice (soft nudge; no notifications)

- Condition (per person): `votes(person, yesterday) === 0 AND votes(person, today) === 0`
- UI: show a gentle nudge when opening that person’s Personal Dashboard.

---

## Data model

### Shared constraints

- Timezone is fixed to `Europe/London`.
- Week math uses existing ISO week IDs: `YYYY-Www`.
- IDs are opaque strings (client-generated), prefer `crypto.randomUUID()` when available.

### PracticeDoc (KV: `practice:v1`)

Single KV document for v1:

```ts
export type PracticeTracking = "minutes" | "count";

export interface PracticeSkill {
  id: string; // opaque
  name: string; // <= 40 chars
  icon: string; // emoji or short string, <= 8 chars
  tracking: PracticeTracking;
  order: number; // sort within person
  archivedAt?: string; // ISO, hides from dashboards but keeps history

  tinyWin: string; // <= 80 chars
  identity?: string; // <= 120 chars
  plan?: string; // <= 120 chars, e.g. "After dinner → guitar (living room)"

  environment?: { id: string; label: string; done: boolean }[]; // <= 10 items
}

export type PracticeLogKind = "tiny" | "minutes" | "count";

export interface PracticeLogEntry {
  id: string;
  weekId: string; // "YYYY-Www"
  day: number; // 0..6 (Mon..Sun)
  personId: PersonId;
  skillId: string;
  kind: PracticeLogKind;
  minutes?: number; // kind==="minutes"
  count?: number; // kind==="count"
  createdAt: string; // ISO
}

export interface PracticeWeeklyReview {
  helped: string; // <= 500 chars
  tweak: string; // <= 500 chars
  updatedAt: string; // ISO
}

export interface PracticeDoc {
  schemaVersion: 1;
  timezone: "Europe/London";
  version: number;
  updatedAt: string;
  people: PersonId[];

  skillsByPerson: Record<PersonId, PracticeSkill[]>;
  logs: PracticeLogEntry[];
  reviewsByWeekId: Record<string, Partial<Record<PersonId, PracticeWeeklyReview>>>;
}
```

Notes:
- `logs` is append-only in spirit, but edits/deletes are allowed in v1 for simplicity (still full-doc `PUT` with concurrency).
- `reviewsByWeekId[weekId][personId]` stores that person’s weekly review.

### Default skills (created server-side if `practice:v1` is missing)

Suggested seed (editable in UI):

- Dad: `🎸 Guitar` (minutes), Tiny Win: `Tune guitar + 1 chord change`
- Mum: `🎹 Piano` (minutes), Tiny Win: `Sit down + play 8 bars slowly`
- Son: `♟️ Chess` (count), Tiny Win: `Solve 1 puzzle`
- Optional for all: `📖 Reading` (minutes), Tiny Win: `Read 2 pages`

---

## Storage / KV

### Keys (new)

- `practice:v1` → `PracticeDoc`

Rationale:
- Keeps practice separate from `WeekDoc`.
- Fits the “boring” model: one document, full replacement writes, explicit version conflicts.

### Guard rails (server-side)

To prevent accidental bloat:

- Maximum skills per person: 30
- Maximum log entries: 20,000
- Maximum review text lengths as defined above

If limits are exceeded, return `400 VALIDATION_FAILED`.

Backup/restore:
- Existing KV backup export/import should include `practice:v1` automatically (no new mechanism required).

---

## API (Pages Functions)

### Endpoints

#### `GET /api/practice`

Returns the current `PracticeDoc` (create default if missing).

Response:

```json
{ "ok": true, "data": { "doc": "PracticeDoc" } }
```

Errors:
- `500 INTERNAL_ERROR`

#### `PUT /api/practice`

Replace the entire `PracticeDoc` (optimistic concurrency).

Headers:
- `Content-Type: application/json`
- `If-Match-Version: <number>` (required)

Body:
- `PracticeDoc`

Behavior:
- Validate body defensively.
- Load stored doc from KV.
- If stored `version` does not match both:
  - `If-Match-Version`, and
  - `body.version`
  return `409 VERSION_CONFLICT` (never silently overwrite).
- On success, write:
  - `version = stored.version + 1`
  - `updatedAt = now`

Response:

```json
{ "ok": true, "data": "PracticeDoc" }
```

Errors:
- `400 INVALID_JSON`
- `400 VALIDATION_FAILED`
- `409 VERSION_CONFLICT`
- `500 INTERNAL_ERROR`

Error shape (existing convention):

```json
{ "ok": false, "error": { "code": "VERSION_CONFLICT", "message": "..." } }
```

---

## Validation rules (server)

- `schemaVersion === 1`
- `timezone === "Europe/London"`
- `people` must match the existing `PersonId[]` set used by the planner
- `version` integer ≥ 1
- `skillsByPerson` must exist for each person; each list has unique `skill.id`
- `PracticeSkill` fields:
  - `name` trimmed non-empty, length ≤ 40
  - `icon` trimmed non-empty, length ≤ 8
  - `tracking` is `"minutes"` or `"count"`
  - `tinyWin` trimmed non-empty, length ≤ 80
  - optional strings limited as above
- `PracticeLogEntry` fields:
  - `weekId` must match `YYYY-Www` (ISO week id validation)
  - `day` integer 0..6
  - `personId` must be valid
  - `skillId` must exist in that person’s skill list (unless the skill is archived; archived still valid)
  - `kind` in `"tiny"|"minutes"|"count"`
  - minutes: integer 1..240 when kind is `"minutes"`
  - count: integer 1..1000 when kind is `"count"`
- Enforce vote cap:
  - For each `(weekId, day, personId, skillId)`, number of log entries ≤ 2

---

## Frontend state & saving

- Practice data loads **lazily**: only fetch `GET /api/practice` when the Practice tab is first opened.
- Local state holds the full `PracticeDoc` in memory.
- All edits (including logging votes) update local state immediately and trigger a debounced `PUT /api/practice`.
- Show saving state and handle conflicts like the planner:
  - On `409 VERSION_CONFLICT`, show a modal with:
    - `Reload latest` (discard local changes and refetch), and
    - `Try saving again` (after reload + re-apply is a v2 improvement; in v1 just reload).

Local-only UI state (allowed):
- Practice tab sub-view (Family vs Personal vs Skill)
- Selected person card

---

## Copy (v1)

Global:
- Title: `Practice`
- Subtitle: `This week`

Family Dashboard:
- `Votes this week`
- Badge (only when true): `Everyone practiced at least once this week`

Buttons:
- `Tiny Win`
- Minutes skills: `+10 min`, `+20 min`
- Count skills: `+1`, `+5`

Never-miss-twice nudge:
- `Looks like it’s been a couple of days. A Tiny Win still counts.`

Weekly Review:
- Title: `Weekly Review`
- Prompt 1: `What helped practice happen this week?`
- Prompt 2: `What’s one small tweak for next week?`

---

## Implementation checklist (non-binding)

- Domain types: add `PracticeDoc` types alongside existing shared types.
- Backend:
  - `functions/api/practice.ts` (GET/PUT)
  - KV store helper + server validation (mirrors WeekDoc pattern)
- Frontend:
  - Add `practice` to `TabKey` + tabs list
  - New screen `Practice.tsx` with sub-views
  - Client API functions `fetchPractice()` / `putPractice()`
  - Debounced save + 409 conflict handling

