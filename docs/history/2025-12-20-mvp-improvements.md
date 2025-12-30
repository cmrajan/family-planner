# MVP Improvements (Simple + Mobile-First) - Triage

These are small, low-risk ideas to make the planner easier to use on phones and laptops
without adding complexity or new services. Meals are low priority.

## Now (highest impact, low risk)
- Clear "Saved" / "Saving..." indicator near the header time.
- Show which person is selected in the header more visibly.
- Add empty-state hints for each tab (short, friendly, 1 line).
- Keep the last-used person as default for new to-dos/events.
- Add keyboard-friendly shortcuts on desktop (Enter to save, Esc to close).
- Slightly larger touch targets on add buttons.
- Ensure archived weeks are visually locked (disable inputs + muted styles).

### Now checklist (order)
1. Clear "Saved" / "Saving..." indicator near the header time.
2. Ensure archived weeks are visually locked (disable inputs + muted styles).
3. Show which person is selected in the header more visibly.
4. Add empty-state hints for each tab (short, friendly, 1 line).
5. Keep the last-used person as default for new to-dos/events.
6. Add keyboard-friendly shortcuts on desktop (Enter to save, Esc to close).
7. Slightly larger touch targets on add buttons.

## Soon (moderate effort, high usability)
- Make add flows one-tap: inline quick-add for events and to-dos per day.
- Let time be optional; allow "All day" toggles.
- Add smart defaults when adding from a day column (pre-fill day + time).
- "This week" button should scroll to current day section if already on current week.
- Sticky tabs on scroll for easier navigation on long weeks.
- Preserve scroll position when switching tabs.
- Validate time format at entry; tolerate partial input like "7" => "07:00".

## Later (nice, but not essential yet)
- Rollover preview: show what will copy to next week before confirming.
- Warn when viewing archived week (read-only banner).
- Quick jump to any week by typing `YYYY-Www`.
- Allow drag re-order within a day (optional; long-press on mobile).
- Basic repeating patterns (weekly) with a simple "repeat for N weeks".
- Add simple location field for events (short text, optional).
- Quick complete toggle with swipe on mobile (left/right).
- Batch actions: mark all done, clear completed.
- Simple due day dropdown (Mon-Sun) to surface in the "Next events" list.
- Reduce vertical density on mobile with collapsible day sections.
- Export/print week view as a plain HTML page.
- "Share view" toggle that hides edit controls for kitchen tablet use.

## Lowest priority (Meals & Focus)
- Add "copy last week" for meals and focus only.
- Add lightweight template text like "Leftovers" or "Out" suggestions.
