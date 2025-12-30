# Family Planner

Mobile-first weekly planner for a family, built with React + Vite and Cloudflare Pages Functions + KV (plus a few scheduled Workers for background refresh/reminders).

It’s deliberately “boring”: the UI always edits a full `WeekDoc` in memory and persists it via `PUT`, with optimistic concurrency via a `version` field (409 on conflicts). Archived weeks are read-only.

## What it does

- Week view (ISO weeks, `Europe/London`) with events, to-dos, meals, focus, notes
- Read-only archives (`archive:{weekId}`) to keep past weeks immutable
- Overlays: school dates (example) + bin collections (example council API)
- Meal ideas “bucket” (not week-scoped)
- Practice tab for skills/habits (per-person skills, session logging with optional notes, weekly review, in-app nudge)
- Backup/restore of the whole KV namespace (admin-gated)
- Optional “Universal Add” (LLM-assisted) parsing via Gemini (server-side only)
- Optional web push notifications (subscribe/test + scheduled reminder dispatcher)

## Project status

This is a personal project that’s been open-sourced for learning and reuse. It’s usable, but there’s no guarantee of long-term maintenance or support.

## Quick start (local)

Prereqs: Node.js + npm.

```bash
npm ci
npm run dev
```

This runs `wrangler pages dev -- npm run dev:vite` so Pages Functions run locally alongside the Vite dev server.
The default `wrangler.toml` uses a local KV namespace, so you can develop without a Cloudflare account.

### Optional features (disabled by default)

Some features are intentionally “off” until you configure them:

- **Bins overlay / refresh:** requires `BIN_COLLECTIONS_UPRN` and `BIN_COLLECTIONS_SOURCE_BASE`
- **School dates overlay / refresh:** seed data works out of the box; refresh requires `SCHOOL_DATES_SOURCE_URL`
- **Universal Add (LLM):** requires `GEMINI_API_KEY`
- **Push notifications:** requires VAPID keys and a viewer identity mapping (see below)

## Deploy to Cloudflare Pages (production)

1) Create a Cloudflare Pages project from this repo.
2) Bind a KV namespace to Pages Functions with the binding name `FAMILY_PLANNER_KV`.
3) (Optional) Protect the Pages site with Cloudflare Access.
4) Deploy.

## Local development

### Local viewer identity (optional, but needed for push endpoints)

Some endpoints (push subscribe/test, and production backup import/export) use Cloudflare Access headers to identify the viewer and map them to a `PersonId`.

For local dev, set these in `.dev.vars`:

```bash
DEV_USER_EMAIL=you@example.com
USER_EMAIL_MAP={"you@example.com":"dad"}
```

Copy `.dev.vars.example` to `.dev.vars` to get started.

## KV bindings

The app expects a KV binding named `FAMILY_PLANNER_KV`.

For production, replace the `wrangler.toml` KV IDs with your real namespace IDs.

## Environment variables (Pages Functions / Workers)

| Variable | Required | Used by | Notes |
| --- | --- | --- | --- |
| `USER_EMAIL_MAP` | No | Pages + push + backup auth | JSON map of email → `"mum" \| "dad" \| "son"` |
| `DEV_USER_EMAIL` | No | Local dev | Used when Cloudflare Access headers are not present |
| `BACKUP_ADMIN_EMAILS` | No | Backup import/export (non-local) | Comma-separated allowlist |
| `BIN_COLLECTIONS_UPRN` | No | `/api/bins`, bins refresher worker | Required to enable the bins overlay |
| `BIN_COLLECTIONS_SOURCE_BASE` | No | `/api/bins/refresh`, bins refresher worker | Base URL for your council API |
| `SCHOOL_DATES_SOURCE_URL` | No | `/api/school-dates/refresh`, school refresher worker | URL of your school’s term dates page |
| `SCHOOL_DATES_SOURCE_NAME` | No | School refresh | Display name used in the stored document |
| `SCHOOL_DATES_SCHOOL_SLUG` | No | School refresh | Defaults to `example-school` |
| `GEMINI_API_KEY` | No | `/api/universal-add/parse` | Keep as a secret (do not commit) |
| `GEMINI_MODEL` | No | `/api/universal-add/parse` | Defaults to a Gemini “flash” model |
| `PUSH_VAPID_PUBLIC_KEY` | No | Push endpoints + worker | Public VAPID key |
| `PUSH_VAPID_PRIVATE_KEY` | No | Push endpoints + worker | Private VAPID key (store as a secret) |
| `PUSH_VAPID_SUBJECT` | No | Push endpoints + worker | e.g. `mailto:you@example.com` |

## Scheduled workers (optional)

These live under `workers/` and deploy separately from Pages:

- `workers/school-dates-refresher/` (weekly) refreshes `school_dates:v1:*`
- `workers/bin-collections-refresher/` (weekly) refreshes `bins:{uprn}`
- `workers/push-reminders-dispatcher/` (every 2 minutes) sends “upcoming event” reminders

Each worker has its own `wrangler.toml` with a KV binding; make sure the KV namespace IDs match your environment.

## API overview (quick reference)

### Week docs (source of truth)
- `GET /api/week/current`
- `GET /api/week/:weekId`
- `PUT /api/week/:weekId`
- `POST /api/week/:weekId/rollover`

### Other data
- `GET /api/meal-ideas`
- `PUT /api/meal-ideas`
- `GET /api/practice`
- `PUT /api/practice`
- `GET /api/school-dates?school=example-school`
- `POST /api/school-dates/refresh?school=example-school`
- `GET /api/bins`
- `POST /api/bins/refresh`

### Universal Add (optional)
- `POST /api/universal-add/parse`

### Backup / restore (admin-gated)
- `GET /api/backup/export` (returns a downloadable `KvBackupV1` JSON file; not wrapped in `{ ok: true, data }`)
- `POST /api/backup/import?dryRun=1|0&mode=missing-only|overwrite`

### Push (optional)
- `GET /api/push/vapid-public-key`
- `POST /api/push/subscribe`
- `POST /api/push/unsubscribe`
- `POST /api/push/test`

Most JSON APIs use `{ ok: true, data }` / `{ ok: false, error: { code, message } }`. A few “utility” endpoints return unwrapped JSON for convenience (notably backup export and the refresh endpoints).

## Notes

- Week IDs are ISO weeks in `Europe/London`.
- The app auto-saves entire WeekDocs with optimistic concurrency via `version` and explicit 409 handling.
- Practice data is stored in its own `PracticeDoc` and saved via full-document `PUT` with optimistic concurrency.
- KV keys (current):
  - `week:{weekId}` and `archive:{weekId}` (WeekDoc)
  - `meal_ideas:v1` (MealIdeasDoc)
  - `practice:v1` (PracticeDoc)
  - `school_dates:v1:{schoolSlug}:latest` (SchoolDatesDocument)
  - `bins:{uprn}` (BinCollectionsDoc)
  - `push_subs:v1:{personId}` and `push_sent:v1:...` (push notifications)

## Manual test (Universal Add)

1) On a mobile viewport, confirm the floating “+” appears on each tab and doesn't block the More menu.
2) Add an event: `meet with friends on 2 jan 2026 at my house` → correct week/day, location set.
3) Add a todo: `dad: book dentist` → owner is dad (or defaults to your current “me”).
4) Cross-week add: input a date outside the current week → confirm it navigates and saves in that week.
5) Open an archived week → FAB shows read-only and cannot add.

## Backup auth

Backup export/import is allowed on `localhost`/`127.0.0.1`.
For non-local deployments, set `BACKUP_ADMIN_EMAILS` to a comma-separated list of allowed emails
and protect the site with Cloudflare Access so `cf-access-authenticated-user-email` is present.

## Docs

See `docs/README.md` (and `docs/history/`) for build notes/specs and how features were added over time.

## Contributing

- Issues and small PRs are welcome.
- Keep changes focused and easy to review.
- Before opening a PR: `npm ci`, `npm run typecheck`, `npm run build`.

## Security

Please do not open public issues for sensitive security reports. If you find a vulnerability, open a GitHub issue with enough detail to reproduce but **do not** include real secrets, tokens, or personal data.

## License

MIT (see `LICENSE`).
