# AGENTS.md (Practice / Skills Tracking scope)

This file applies to the **Practice dashboard** feature code under `src/ui/practice/`.
It intentionally adds constraints that are specific to skills tracking and may be stricter than the repo root.

## Feature boundaries

- The weekly planner must keep working exactly as-is.
- **Do not add practice data to `WeekDoc`** or planner KV keys (`week:*`, `archive:*`).
- Practice data lives in its own document (`PracticeDoc`) stored under the KV key `practice:v1`.
- The Practice UI is a **single top-level tab** with simple sub-views; no additional routing libraries.

## Product rules (non-negotiable)

- No streaks, no “missed day” penalties, no red shame states.
- No leaderboards or rankings.
- The core metric is **Session** (a logged practice session).
- “Never miss twice” is an **in-app nudge only** (shown on open), never a push notification.
- Push reminders are allowed only when they are **explicitly opt-in**, neutral in tone, and never framed as guilt/shame.

## Data & state rules (Practice)

- The **PracticeDoc** is the source of truth for this feature.
- Edit a full `PracticeDoc` in memory and persist via `PUT` with optimistic concurrency (`version`).
- Handle `409 VERSION_CONFLICT` explicitly; never silently overwrite newer server data.
- Derived metrics (weekly dots, sessions, consistency, best week) must be computed from logs in small, pure functions.
- Keep the data model lean: prefer derived views over stored aggregates.

## UI rules (Practice)

- Mobile-first, calm dashboard aesthetic; readable beats “flashy”.
- Keep screens simple: Family dashboard → Personal dashboard → Skill detail → Weekly review.
- Copy must be neutral and observational (no commands, no guilt).
- Touch targets must be comfortable on mobile; avoid dense tables.
- Avoid new dependencies (no charting libs); use simple dots/bars rendered with plain React + CSS.

## Implementation style

- Prefer small, typed, composable functions and straightforward components.
- Avoid cross-cutting “magic” helpers; keep behavior obvious at call sites.
- Avoid `any` and keep types shared with the backend aligned via `src/domain/types.ts`.

## What not to do

- Don’t store practice state in localStorage (except non-critical UI state like “selected person”).
- Don’t mix Practice actions into existing planner tabs (Events/Todos/Meals/etc.).
- Don’t introduce additional KV keys unless explicitly justified and agreed first.
