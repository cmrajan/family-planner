# Family Planner — Playwright Review (Local)

Tested against `http://localhost:8788/` using the Playwright MCP on **2025-12-21**.

## Scope covered

- Navigation across weeks + “recent/upcoming weeks”
- Tabs: **This Week**, **Calendar**, **Events**, **To-dos**, **Meals & Focus**, **School Dates**
- Creating/editing/deleting:
  - Events (including tags + repeat)
  - To-dos (status cycling + moving between days)
  - Meals and weekly focus (auto-save)
- Share view (read-only mode)
- School dates overlay into calendar
- Mobile layout check (375×667)

## What’s working well (kept reading this way)

- **Week-as-a-doc mental model feels right**: everything is clearly “for this week” and editing is immediate.
- **Information density without feeling chaotic**: “This Week” dashboard is genuinely useful (events count, “next up”, school, open to-dos).
- **Events flow is strong**:
  - Per-day “+ Add event” is fast.
  - Full edit modal is clear (day/time/title/location/who/tag/repeat).
  - Filters (Everyone/Me, tag, search) are easy to scan.
- **Calendar is a good bridge** between “planner” and “schedule”:
  - Day popover with quick add + full edit is a nice touch.
  - School overlay works and adds real value.
- **To-dos feel practical**:
  - Status cycling `todo → doing → done → todo` is fast.
  - Moving a to-do between days (via the due-day dropdown) is intuitive.
- **Share view is excellent**: one-click hide-editing mode is exactly what skeptical family members need (“I can look without breaking anything”).
- **Mobile “More” menu** for Print/Share/Archive is a good pattern and keeps the header uncluttered.

## Bugs / rough edges spotted

- **Console error on load**: a resource 404s at startup (likely a missing `favicon` or asset). Worth fixing to keep the app feeling “polished”. ✅ Fixed (favicon added).
- **Print opened a blank tab** (`about:blank`) in my run. It may be browser/Playwright-specific, but it’s worth confirming manually in a normal browser session; if it’s consistent, the Print flow probably needs adjustment. ✅ Reworked to use an in-page print view + `window.print()` (no popup tab).
- **To-do assignee dropdowns appear “linked”**: after adding a to-do while “son” was selected, multiple other day sections’ assignee selectors also showed “son”. If this is meant to be a global “default assignee”, it should be explicit; otherwise it’ll feel like a bug.

## Mobile friendliness notes (375×667)

- Layout holds up well: tabs + content remain readable and tappable.
- The **header actions collapsing into “More”** is a good mobile decision.
- Calendar mobile UX is promising:
  - Clear guidance (“Swipe for weeks / scroll for time”).
  - Week/Month toggle is discoverable.

Potential mobile wins:
- Consider a **sticky primary action** (e.g. “+ Add” that opens a chooser: event/to-do/meal note) to reduce scrolling to find the right day section.
- For long lists (events/to-dos), consider a **“jump to today / jump to next item”** affordance.

## UX improvements (high ROI, low risk)

- **Make “who is this for?” more obvious everywhere**:
  - Events already show participants; replicate the clarity in “This Week” summaries (use small person chips consistently).
- **Reduce typing friction**:
  - Event title parsing is great—lean into it with inline examples and a tiny “Recognized: time/location/tag” confirmation.
  - For to-dos, add optional quick prefixes like `@mum`, `@son`, `mon`, `anytime`, `#sport`.
- **Clarify destructive actions**:
  - Archive flow already has a modal + preview (good). Add a brief “You can’t edit archived weeks” reminder in that dialog so the consequence is explicit.
- **Better feedback on auto-save**:
  - You already show “Saved” + “Updated …” in the footer; consider surfacing “Saving…” transiently when edits are pending (especially on mobile).

## Enhancements (make it a delight, not a chore)

### Adoption-focused features (for skeptical family)

- **Personal “Today” view**: show *only* what matters to the selected person (their events + their to-dos + their weekly focus) with one-tap switching.
- **Family “What’s coming up?” digest**:
  - A lightweight, shareable view (like your Share view) that shows the next 7 days across everyone.
  - Add “printable fridge view” as a first-class layout (big day headings, minimal controls).
- **One-minute weekly planning ritual**:
  - A guided checklist for Sunday night: confirm meals, confirm key events, pick one focus per person, decide “one fun thing”.
  - You already have the building blocks (meals/focus/archive carryover); this is mostly presentation.

### Sport + hobbies + learning (ideas you’ll actually use)

- **Training plan blocks** (tagged `sport`):
  - “Run / strength / match day” templates with default durations and a simple intensity label (easy/moderate/hard).
  - A weekly “training load” indicator that’s deliberately coarse (e.g. 0–10) to avoid over-tracking.
- **Instrument practice streaks (gentle)**:
  - Per person: “piano practice 3×/week” or “guitar 15 mins ×4”.
  - Completion is just a to-do, but the planner can surface a tiny progress bar for the week.
- **Learning goals as weekly focus + to-dos**:
  - Let “Weekly focus” optionally generate suggested to-dos (e.g. focus: “Piano” → 3 practice items spaced through the week).

### Non-gimmicky gamification (opt-in, family-friendly)

- **Family “wins” board** (weekly):
  - Each person gets 1–3 “wins” slots (e.g. “ran 5k”, “learned new chord”, “helped with dishes”).
  - No points required; it’s about reflection + encouragement.
- **Streaks with mercy rules**:
  - Weekly streaks (not daily), and allow one “skip token” per week so it doesn’t become punitive.
- **Team goals**:
  - “Family walk 2×”, “movie night”, “cook together once”.
  - Track as shared to-dos; celebrate completion in the This Week dashboard.

## Prioritized next steps (if you want a punch list)

1. ✅ Fix the startup 404 (small polish win).
2. ✅ Confirm whether Print works in a normal browser; if not, rework the Print path.
3. Decide whether to-do assignee selection is global default vs per-day; make it explicit either way.
4. Add a **personal “Today” view** and a **shareable 7-day digest** (these will move family adoption the most).
