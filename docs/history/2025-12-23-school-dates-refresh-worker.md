# Spec: School Dates Refresh Worker (Example School)

This spec defines a **simple, free-tier** Cloudflare Worker that keeps an example school term dates dataset in KV up to date, plus an **on-demand refresh** flow triggered by a button on the School Dates page.

It is written to match the current repo’s data model and APIs.

## Status

- [x] Scheduled worker implemented at `workers/school-dates-refresher/` (weekly cron, KV write with change detection).
- [x] Shared refresh + validation logic in `src/shared/schoolDatesRefresh.ts` reused by `POST /api/school-dates/refresh`.
- [x] UI refresh button and last-updated display on the School Dates page.

## 0) Current state (already in repo)

- KV key (current): `school_dates:v1:example-school:latest`
- KV binding (current): `FAMILY_PLANNER_KV`
- Domain schema (source of truth): `src/domain/types.ts` (`SchoolDatesDocument`, `SchoolDateItem`, etc.)
- Backend endpoint (current): `GET /api/school-dates?school=example-school` (creates/returns the doc)
- Frontend screen (current): `src/ui/screens/SchoolDates.tsx`

This work **must not** introduce a new storage shape; it updates the existing `SchoolDatesDocument` stored in KV.

---

## 1) Goals

1. **Weekly refresh (automatic):** A Cloudflare Worker runs on a weekly schedule and updates `school_dates:v1:example-school:latest` from the school’s website.
2. **On-demand refresh (manual):** A “Refresh now” button on the School Dates page triggers a refresh and then reloads the displayed data.
3. **Correctness-first:** Validate parsed data; never write invalid/partial results to KV.
4. **Simple + free tier:** No paid products, no external libraries, and minimal Cloudflare features (KV + Worker cron).

## 2) Non-goals

- Building a generalized scraper framework.
- Supporting multiple schools (keep the implementation ready for it, but only implement `example-school`).
- Adding client-side persistence beyond existing localStorage usage.
- Modifying WeekDoc behavior (unrelated).

---

## 3) Data model (must stay aligned)

### KV key

- Key: `school_dates:v1:<schoolSlug>:latest`
- For v1, only `<schoolSlug> = example-school`.

### Stored value

The Worker writes a `SchoolDatesDocument` (from `src/domain/types.ts`) to KV:

- `schemaVersion` must remain `1`.
- `timezone` must remain `"Europe/London"`.
- `source.fetchedAt` is set to the timestamp of the successful refresh.
- `source.etag`, `source.lastModified`, and `source.contentHash` may be set when available.

### Stable item IDs

IDs must be **stable and deterministic** across refreshes.

- Base format (matches existing seeded data):  
  `example-school|<academicYear>|<termSlug>|<type>|<startDate>`
- `termSlug` mapping:
  - `Michaelmas` → `michaelmas`
  - `Lent` → `lent`
  - `Summer` → `summer`
  - `null` → `other`
- Collision rule (rare but must be handled):
  - If the base ID already exists within the document, append a short stable suffix derived from the label, e.g.:  
    `...|<startDate>|<labelHash8>`

---

## 4) Worker behavior

### 4.1 Schedule

- Cron trigger: **weekly**, Mondays.
- Recommended cron: `0 5 * * 1` (05:00 UTC Mondays).

### 4.2 Inputs

- Source URL: `https://example.com/term-dates`
- Bound KV namespace: `FAMILY_PLANNER_KV`

### 4.3 Output

On success, the Worker writes the refreshed `SchoolDatesDocument` to:

- `school_dates:v1:example-school:latest`

### 4.4 Change detection (skip unnecessary writes)

- Compute a SHA-256 hash of the **normalized dataset** (recommend: hash the canonical JSON of `academicYears` after sorting items consistently).
- Store it in `source.contentHash` as `sha256:<hex>`.
- Read the existing doc (if any); if `existing.source.contentHash` matches the new hash, skip the KV write.

### 4.5 Logging

Log a small, human-readable summary:

- fetch status
- number of academic years parsed
- total number of items
- whether KV was updated or skipped (unchanged)

### 4.6 Error handling

- If fetch fails, parsing fails, or validation fails: **do not write**; throw (for scheduled runs) so the failure is visible in Worker logs.

---

## 5) Parsing spec (example school page)

### 5.1 Constraints

- Do not add a DOM library dependency.
- Prefer the built-in **`HTMLRewriter`** in Workers.

### 5.2 What to extract

Build `academicYears: SchoolAcademicYear[]`, where each year contains `items: SchoolDateItem[]`.

The page typically includes:

- Academic year headings like `2025/2026` or `2025-2026`.
- Term sections: Michaelmas / Lent / Summer (not always explicit; infer where possible).
- Event rows with a label and a date or date range.

### 5.3 Type mapping rules (keywords → `SchoolDateType`)

Map row labels to `SchoolDateType` using simple keyword rules (case-insensitive):

- includes `staff day` → `staff_day`
- includes `half term` → `holiday`
- includes `reading week` → `reading_week`
- includes `bank holiday` → `bank_holiday`
- includes `entrance` and `exam` → `exam`
- includes `term ends` or `end of term` → `term_end`
- includes `term commences` or `term starts` → `term_start`
- includes `school reopens` or `reopens` → `reopen`
- otherwise → `info`

### 5.4 Term inference (`SchoolTerm`)

Prefer (in order):

1. If the current section/header contains `Michaelmas`, `Lent`, or `Summer`, use that.
2. If the row label itself contains one of those term names, use that.
3. Otherwise `term = null`.

### 5.5 Date parsing rules

Input formats to support (examples from seeded data and typical UK wording):

- `8 September 2025`
- `Monday 8th September 2025`
- `27 October 2025 - 31 October 2025`
- `19 December 2025 (a.m.)`
- `16 December 2026 (p.m.)`

Rules:

- Output dates are ISO `YYYY-MM-DD` (no time).
- Parse month names with an explicit map (Jan..Dec).
- Ignore day-of-week tokens (`Monday`, `Tue`, etc.).
- Ignore ordinal suffixes (`st`, `nd`, `rd`, `th`).
- Day-part:
  - `(a.m.)` → `am`
  - `(p.m.)` → `pm`
  - otherwise `full`
- For ranges:
  - parse start and end dates; if the end date omits the year, assume the start year unless clearly crossing into the next year (keep it simple; log and reject ambiguous cases).

### 5.6 Audience + tags (simple defaults)

Keep it simple and consistent with the existing dataset:

- `tags`: always `["school", "example-school"]`
- `audience`:
  - `staff_day` → `["staff"]`
  - everything else → `["students"]` unless the label strongly indicates otherwise (optional refinement)

---

## 6) Validation (server-side, before KV write)

Validation must be defensive and explicit:

### 6.1 Document-level

- `schemaVersion === 1`
- `timezone === "Europe/London"`
- `source.name`, `source.slug`, `source.url`, `source.fetchedAt` are present and strings
- `academicYears.length >= 1`

### 6.2 Item-level (for every item)

- `id` is non-empty string
- `type` is a valid `SchoolDateType`
- `label` is non-empty string
- `academicYear` matches the year bucket it’s stored under
- `startDate` and `endDate` match `YYYY-MM-DD` and represent valid dates
- `startDate <= endDate`
- `startDayPart` and `endDayPart` are valid `SchoolDayPart`
- `audience` and `tags` are arrays of strings
- `sourceText` is non-empty string

If validation fails:

- log the specific validation errors
- abort without writing

Implementation note (recommended): move the existing validation logic in `functions/_lib/schoolDates.ts` into a shared module so both the Pages Function refresh endpoint and the scheduled Worker reuse it.

---

## 7) On-demand refresh API (Pages Function)

### Endpoint

- `POST /api/school-dates/refresh?school=example-school`

### Behavior

- Calls the same refresh logic as the scheduled Worker.
- Returns JSON with an explicit status and summary.

### Responses

- `200 OK`:
  ```json
  {
    "ok": true,
    "updated": true,
    "school": "example-school",
    "fetchedAt": "2025-12-23T12:34:56.000Z",
    "items": 42,
    "academicYears": 2
  }
  ```
- `200 OK` (no change):
  ```json
  { "ok": true, "updated": false, "school": "example-school" }
  ```
- `400 Bad Request` (`SCHOOL_REQUIRED`, `SCHOOL_NOT_FOUND`)
- `405 Method Not Allowed` (`METHOD_NOT_ALLOWED`)
- `500 Internal Server Error` (`SCHOOL_DATES_REFRESH_FAILED`)

Security note (keep simple): this endpoint can be open to all viewers of the app. If you later want to restrict, gate it via Cloudflare Access headers, but local dev must still work.

---

## 8) Frontend: Refresh button (School Dates page)

### UI changes (minimal)

On `src/ui/screens/SchoolDates.tsx`:

- Add a **“Refresh now”** button near the page title.
- Display “Last updated” using `data.source.fetchedAt` (already present in the schema).
- Button behavior:
  - disabled while refreshing
  - on click:
    1) `POST /api/school-dates/refresh?school=example-school`
    2) then refetch via existing GET flow
  - show a simple inline success/error message (no new UI framework)

### Acceptance behavior

- If refresh fails, the page continues to show the last known data and displays an error message.

---

## 9) Cloudflare Worker setup (simple, free tier)

### 9.1 Create the Worker

Create a separate Worker project inside this repo, e.g.:

- `workers/school-dates-refresher/`
  - `src/index.ts` (exports `scheduled`)
  - `wrangler.toml`

The Worker must:

- bind the same KV namespace as Pages (`FAMILY_PLANNER_KV`)
- run the weekly cron schedule

### 9.2 KV binding

In the Worker’s `wrangler.toml`, bind to the existing KV namespace used by the app:

- binding name: `FAMILY_PLANNER_KV`
- namespace: the same one configured for the Pages project

### 9.3 Cron trigger

Configure cron in the Worker (Dashboard or `wrangler.toml`):

- `0 5 * * 1`

### 9.4 Deploy

Deploy the Worker with Wrangler (or via the Cloudflare Dashboard).

### 9.5 Local dev

Local dev does not need the cron schedule.

- Use the on-demand endpoint (`POST /api/school-dates/refresh`) while running the app locally.
- Ensure local KV is used consistently (the repo currently uses `id = "local"` in `wrangler.toml` for dev).

---

## 10) Acceptance criteria (definition of done)

1. Weekly cron refresh updates `school_dates:v1:example-school:latest` in KV when the source page changes.
2. Manual refresh button triggers `POST /api/school-dates/refresh` and the UI reflects updated data.
3. Invalid parses never overwrite valid existing data.
4. All API responses are JSON with explicit error codes and status codes.
5. No new external dependencies introduced.
