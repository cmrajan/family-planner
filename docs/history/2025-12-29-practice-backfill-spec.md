# Practice: backfill logging for previous days (spec)

## Problem statement

Right now, if someone forgets to log a practice session on the day it happened, there’s no obvious way to record it later against the correct day. The current UI only logs sessions to “today”.

Goal: allow logging a practice session for a previous day (within the appropriate week) without changing storage/API shape or introducing new persistence keys.

## Findings (current behavior)

### UI (http://localhost:8788/)

- **Family → Person** flow exists (`Practice` tab → tap person row).
- Person view has a **“Today”** section with per-skill `Log` buttons.
  - Pressing `Log` immediately appends a new session and shows it in a small list with `Add details` / `Undo` / `Clear today`.
- The **“This week”** dots are visual-only (not interactive).
- The top-of-app week header (`Prev` / `Next`, `Week YYYY-Www`) is visible on the Practice tab, but Practice itself currently presents as **“This week”** and does not expose a way to select a different day for logging.

### Code

- Practice data is stored in a separate KV document: `practice:v1` (`PracticeDoc`). This is already versioned and uses full-doc `PUT` with optimistic concurrency.
  - API: `functions/api/practice.ts` (`GET` returns `{ ok: true, data: { doc } }`, `PUT` requires `If-Match-Version`, returns `409 VERSION_CONFLICT` on mismatch).
  - Validation: `functions/_lib/validate.ts` enforces `weekId` ISO format and `day` in `0..6`.
- Practice UI writes logs client-side by pushing to `PracticeDoc.logs`:
  - `src/ui/practice/Practice.tsx`: `addLogEntry()` hard-codes `weekId: getCurrentWeekId()` and `day: getCurrentDayIndex()`.
  - Related actions (`Clear today`, “nudge” logic) also hard-code `currentWeekId` + `todayIndex`.
- The data model already supports logging against *any* week/day combination:
  - `PracticeLogEntry` includes `weekId` and `day` (Mon..Sun as `0..6`).

## Proposed solution (minimal + consistent with existing navigation)

### UX changes (high level)

1. Add a **day selector** to the Person dashboard so the user can choose which day they’re logging for.
2. Make all logging actions in the Person dashboard operate on the **selected day** (not always “today”):
   - `Log` adds a session for `selectedDayIndex`.
   - The session list shows sessions for `selectedDayIndex`.
   - `Clear today` becomes `Clear <DayLabel>` and clears only that day.
3. Tie Practice’s “week being viewed” to the app’s existing week selection (the header `Week YYYY-Www`):
   - When the user hits `Prev`/`Next` in the main header and then goes to Practice, Practice should show/log for that selected week.
   - This keeps “log for previous days” simple: navigate to the correct week, pick the day, log.

### UX details

#### Person dashboard header

- Replace `Today` section title with:
  - `Selected day` (neutral), or
  - `Log for: <Mon..Sun>` (explicit).
- Add a compact day picker (mobile-first):
  - A row of 7 buttons/chips: `Mon Tue Wed Thu Fri Sat Sun`.
  - Default selection:
    - If the viewed week is the current week: default to “today”.
    - Otherwise: default to the most recent day in that week that has any sessions for that person (fallback: Mon).

#### Session list labeling

Current per-session pill shows `HH:MM` from `createdAt`. With backfilled logging, `createdAt` will often be “time you logged it”, not “time practice happened”.

Keep the model unchanged; adjust copy so the UI stays truthful:

- In the selected-day list, show:
  - a day label (implicit via the selector), and
  - the pill as `Logged 10:45` (instead of just `10:45`) when `selectedDayIndex !== todayIndex` (or when the viewed week isn’t the current week).

This avoids implying the session occurred at that time.

#### “Never miss twice” nudge

Keep existing nudge behavior *only when viewing the current week* (because it depends on “today” and “yesterday”):

- If viewed week is current week:
  - Use current logic (`today` + `yesterday` across week boundary) and display the nudge in the person view.
- If viewed week is not current:
  - No nudge (avoid confusing “today” logic applied to an old week).

## Non-goals

- No new KV keys, no partial updates, no server-side backfill endpoint.
- No “missed day” negative states, streaks, or shame UI.
- No calendar-style date picker in v1 (week navigation + day chips are enough).

## Data model & API impact

- **No schema change** required.
- Reuse `PracticeLogEntry.weekId` + `day` to represent the day the session counts toward.
- Continue to use `createdAt` as “when this was logged”.
- Backend validation already supports arbitrary `weekId` and `day` values; no API changes required.

## Implementation notes (where to change)

### Frontend

- `src/app/App.tsx`
  - Pass the currently viewed week ID into Practice (new prop, e.g. `weekId={week.weekId}`).
  - Practice already receives `readOnly={viewOnlyWeek}`; that should now correctly correspond to the same week Practice is displaying/logging.

- `src/ui/practice/Practice.tsx`
  - Add state in the Person view for `selectedDayIndex` (0..6).
  - Replace the current hard-coded `currentWeekId` / `todayIndex` usage for logging with:
    - `activeWeekId` (prop from App, derived from the app header)
    - `selectedDayIndex` (state)
  - Update:
    - `addLogEntry(personId, skillId)` to accept `weekId` + `day`.
    - `resetTodayLogs(...)` to clear logs for the selected day (rename accordingly).
    - `getSkillLogsForDay(...)` calls in the Person view to use `selectedDayIndex`.
    - Labels (`Today`, `Practiced today`, `0 sessions today`, `Clear today`) to be day-aware.
  - Keep “This week” dots and summary computed from `weekLogs` for the viewed week.

### Backend

- No changes needed in `functions/api/practice.ts` or validation.

## Edge cases

- **Week boundaries**: to log “yesterday” when today is Monday, the user navigates to previous week and selects `Sun`.
- **Read-only weeks**: if the viewed week is archived (planner read-only), Practice should also be read-only for that week (already supported via the `readOnly` prop).
- **Future days** within a week: allow selecting them (neutral), but keep `Log` disabled for days after “today” when viewing the current week (optional guard rail; reduces accidental future logging).

## Acceptance criteria

- From the Person dashboard, the user can select `Tue` and log a session; the week dots/summary update for `Tue`.
- Switching weeks via the app’s existing week header changes Practice’s week view and logging target.
- Logging for a past week/day works without backend changes and persists via the existing `PracticeDoc` `PUT` flow.
- Conflict handling remains unchanged (409 surfaces as “Not saved” and requires explicit reload/retry).

## Test plan (manual)

- In the current week:
  - Select `Yesterday`’s day chip and log; verify the dot for that day increments and “Clear <Day>” only clears that day.
- Cross-week:
  - Use the top `Prev` button to go to previous week, open Practice, pick `Sun`, log; verify it appears in that week’s dots and persists after refresh.
- Read-only:
  - View an archived week and confirm Practice shows `Read-only` and disables `Log`, `Clear`, and inputs.

