# AGENTS.md

This file defines how automated agents (including Codex) must work in this repository.
The goal is long-term maintainability, clarity, and low operational burden.

## Core Principles
- Prefer boring, explicit code over clever abstractions.
- Optimize for a future human (me) reading and modifying this code.
- Minimize dependencies and framework magic.
- Small, typed, composable functions > large classes.
- Data correctness beats UI polish.

---

## Architecture Rules
- Frontend: React + Vite + TypeScript only.
- Backend: Cloudflare Pages Functions (Workers runtime).
- Storage: Cloudflare KV only.
- No client-side persistence except localStorage for non-critical UI state.
- Optional auth: may read Cloudflare Access headers, but local dev must work without it.

---

## Data & State Rules
- The **WeekDoc** is the source of truth.
- The app always edits a full WeekDoc in memory and persists it via `PUT`.
- Partial updates are not allowed in v1.
- Use optimistic concurrency with a `version` field.
- Never silently overwrite newer server data.
- Archived weeks are read-only.

---

## KV Usage Rules
- One document per week: `week:{weekId}`.
- One archive per week: `archive:{weekId}`.
- Only introduce new keys for valid reason
- Stored data must always conform to the WeekDoc schema. Unless a different key.
- Validate input on the server before writing to KV.

---

## Time & Date Rules
- All week calculations use **ISO weeks**.
- Timezone is fixed to `Europe/London`.
- Do not introduce date libraries unless strictly necessary.
- Week IDs must match the format: `YYYY-Www`.

---

## Frontend Rules
- Mobile-first layout.
- No heavy routing; tabs or simple conditional rendering only.
- No global state libraries (Redux, Zustand, etc.).
- Local component state + lifting state up is sufficient.
- All edits auto-save with a debounce.
- Handle version conflicts explicitly (409 responses).

---

## Styling Rules
- Use plain CSS or very light CSS modules.
- No UI frameworks (MUI, Chakra, etc.).
- Favor readable layout over visual flair.
- Touch targets must be usable on mobile.

---

## API Rules
- All API responses are JSON.
- Always return explicit HTTP status codes.
- Error responses must include a machine-readable error code.
- Validate inputs defensively (day ranges, IDs, string lengths).
- Never trust client-provided data blindly.

---

## TypeScript Rules
- Strict typing enabled.
- Avoid `any`.
- Use narrow union types (e.g., `PersonId`).
- Keep shared domain types in a single place.
- Backend and frontend types must stay aligned.

---

## ID Rules
- IDs are generated client-side.
- Prefer `crypto.randomUUID()` when available.
- IDs must be opaque strings; no encoded meaning.

---

## Editing & Maintenance
- Keep files small and focused.
- Avoid cross-cutting helpers that obscure behavior.
- When adding a feature, update:
  - Domain types
  - Validation logic
  - UI state handling
- Do not add features that require payments, or third-party APIs (unless vetted first with confirmation).

---

## Testing Philosophy
- Tests are optional but encouraged for:
  - Week ID calculation
  - Rollover logic
- Prefer small, deterministic tests.
- Do not introduce heavy testing frameworks.

---

## What NOT To Do
- Do not introduce background jobs or cron triggers.
- Do not store secrets in code.
- Do not optimize prematurely.
- Do not redesign the data model casually.

---

## Agent Instructions
When acting on this repository:
- Follow this file strictly.
- Ask before making architectural changes.
- Keep PRs and changes small and focused.
- Explain non-obvious decisions in comments.
- Default to the simplest working solution.

The correct implementation is the one that is easiest to understand six months from now.
