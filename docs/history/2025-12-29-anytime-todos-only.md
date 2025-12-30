# Anytime-Only To-dos (Global TodoDoc) — Spec

Status: draft for implementation by another agent

## Context (current behavior)

Today, to-dos live inside `WeekDoc.todos` and are split by:
- **Day-specific** (`dueDay: 0..6`) rendered as Mon–Sun sections.
- **Anytime** (`dueDay: undefined`) rendered as an “Anytime” section.

This creates a lot of UI + data complexity for limited benefit, especially on mobile.

## Goals

- Keep **only “Anytime” to-dos** (no per-day to-dos).
- Store to-dos in their **own KV document** (not inside `WeekDoc`).
- Preserve the repo’s core data rules:
  - Full-document edits only (no partial updates).
  - Optimistic concurrency via a `version` field.
  - Never silently overwrite newer server data (explicit 409 handling).
- Keep local dev working without Cloudflare Access.

## Non-goals (for this change)

- Reintroducing scheduling (day/weekday) for todos.
- Complex recurrence logic (weekly repeats, due dates).
- Multiple todo lists/projects.
- Client-side persistence (beyond localStorage for non-critical UI state).

## High-level changes

1. **Remove day-specific to-dos**:
   - Remove `dueDay` everywhere (type, validation, UI, printing).
   - Replace To-dos screen with a single list (optionally grouped by status).
2. **Introduce `TodosDoc` stored in KV**:
   - Key: `todos:v1`
   - Endpoints: `GET /api/todos`, `PUT /api/todos`
3. **Update app screens that currently read `week.todos`**:
   - `This Week` summary (open count + preview)
   - `To-dos` screen (full management UI)
   - `Fridge` and `Digest` (if they display todos)
   - Print layout (if it prints todos)
4. **Migration path**:
   - Provide an explicit “Import week todos” action (no silent migration).

## Domain model

### New doc (source of truth for todos)

Add to `src/domain/types.ts`:

```ts
export interface TodosDoc {
  schemaVersion: 1;
  timezone: "Europe/London";
  version: number;
  updatedAt: string;
  todos: TodoItem[];
}
```

### Update `TodoItem` (remove due-day concept)

Change `TodoItem` in `src/domain/types.ts` to remove `dueDay`:

```ts
export interface TodoItem {
  id: string;
  title: string;
  owner: PersonId;
  status: TodoStatus;
  effort?: Effort;
  order?: number; // manual ordering within the global list
}
```

Notes:
- Keep `TodoStatus` as `"todo" | "doing" | "done"` (already used).
- Keep `Effort` as-is.
- `order` is global (not per-day anymore). Use `0..n-1` ordering.

## KV storage

### Key naming

Add to `functions/_lib/store.ts`:
- `todosKey(): string` → returns `"todos:v1"`
- `getTodos(env): Promise<TodosDoc | null>`
- `putTodos(env, doc): Promise<void>`
- `getOrCreateTodos(env): Promise<TodosDoc>` (mirrors meal ideas + practice patterns)

### Default doc

Create a small helper (either in `functions/_lib/todos.ts` or alongside store) that returns:

```ts
const defaultTodosDoc = (): TodosDoc => ({
  schemaVersion: 1,
  timezone: "Europe/London",
  version: 1,
  updatedAt: new Date().toISOString(),
  todos: [],
});
```

## Server API

### Endpoint: `GET /api/todos`

- Response: `{ ok: true, data: { doc: TodosDoc, viewer?: ViewerInfo } }`
- Behavior:
  - If `todos:v1` is missing: create default doc, persist it, return it.
  - `viewer` should match the existing `getViewerInfo(...)` behavior (optional).

### Endpoint: `PUT /api/todos`

- Request body: full `TodosDoc`
- Headers:
  - `If-Match-Version: <number>` (preferred)
- Concurrency:
  - Load stored doc, compare versions (same approach as `PUT /api/week/:id`)
  - If mismatch: `409` with `{ code: "VERSION_CONFLICT" }`
- On success:
  - Increment `version`
  - Set `updatedAt` to `new Date().toISOString()`
  - Persist as JSON to KV
  - Return updated doc

### Validation

Add `validateTodosDoc(doc: TodosDoc): string[]` in `functions/_lib/validate.ts`:
- `schemaVersion === 1`
- `timezone === "Europe/London"`
- `version` integer `>= 1`
- `updatedAt` is a string
- `todos` array length within limit (suggest `MAX_TODOS = 500`)
- For each todo:
  - `id` non-empty string
  - `title` trimmed, `1..140`
  - `owner` in allowed people union (`"mum" | "dad" | "son"`)
  - `status` one of `"todo" | "doing" | "done"`
  - `effort` (if set) one of `"5m" | "15m" | "30m" | "1h+"`
  - `order` (if set) integer `>= 0`

Update `validateTodo(...)` to remove `dueDay` checks (or create a separate `validateTodosDocTodo(...)`).

### Backup import support

Update `functions/api/backup/import.ts` `validateKnownEntry(...)`:
- Add a branch for key `todos:v1` and validate via `validateTodosDoc(...)`.

Backup export already includes all keys (no change needed).

## Frontend changes

### API client

Add in `src/api/client.ts`:
- `fetchTodos(): Promise<TodosDoc>`
- `putTodos(doc: TodosDoc): Promise<TodosDoc>`

Match the existing patterns:
- `If-Match-Version` header
- `requestJson<T>()` error handling

### App state + autosave

In `src/app/App.tsx`:
- Add state `todosDoc: TodosDoc | null`
- Load it on startup (alongside `fetchCurrentWeek()` and other docs)
- Add `saveTodos(...)` and a debounced version (same as meal ideas / practice)
- Add `onUpdateTodos(mutator)` that:
  - clones the doc (simple shallow clone + `todos: [...prev.todos]`)
  - applies the mutator
  - debounced save

Important: split “read-only” behavior:
- Week read-only must still block `WeekDoc` edits.
- Global todos should remain editable even when viewing an archived week.
- Share view should still be read-only for everything.

Suggested booleans:
- `weekReadOnly` (current meaning: archived week)
- `shareView` (existing)
- `viewOnlyWeek = weekReadOnly || shareView`
- `viewOnlyTodos = shareView`

### To-dos screen

Update `src/ui/screens/Todos.tsx`:
- Props become:
  - `doc: TodosDoc`
  - `people: PersonId[]` (from current week)
  - `me: PersonId`
  - `onUpdate: (mutator: (draft: TodosDoc) => void) => void`
  - `readOnly: boolean` (use `shareView` only)
- UI simplification:
  - Remove Mon–Sun groups entirely.
  - Replace with a single list, optionally grouped by status:
    - “Doing”, “To-do”, “Done” (done can be collapsed by default).
  - Keep:
    - Filters: `all | mine | open`
    - “Mark all done”, “Clear completed”
    - Quick add (single input + owner select)
    - Modal add/edit (title, owner, status, effort)
    - Drag reorder within the single list (updates `order`)
- Remove:
  - Due day dropdowns and any “jump to day” behavior.
  - Mobile collapsed-days logic (no longer needed).

Ordering:
- Replace `getNextOrder(doc, day)` with `getNextOrder(doc)` (global).
- Replace reorder logic to operate across the single list (not per-day).

### Other screens

Update any screen reading `week.todos`:
- `src/ui/screens/ThisWeek.tsx`: open count + preview comes from `TodosDoc.todos` (filtered by `status !== "done"`).
- `src/ui/screens/Fridge.tsx` and `src/ui/screens/Digest.tsx`: if they show to-dos, switch to `TodosDoc` (or remove the section if it’s not essential).
- Printing in `src/app/App.tsx`: replace “Todos by day” with a simple “To-dos” section (open first, done later or omitted).

### Universal Add

Update `src/ui/components/UniversalAddFab.tsx`:
- Todos should always be added to `TodosDoc` (global) regardless of parsed due date/day.
- In the review UI:
  - Replace “Due day” with a label like “List: Anytime”.
  - Keep owner + effort parsing.
- In the validation:
  - Remove `dueDate`/`dueDay` validation requirements for todos.

Optional: keep parsing of dates but convert it into title text (e.g. “(by Tue)”); only if you really want to preserve the hint without reintroducing scheduling.

## Migration / transition plan (explicit, safe)

Do not auto-migrate existing week to-dos into `todos:v1`, I am happy to have the old todos gone.

- Remove any remaining week-todo UI so users don’t keep re-adding to the old structure.

## UX improvements (small, high-value)

These are enhancements that keep the model simple:

1. **Search box** at top of To-dos (client-side filter on title).
2. **Status sections** (Doing/To-do/Done) with Done collapsed by default.
3. **Quick “Start” action**: one click toggles `todo → doing`.
4. **Effort chips**: one-tap filter (e.g. show only `5m` + `15m`).
5. **Sticky quick-add** on mobile: keep it at top to reduce scrolling.

## Implementation checklist (for the agent)

- Add `TodosDoc` to `src/domain/types.ts` and remove `TodoItem.dueDay`.
- Add KV helpers in `functions/_lib/store.ts` for `todos:v1`.
- Add `functions/api/todos.ts` (or `functions/api/todos/index.ts` depending on routing style).
- Add `validateTodosDoc(...)` and update week todo validation to remove `dueDay`.
- Update backup import to validate `todos:v1`.
- Add `fetchTodos`/`putTodos` in `src/api/client.ts`.
- Update `src/app/App.tsx` to load + autosave `TodosDoc`, and to separate `weekReadOnly` vs `shareView`.
- Refactor `src/ui/screens/Todos.tsx` to single-list anytime-only UI.
- Update `ThisWeek`, `Digest`, `Fridge`, print view, and `UniversalAddFab` to use global todos.
- Add explicit “Import this week’s to-dos…” migration button + confirm + conflict handling.

