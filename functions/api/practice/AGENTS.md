# AGENTS.md (Practice / Skills Tracking backend scope)

This file applies to Practice/skills tracking backend code under `functions/api/practice/`.
It adds constraints specific to the Practice feature and may be stricter than the repo root.

## Feature boundaries

- The weekly planner API must keep working exactly as-is.
- **Do not add practice data to `WeekDoc`** or planner KV keys (`week:*`, `archive:*`).
- Practice data lives in a separate KV document: key `practice:v1`, value `PracticeDoc`.
- Do not introduce additional KV keys for Practice v1 unless explicitly agreed first.

## Product rules (Practice)

- No streaks, no “missed day” penalties, no guilt/shame copy.
- Push reminders are allowed only when they are **explicitly opt-in** (per person/device) and never framed as punishment.

## API rules (Practice)

- All responses are JSON with explicit status codes.
- Success shape: `{ ok: true, data: ... }`
- Error shape: `{ ok: false, error: { code, message } }`
- Use machine-readable error codes consistently (e.g. `INVALID_JSON`, `VALIDATION_FAILED`, `VERSION_CONFLICT`).
- Validate inputs defensively; never trust client-provided data.

## Concurrency & safety

- The **PracticeDoc** is the source of truth for this feature.
- Only support full-document replacement via `PUT` (no partial updates in v1).
- Enforce optimistic concurrency using `version`:
  - Require `If-Match-Version` header on `PUT`.
  - Reject mismatches with `409 VERSION_CONFLICT`.
  - Never silently overwrite newer server data.
- On `GET`, create a default `PracticeDoc` if missing (server-side seed).

## Data constraints

- Timezone is fixed to `Europe/London`.
- Week IDs must be ISO `YYYY-Www`.
- Put hard limits on list sizes (skills/logs/reviews) to avoid KV bloat; reject with `400 VALIDATION_FAILED`.

## Implementation style

- Prefer small, explicit functions over abstractions.
- Keep domain types aligned with the frontend via `src/domain/types.ts`.
- Avoid new dependencies and framework magic.
- Keep handler logic readable: parse → validate → load → conflict check → write → respond.
