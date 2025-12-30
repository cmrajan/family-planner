# KV Backup (Export/Import) — Implementation Spec

## Goal

Add a safe, explicit way to **export all data from `FAMILY_PLANNER_KV`** into a single downloadable file, and later **import that file** into a fresh (or existing) deployment.

This is intended as a manual “backup/restore” tool for:
- Weekly planner data (`week:*` and `archive:*` — includes events, todos, meals, notes)
- Meal ideas (`meal_ideas:v1`)
- School dates (`school_dates:v1:*`)
- Bin collections (`bins:*`)
- Any other future keys stored in the same KV namespace

## Non-goals
- Automated backups, schedules, retention policies
- Partial restores (v1 should restore the exact KV snapshot, not “merge some pieces”)
- Encryption at rest (the file is sensitive; storage/handling is the user’s responsibility)

## Current KV Key Inventory (as implemented)

The repo currently writes these keys:

- `week:{weekId}` where `{weekId}` is ISO `YYYY-Www`
  - Value: `WeekDoc` (JSON)
- `archive:{weekId}`
  - Value: `WeekDoc` (JSON) — archived weeks are read-only in normal app flows
- `meal_ideas:v1`
  - Value: `MealIdeasDoc` (JSON)
- `school_dates:v1:{schoolSlug}:latest`
  - Value: `SchoolDatesDocument` (JSON)
- `bins:{uprn}`
  - Value: `BinCollectionsDoc` (JSON)

Backup/export must not assume this list is complete forever; it must export *everything in the namespace*.

## Backup File Format (JSON)

### Top-level shape (v1)

Use a single JSON object so the UI can `JSON.parse` it and the server can validate it.

```ts
type KvBackupFormat = "family-planner-kv-backup";

interface KvBackupV1 {
  format: KvBackupFormat;          // "family-planner-kv-backup"
  formatVersion: 1;                // integer
  exportedAt: string;              // ISO timestamp
  exportedFrom: {
    app: "family-planner";
    environment?: "local" | "preview" | "production";
    hostname?: string;
  };
  entries: KvBackupEntryV1[];
}

interface KvBackupEntryV1 {
  key: string;
  encoding: "text" | "json";
  value: string;                   // if encoding === "json", this is the JSON string
  contentType?: string;            // default "application/json" when encoding=json
}
```

### Rationale
- Storing JSON values as a **string** avoids “parse + re-stringify” edge cases and makes unknown keys easy to preserve.
- `encoding` allows future non-JSON values.
- Keeping it boring: one file, explicit versioning.

### Export ordering
Sort `entries` by `key` ascending before returning, so exports are stable and diff-friendly.

## API Design (Pages Functions)

Add two endpoints under `functions/api/backup/`:

### 1) Export

`GET /api/backup/export`

Returns a single downloadable JSON file (the `KvBackupV1`).

**Success (200)**:
- Content-Type: `application/json`
- Content-Disposition: `attachment; filename="family-planner-kv-backup-YYYY-MM-DD.json"`
- Body: `{ ok: true, data: KvBackupV1 }` or **raw** `KvBackupV1` (choose one style; see “Consistency” below)

**Errors**:
- 401 `UNAUTHORIZED` (not permitted to export)
- 500 `EXPORT_FAILED`

**Implementation notes**:
- Use `env.FAMILY_PLANNER_KV.list({ cursor })` to paginate all keys.
- For each key:
  - `const raw = await env.FAMILY_PLANNER_KV.get(key)` (string)
  - If `raw === null`: skip (or include with `value: ""` and mark as missing; skipping is simpler)
  - Decide `encoding`:
    - If `raw` looks like JSON (`raw.trim().startsWith("{") || "["`) and parses successfully, set `encoding: "json"`.
    - Otherwise `encoding: "text"`.
  - Store `value` as the raw string (even for JSON).
- Use a small concurrency limit (e.g. 10–20 in-flight `get` calls) to avoid spikes.

### 2) Import

`POST /api/backup/import`

Request body: the backup JSON (`KvBackupV1`).

Query params:
- `dryRun=1` (default `0`): validate and report what would happen; do not write to KV
- `mode=missing-only|overwrite`
  - `missing-only` (default): **fail** if any key already exists
  - `overwrite`: overwrite existing keys, but only with explicit confirmation (see below)

**Success (200)**:
- `{ ok: true, data: { mode, dryRun, importedKeys, skippedKeys, conflicts, warnings } }`

**Errors**:
- 400 `INVALID_JSON` (body not JSON)
- 400 `BACKUP_FORMAT_INVALID` (wrong `format`/`formatVersion`/shape)
- 400 `BACKUP_DUPLICATE_KEYS` (same key appears twice)
- 400 `KEY_INVALID` (key empty/too long/contains illegal characters)
- 400 `VALUE_TOO_LARGE` (exceeds a defined safe limit)
- 400 `VALIDATION_FAILED` (known schema fails validation)
- 409 `IMPORT_CONFLICTS` (mode=missing-only and keys already exist)
- 401 `UNAUTHORIZED`
- 500 `IMPORT_FAILED`

**Implementation notes**:
- Parse JSON, validate top-level fields and entry structure.
- Validate key constraints defensively:
  - `key.trim().length > 0`
  - limit length (e.g. 512)
  - reject keys with control chars
- Enforce uniqueness of `entries[].key`.
- For each entry:
  - If `encoding === "json"`: ensure `JSON.parse(entry.value)` succeeds.
  - If the key matches a known prefix, validate content against the repo’s existing validators before allowing a write:
    - `week:{weekId}` and `archive:{weekId}`:
      - extract `{weekId}` and validate with `parseWeekId`
      - validate parsed doc with `validateWeekDoc(doc, weekId)`
    - `meal_ideas:v1`: validate with `validateMealIdeasDoc`
    - `school_dates:v1:*`: validate with `validateSchoolDatesDocument`
    - `bins:*`: validate with `validateBinCollectionsDoc`
  - Unknown keys:
    - v1 behavior should still import them (because the user asked for “all KV”).
    - Safety check: require `encoding` to be either `"text"` or `"json"` and cap size.
- Conflict detection (when `mode=missing-only`):
  - Check existence with `await env.FAMILY_PLANNER_KV.get(key)` before writing.
  - Collect conflicts and return `409 IMPORT_CONFLICTS` with a list of keys.
- Overwrite protection (when `mode=overwrite`):
  - Require a second explicit confirmation signal, e.g. request header `X-Backup-Confirm: overwrite`
  - Without it, return `400 OVERWRITE_CONFIRM_REQUIRED`

## Auth / Safety Model

Export/import should be treated as **admin-only**. Suggested gating:

1) Allow if request is local (`hostname` is `localhost` or `127.0.0.1`).
2) Otherwise require Cloudflare Access header `cf-access-authenticated-user-email` and check it against an allowlist:
   - Add env var `BACKUP_ADMIN_EMAILS` as a comma-separated list.
   - If missing/empty: deny by default (fail closed) in non-local requests.

This keeps local development working without Access, but prevents accidental exposure in production.

## UI/UX Spec (React)

Add a small “Backup / Restore” UI surfaced via the existing **More** menu (don’t add routing).

### Entry point
- Add a “Backup / Restore” button to the “More” menu panel in `src/app/App.tsx`.
- Clicking it switches to a new tab key `backup` (a hidden tab not shown in `Tabs`).

### Backup screen requirements
Create `src/ui/screens/Backup.tsx` (new screen) with:

**Export**
- Button: “Download backup”
- On click:
  - `fetch("/api/backup/export")`
  - If success: download a `.json` file (create blob + `URL.createObjectURL`)
  - Show status (loading / error)

**Import**
- `<input type="file" accept="application/json">`
- Parse the file client-side to show a small summary before sending:
  - number of entries
  - how many look like `week:*`, `archive:*`, etc.
- Two actions:
  - “Validate only” → `POST /api/backup/import?dryRun=1`
  - “Import” → `POST /api/backup/import?dryRun=0`
- Include a toggle:
  - “Overwrite existing keys” (off by default)
  - When enabled:
    - require typing a short confirmation phrase (e.g. `OVERWRITE`) to enable the Import button
    - server must still require `X-Backup-Confirm: overwrite`

### Navigation
- Provide a “Back” button that returns to the previously selected main tab.

## Consistency with existing API patterns

The repo currently uses `{ ok: true, data: ... }` and `{ ok: false, error: { code, message } }`.

For backup endpoints:
- Prefer using `jsonOk/jsonError` for consistency (even for export).
- If you need a raw file response (no `{ok:true}` wrapper) for download ergonomics, explicitly document that `/api/backup/export` is the exception.

## Validation & Correctness Rules

Server-side validation must run **before writing to KV**, per repo rules.

Known documents must conform to existing schemas:
- `WeekDoc` (timezone fixed to `Europe/London`, ISO week IDs, etc.)
- `MealIdeasDoc` (versioned with optimistic concurrency in normal flows)
- `SchoolDatesDocument`
- `BinCollectionsDoc`

Import is allowed to restore these documents even if they’re “old”, but it must not write invalid shapes.

## Operational Considerations

- **Timeouts / size**: keep the implementation simple, but add a soft cap (e.g. 5–10MB total export) with a clear error (`EXPORT_TOO_LARGE`). If you hit this, move to a cursor-based export/import workflow later.
- **No silent overwrite**: default import mode must refuse to write if keys exist.
- **Idempotency**:
  - `missing-only` import is safe to retry (it will conflict after the first successful run).
  - `overwrite` is destructive and must be explicit.

## Minimal Acceptance Checklist

- Export downloads a JSON file that contains all keys currently in KV.
- Import (dry run) validates and reports issues without writing.
- Import (missing-only) succeeds into an empty KV namespace.
- Import refuses to overwrite existing keys unless overwrite is explicitly confirmed.
- All responses are JSON with explicit status codes and machine-readable error codes.
