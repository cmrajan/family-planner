# Event Add Enhancements — Build Spec (Mobile-first)

## Goals
- Make adding an event feel instant (tap → type → save).
- Reduce visual clutter in the day list by hiding controls until needed.
- Keep “inline quick add” as the default path; use modal only for advanced options.
- Mobile-first layout; desktop can be a wider version of the same interactions.

## Non-goals
- Building a full natural-language parser with complex grammar.
- Implementing recurring events logic beyond an existing backend capability.
- Replacing the existing events list UI (only enhance add flow and related interactions).

---

## UX Overview

### Primary add path (inline)
1. User taps **“+ Add event”** under a day header (or presses global + button).
2. Inline quick-add expands and autofocuses a single text input.
3. User types title (optionally includes time/location shorthand).
4. User presses **Enter / Done** to save.
5. Event appears in the day list immediately and inline add collapses.

### Secondary path (advanced)
- “More options” opens the existing add/edit modal, prefilled with current inline input state.

---

## UI Components

### A) Day Section Header
Each day section has:
- Day label (e.g., `Mon`)
- Optional controls:
  - `Collapse/Expand day` (existing behavior)
- Inline add trigger:
  - `+ Add event` (tap target >= 44px height on mobile)

#### Behavior
- Tapping `+ Add event` toggles the inline add row for that day.
- Only one day’s inline add row can be open at a time (configurable; default: one).

---

### B) Inline Add Row (collapsed vs expanded)

#### Collapsed (default)
- Only show: `+ Add event`
- No input fields visible.

#### Expanded
Show in this order (mobile stack):
1. **Primary input** (single line)
2. Secondary options row
3. Actions row (optional depending on platform)

---

## Primary Input (Single Line)

### Field
- Placeholder: `Add an event… (e.g., "Dinner 19:00 @ Lebanese")`
- Autofocus on open.
- On mobile, use appropriate input mode:
  - type="text"
  - `enterKeyHint="done"` where supported

### Save triggers
- Enter / Done key saves if input has non-whitespace.
- Clicking ✔ (shown when input non-empty) saves.
- If input empty: Enter does nothing; ESC collapses (desktop only).

### Cancel triggers
- Tap outside collapses (if input empty) OR prompts discard (if input non-empty) — see “Unsaved state”.
- X icon collapses without saving (if empty) or discards with confirmation (if non-empty).
- ESC collapses (desktop).

### Inline validation
- Title required (after parsing, title must be non-empty).
- If parsing removes all text, treat as invalid and keep focus.

---

## Lightweight Smart Parsing (Optional but recommended)

### Supported patterns (keep simple)
When user types into primary input, attempt to extract:
- Time
- Location

Do not hard-fail if ambiguous; ignore unknown patterns.

#### Time parsing
Recognize at end or near end of string:
- `19:00`, `7:30`, `0730` (optional), `7pm`, `7 pm`, `19.00`
Convert to 24h local time.

Rules:
- If `7` alone is entered, do NOT infer time.
- If `7pm` → 19:00.
- If `7:3` incomplete → ignore until valid.

#### Location parsing
Recognize:
- `@ Place Name` (everything after `@` is location)
Examples:
- `Dinner @ Lebanese` → location="Lebanese", title="Dinner"
- `Dinner @ our house 19:00` should work regardless of order:
  - First parse time, then parse location.

#### Title cleanup
- Remove the parsed tokens (`19:00`, `@ Lebanese`) from title.
- Trim whitespace and stray punctuation.
- Final title must remain non-empty.

#### Visibility of parsed values
- If time/location parsed, reflect immediately in secondary controls (see below).
- If user edits the extracted time/location fields manually, stop auto-overwriting those fields from subsequent parsing (per-session “user overridden” flags).

---

## Secondary Controls (Hidden until expanded)

### Time control
- Label: `Time`
- Default: empty (“optional”)
- UI:
  - Mobile: native time picker if possible
  - Desktop: time input with validation
- Quick actions:
  - `All day` toggle (optional; can be a small chip)
  - If All day enabled: time cleared/disabled

### Who control
- Default selection: `Everyone`
- UI options:
  - Collapsed state: single chip `Everyone`
  - Tap expands into chips for each person (mum, dad, son, etc.)
- Logic:
  - Selecting any individual unselects `Everyone`.
  - If no individuals selected, revert to `Everyone`.
- Chips:
  - Selected: filled
  - Unselected: outline
  - Tap target >= 40px height on mobile

### Tag (optional in inline)
- Keep out of inline by default to reduce clutter.
- If included, make it part of “More options” only.

### More options link
- Text button: `More options`
- Opens modal with current inline values prefilled.

---

## Actions Row

### On mobile
- Prefer keyboard “Done” + optional inline ✔ button.
- If showing buttons, use sticky bottom within the inline row:
  - Primary: `Save`
  - Secondary: `Cancel`

### On desktop
- Optional buttons:
  - `Save` (primary)
  - `Cancel`

### Button visibility rules
- Show Save only when title is non-empty.
- Cancel always available while expanded.

---

## Unsaved State Handling
If user has typed anything (dirty state) and tries to collapse:
- Show a lightweight confirmation:
  - `Discard draft?` [Discard] [Keep editing]
- Exception: if draft is empty after trimming, collapse without prompt.

---

## Interaction Details

### Single-open inline add
- Opening inline add in a new day automatically collapses the previously open one.
- If previous has dirty state, show discard confirmation before switching.

### After save
- Clear inline fields (title/time/location/who) back to defaults.
- Collapse inline add.
- Scroll behavior:
  - If on mobile and day is partially off-screen, keep the day header visible (do not jump to top).
- Feedback:
  - Event appears in list immediately.
  - Optionally show a 2s subtle inline confirmation text under the created event:
    - `Saved: Dinner · Fri 19:00 · Everyone`

### Error states
- If save fails:
  - Keep inline expanded.
  - Show small inline error message below primary input (no toast required):
    - `Couldn’t save. Try again.`
  - Provide Retry (Save button remains).

---

## Data Model Expectations

### Create Event payload
- date/day identifier (ISO date)
- title (string)
- time_start (nullable string, e.g. `19:00`)
- all_day (boolean)
- location (nullable string)
- participants (array of IDs or `["everyone"]`)
- tag (optional; can be null)

### Defaults
- all_day: false
- time_start: null
- location: null
- participants: ["everyone"]

---

## Mobile-first Layout Requirements
- All interactive elements must meet minimum touch target size (>= 44px recommended).
- Inline add expanded layout should be single-column on small screens:
  - Primary input full width.
  - Secondary controls stacked (Time, Who).
- Avoid horizontal scrolling chips where possible; allow wrap.

---

## Accessibility Requirements
- Keyboard navigable on desktop (Tab order: title → time → who → more options → save/cancel).
- ARIA labels for:
  - Add event trigger
  - Save/Cancel
  - Who chips
- Visible focus state for keyboard users.
- Color contrast: meet WCAG AA for text and controls.

---

## Suggested UI Copy
- Trigger: `+ Add event`
- Placeholder: `Add an event…`
- More options: `More options`
- Error: `Couldn’t save. Try again.`
- Discard prompt: `Discard draft?`

---

## Acceptance Criteria (QA checklist)

### Inline add behavior
- [ ] Default view shows only `+ Add event` (no form fields visible).
- [ ] Tapping `+ Add event` expands inline add and autofocuses input.
- [ ] Enter/Done creates event when title present.
- [ ] Only one inline add open at a time; switching prompts discard if dirty.
- [ ] “Everyone” default works; selecting a person disables Everyone.
- [ ] Save failure shows inline error and preserves draft.

### Parsing
- [ ] `Dinner 19:00` sets time to 19:00 and title to “Dinner”.
- [ ] `Dinner @ Lebanese` sets location and title correctly.
- [ ] `Dinner @ Lebanese 7pm` sets both location and time.
- [ ] If user manually edits time, later typing doesn’t overwrite it.

### Mobile UX
- [ ] Touch targets meet size requirements.
- [ ] No cramped horizontal layout on narrow screens.
- [ ] Save is reachable without precision tapping.

---

## Implementation Notes (non-binding)
- Keep parsing logic small and testable (pure function: input string → {title,time,location}).
- Use per-inline-session flags: `timeOverridden`, `locationOverridden`.
- Prefer optimistic UI: insert event into list immediately, reconcile on response.

---
