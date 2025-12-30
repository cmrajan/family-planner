# Practice feature review + simplification ideas (Atomic Habits)

Date: 2025-12-28

This note is a product/UX + light tech review of the current Practice feature, plus a proposal to simplify it into “did you practice today?” logging while keeping it useful for habit formation and review.

---

## What exists today (observed in the UI)

Practice is a top-level tab with these sub-views:

- **Family dashboard**: one card per person, showing **weekly dots per skill** and “Votes this week”.
- **Person dashboard**:
  - **Today**: each skill has action buttons:
    - **Tiny Win**
    - **+10 min / +20 min** (for “minutes” skills) or **+1 / +5** (for “count” skills)
  - A list of today’s “votes” for each skill, each vote having:
    - kind: Tiny Win / Minutes / Count
    - editable minutes/count (for those kinds)
    - **Undo** per vote
    - **Reset today** per skill (removes all today votes for that skill)
  - “Never miss twice” **in-app nudge** when today+esterday have 0 votes.
- **Skill detail**: skill “habit system” fields (Identity, Tiny Win, Plan, Environment checklist) + weekly dots + summary (votes/consistency/best week).
- **Weekly review**: free-text prompts per person per week (“helped”, “tweak”).
- **Manage skills**: edit icon/name/tracking (minutes vs count), archive/restore, add skills per person.

The design already leans into Atomic Habits concepts (identity, tiny win, environment), but the “tracking mode + vote kind + amount editing” makes day-to-day logging a bit heavier than it needs to be for “show up” habits.

---

## Data model & persistence (how it works)

- Practice data is stored separately from the planner in one KV document: `practice:v1`.
- Client loads it lazily when Practice tab opens (`GET /api/practice`), edits it in memory, and saves via full-doc replacement (`PUT /api/practice`) using optimistic concurrency with a `version` / `If-Match-Version` header.
- Practice logs are event-like rows:
  - `PracticeLogEntry` has `weekId`, `day` (0..6), `personId`, `skillId`, `kind` (`tiny|minutes|count`), optional `minutes|count`, and `createdAt`.

This is already very close to a “practice session log”; the main complexity is the **kind + per-skill tracking mode + caps**.

---

## Notable issue found during testing

There’s an inconsistency between frontend and backend caps:

- Backend validation enforces **max 2 votes per person/skill/day**, returning `VALIDATION_FAILED: vote_cap_exceeded` when exceeded.
- The UI copy also says “Max 2 votes per skill per day”.
- But the frontend constant currently allows adding more (I was able to add a third “vote”, which then immediately failed saving with the 400 error).

Even if you keep a cap, this should be made consistent so users don’t hit confusing “Save failed” errors from normal tapping.

---

## Simplification direction (make it “show up”, not “measure”)

### Core behavior to optimize for

- **Default action is 1 tap**: “Log practice”.
- Logging means: “I did it” (today). Nothing else required.
- If you practiced multiple times, you can log multiple sessions, but it should never feel required.

### Keep the useful Atomic Habits parts (they’re already valuable)

- Keep **Tiny Win** as a *prompt/suggestion* (“what’s the smallest version?”), but don’t make people choose a “kind” every time.
- Keep **Identity / Plan / Environment** on the skill detail screen.
- Keep Weekly Review prompts; they’re great for habit refinement.

---

## Proposed UX (simple today flow, useful history)

### Family view

- Keep the weekly dots; they’re a calm, low-shame “did it happen?” indicator.
- Consider making the primary label “Days practiced” (or “Days showed up”) rather than “Votes”.

### Person view (Today)

For each skill row:

- One primary button: **Log** (adds one session for today).
- Show state: **Practiced today** (true/false) + optional “x sessions today”.
- Optional (collapsed) “Add details” per session:
  - duration (minutes)
  - short note (what you did / what helped)

This keeps logging friction tiny, while still letting you capture “useful lookback” details when you want.

### Skill detail (history + system)

Add/keep:

- “This week” dots + “Days practiced this week”.
- A lightweight “Recent sessions” list (timestamps + optional duration/note).
- Keep Identity / Tiny Win / Plan / Environment checklist.

---

## Proposed data changes (minimal, typed, migration-friendly)

If you want to remove “minutes vs count” as a concept, the simplest model is: **a session always counts**, with optional metadata.

Example direction:

- Replace `PracticeLogKind` with a single concept (session), and make metadata optional:
  - `durationMinutes?: number`
  - `note?: string`
  - (optional) `label?: "tiny"` if you still want “Tiny Win” as an attribute rather than a separate action

Migration can be straightforward:

- `kind==="minutes"` → session + `durationMinutes`
- `kind==="count"` → session + either drop count or map into `note` (depending on how much you care)
- `kind==="tiny"` → session + `label:"tiny"` (or no label)

If you still want optional “count” for some skills, a compromise is:

- Keep a generic `amount?: number` + `unit?: "min" | "count"` on a session, but **don’t force it in the UI**.

---

## “Useful to look back on” without becoming a chore

Good habit-review views that stay low-friction:

- **Calendar-like heatmap** (per skill): days practiced (binary), optionally with a tooltip showing session count and total minutes if present.
- “What helped” snippets surfaced from Weekly Review (especially useful over months).
- “Never miss twice” stays as an **in-app** prompt (good default). If you add push reminders, keep them gentle and optional.

---

## Notifications: what you can do (and what’s already present)

### What already exists in this repo

There is already a Web Push setup:

- UI: `NotificationsModal` can enable/disable/test push per device (service worker `public/sw.js`).
- API: `/api/push/*` stores subscriptions in KV per person.
- A scheduled worker (`workers/push-reminders-dispatcher`) runs every minute and sends **event reminders** (15 minutes before calendar events), with KV dedupe keys to avoid repeats.

So, push infrastructure is already in place.

### Options for practice reminders

1) **In-app reminders only (simplest, low-risk)**
   - When opening Practice (or the app), if it’s after a chosen time and “no practice logged today”, show a gentle banner: “Want to log a Tiny Win?”
   - Works without push permissions and avoids notification fatigue.

2) **Use the existing event reminder system (no new backend work)**
   - Create recurring “Practice check-in” events (e.g., daily 18:30) assigned to everyone.
   - The existing push dispatcher will notify like any other event.
   - Trade-off: it clutters the calendar unless you hide these events in normal views.

3) **Add a dedicated practice reminder push**
   - Extend the scheduled worker to also:
     - read `practice:v1`
     - check if each person has logged practice today
     - send a gentle reminder at configured times
     - dedupe “sent today at time X” per person
   - This needs a place to store the schedule (likely in `PracticeDoc`) and an opt-in UI per person/device.

I want option 3 above.

---

## Decisions to make before implementing

- Do you want to track **sessions** (multiple taps per day) or only **did it today** (binary per skill/day)?
  - You can have both: sessions stored, but most UI is binary. (have both)
- Do you still want *any* numeric measurement (minutes/count), or keep it strictly optional metadata? (optional meta data)
- Should there be any cap at all? If yes, what’s the user-facing reason (avoid grinding/competition) and what number feels non-annoying? (no cap)
- Who should receive reminders for “son” (if he doesn’t have a device)? Parents only? A “family” channel? we all have devices

