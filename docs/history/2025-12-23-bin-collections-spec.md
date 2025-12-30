# Bin Collections Feature Spec (Example Council API)

  ## Goal
  Add a “Bin collections” feature similar to the existing “School dates” feature:
  - Fetch bin collection events from a council API.
  - Store normalized results in Cloudflare KV (its own document shape).
  - Auto-refresh weekly via a scheduled worker, and allow a manual “Refresh now” button in the UI.
  - Only write to KV when the **content hash** changes (no-op if unchanged).

  Non-goals:
  - No external services beyond the council API.
  - No client-side persistence (except optional UI-only localStorage state).
  - No routing framework changes; keep UI lightweight.

  ---

  ## Source Data
  Council API endpoint (example):
  `https://example.com/api/collections/{UPRN}?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD`

  Example response shape:
  - Root fields: `uprn`, `success`, `error_code`, `error_description`, `code_description`, `collections[]`
  - Each collection item: `service`, `round`, `schedule`, `day`, `date` (e.g. `"01/12/2025 00:00:00"`),
  `read_date`

  ### Inputs
  - `UPRN` should be configured (env/config). Do not hardcode a real household UPRN in the repo.
  - Date range:
    - Default: fetch **today → today + 365 days**
    - `from_date` / `to_date` format: `YYYY-MM-DD` (zero-padded)

  Timezone:
  - Treat event dates as **Europe/London** local dates.
  - Store dates as date-only strings `YYYY-MM-DD` (not timestamps).

  ---

  ## KV Storage
  ### KV key
  - Single key per uprn (one document): `bins:{uprn}`
    - Example: `bins:YOUR_UPRN`

  Rationale: one key, one doc; avoids extra keys.

  ### Stored document: `BinCollectionsDoc`
  ```ts
  type BinServiceId = "food" | "recycling" | "domestic" | "garden" | "unknown";

  type BinCollectionEvent = {
    date: string;        // YYYY-MM-DD (Europe/London local date)
    serviceId: BinServiceId;
    serviceName: string; // source `service`
    round: string;
    schedule: string;
    dayName: string;     // source `day` (e.g. "Monday")
    readDate: string;    // source `read_date` (display string)
  };

  type BinCollectionsDoc = {
    schemaVersion: 1;
    uprn: string;

    rangeFrom: string;   // YYYY-MM-DD used in fetch
    rangeTo: string;     // YYYY-MM-DD used in fetch

    sourceHash: string;  // sha256 hex of normalized content
    updatedAt: string;   // ISO timestamp (only changes when hash changes)

    events: BinCollectionEvent[]; // sorted by date asc, then serviceId/serviceName
  };

  ### Hashing rule (must)

  - Compute sourceHash from a canonical/normalized representation to avoid hash churn:
      - Keep only normalized fields used in events.
      - Convert date to YYYY-MM-DD.
      - Trim strings.
      - Sort deterministically.
      - Then sha256(JSON.stringify(normalizedPayload)).
  - KV write only when:
      - KV missing, OR
      - stored sourceHash !== newlyComputedHash
  - If hash unchanged: return success, no KV write.

  ———

  ## Service Mapping

  Map council service string → internal serviceId:

  - "Food Waste Collection Service" → food
  - "Recycling Collection Service" → recycling
  - "Domestic Waste Collection Service" → domestic
  - "Garden Waste Collection Service" → garden
  - Anything else → unknown (still stored/displayed)

  Mapping must be explicit and easy to edit.

  ———

  ## Backend (Cloudflare Pages Functions / Workers runtime)

  ### Shared behavior

  - All responses JSON with explicit HTTP codes.
  - Error responses include machine-readable code.

  ### Endpoints

  1. GET /api/bins

  - Returns the current BinCollectionsDoc from KV.
  - If missing: return 404 with { code: "bins_not_found" }.

  2. POST /api/bins/refresh

  - Triggers a fetch from the council API, normalization, hashing, and conditional KV write.
  - Response:
      - 200 with { changed: boolean, doc?: BinCollectionsDoc }
      - changed: false when hash unchanged (optionally still return current doc).
  - Validation failures: 502 with { code: "bins_source_invalid", details? }
  - Upstream HTTP failure: 502 with { code: "bins_source_fetch_failed", status? }

  Auth:

  - Optional: allow Cloudflare Access gating in production if the rest of the app uses it.
  - Must work locally without Access headers.

  ### Scheduled refresh (weekly)

  - Add a scheduled worker trigger (cron) that calls the same refresh logic as the manual endpoint.
  - Suggested schedule: weekly early morning UK time (implement in UTC cron).
  - The scheduled job must:
      - Fetch+normalize+hash.
      - Only KV-write if changed.
      - Log outcomes: changed vs unchanged vs failed.

  Local dev:

  - Scheduled job won’t run; manual refresh should still work.

  ———

  ## Frontend (React + Vite + TS)

  ### UI requirements

  - Add a “Bin collections” section similar to “School dates”.
  - Display:
      - Next upcoming collection date(s) (multiple services can occur same day).
      - A list for upcoming ~6–10 weeks grouped by date, showing bin types.
  - Provide a “Refresh now” button:
      - Calls POST /api/bins/refresh
      - Shows loading state; disables while in-flight
      - On success: updates UI with returned doc or refetches via GET /api/bins
      - On error: show an inline error message (no silent failures)

  Mobile-first:

  - Use existing styling approach (plain CSS / light modules).
  - Large touch targets.

  No client persistence of the data:

  - Data comes from backend; UI can cache in memory only.

  ———

  ## Validation & Parsing Details

  ### Parse source date

  Input format: "DD/MM/YYYY HH:mm:ss"

  - Must parse without adding date libraries.
  - Convert to YYYY-MM-DD (local date in Europe/London).
  - If parse fails: treat as invalid source payload.

  ### Defensive checks (server)

  - Root success === true and error_code === 0 (or treat as upstream error).
  - uprn matches expected requested uprn.
  - collections is an array.
  - Each event has required strings within reasonable lengths (define max lengths, e.g. 200).
  - After normalization, ensure events sorted and date strings valid.

  ———

  ## Error Handling & Status Codes

  - GET /api/bins
      - 200: { doc }
      - 404: { code: "bins_not_found" }
  - POST /api/bins/refresh
      - 200: { changed, doc }
      - 502: { code: "bins_source_fetch_failed" | "bins_source_invalid" }
      - 500: { code: "bins_internal_error" }

  ———

  ## Testing (lightweight, deterministic)

  Add small unit tests (if project has a test pattern) for:

  - Parsing "DD/MM/YYYY HH:mm:ss" → YYYY-MM-DD
  - Service mapping → serviceId
  - Canonicalization + hashing stability (sorting + trimming)
  - “No write if unchanged” logic (hash compare)

  No heavy test frameworks introduced.

  ———

  ## Operational Notes

  - Ensure council API is called server-side only.
  - Consider basic rate limiting on manual refresh (e.g., ignore if called repeatedly within 30s) if needed; if
    implemented, must be explicit and return { code: "bins_refresh_throttled" }.

  ———

  ## Acceptance Criteria

  - Manual refresh updates KV only when content changes (hash differs).
  - Weekly scheduled refresh runs and also respects the hash rule.
  - UI shows next and upcoming bin collections clearly on mobile.
  - All API responses are JSON with explicit status codes and machine-readable error codes.
  - No new dependencies beyond what the repo already uses.
