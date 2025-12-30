PROJECT: Family Weekly Planner (Cloudflare Pages + KV) — React + Vite

GOAL
Build a mobile-first web app for a family to manage a simple weekly planner:
- Events (by day)
- To-dos (owned, status)
- Meals (dinner text per day)
- Weekly focus (one line per person)
- Notes
Data stored in Cloudflare KV. Minimal setup. Easy to maintain.

STACK / CONSTRAINTS
- Frontend: React + Vite + TypeScript
- Deploy: Cloudflare Pages (static assets) + Cloudflare Pages Functions for API routes
- Storage: Cloudflare KV
- Auth: Assume site is protected by Cloudflare Access at the Pages level (no app-level login in v1). API can trust that only family members can reach it.
- Keep dependencies minimal. Prefer native fetch, small utility functions, no state management frameworks.

REPO STRUCTURE (single repo)
.
├─ package.json
├─ vite.config.ts
├─ tsconfig.json
├─ public/
├─ src/
│  ├─ main.tsx
│  ├─ app/App.tsx
│  ├─ app/router.ts (optional minimal router or simple internal tabs)
│  ├─ api/client.ts (frontend API client)
│  ├─ domain/types.ts (shared types mirrored in functions)
│  ├─ domain/week.ts (helpers: weekId, default week, validation)
│  ├─ ui/
│  │  ├─ components/ (Button, Input, Modal/BottomSheet, Tabs, DaySection)
│  │  ├─ screens/ (ThisWeek, Events, Todos, MealsFocus)
│  │  └─ styles.css (simple, readable CSS)
│  └─ utils/ (date, id, debounce)
└─ functions/
   ├─ _lib/
   │  ├─ types.ts (same interfaces as src/domain/types.ts; keep in sync manually)
   │  ├─ week.ts (weekId logic, defaults)
   │  ├─ store.ts (KV get/put, optimistic concurrency with version)
   │  ├─ validate.ts (lightweight validation)
   │  └─ response.ts (json helpers, errors)
   └─ api/
      └─ week/
         ├─ current.ts        (GET)
         ├─ [weekId].ts       (GET, PUT)
         └─ [weekId]/
            └─ rollover.ts    (POST)

CLOUDFLARE BINDINGS
- KV Namespace binding name: FAMILY_PLANNER_KV
- In Cloudflare Pages project settings, bind KV to Pages Functions as FAMILY_PLANNER_KV.

KEYS IN KV
- week documents:
  key: "week:{weekId}"   (e.g., "week:2025-W51")
- archive documents:
  key: "archive:{weekId}" (e.g., "archive:2025-W51")
Optionally store metadata:
  key: "meta:lastWeekId" (string)

WEEK ID RULE
Use ISO week: "YYYY-Www" (e.g. 2025-W51), computed in timezone Europe/London.
Implement weekId calculation consistently in both frontend and functions (copy/paste logic).

DATA MODEL (TypeScript)
Weekday index: 0=Mon, 1=Tue, ..., 6=Sun (pick this and stick to it everywhere)

type PersonId = "mum" | "dad" | "son"; // configurable in one place

type EventTag = "school" | "sport" | "family" | "work" | "other";

interface PlannerEvent {
  id: string;
  day: number;          // 0..6
  time?: string;        // "HH:MM" 24h, optional
  title: string;        // required
  who: PersonId[];      // can be [] meaning "unspecified"; UI may offer "everyone"
  tag?: EventTag;       // optional
}

type TodoStatus = "todo" | "doing" | "done";
type Effort = "5m" | "15m" | "30m" | "1h+";

interface TodoItem {
  id: string;
  title: string;
  owner: PersonId;
  status: TodoStatus;
  dueDay?: number;      // 0..6 or undefined meaning "anytime"
  effort?: Effort;
}

interface WeekDoc {
  weekId: string;
  timezone: "Europe/London";
  people: PersonId[];
  version: number;      // optimistic concurrency
  updatedAt: string;    // ISO string
  events: PlannerEvent[];
  todos: TodoItem[];
  meals: Record<string, string>; // keys "0".."6" (dinner text)
  focus: Record<PersonId, string>;
  notes: string;
}

DEFAULT WEEK DOC
When a week key is missing, the API should create a default WeekDoc:
- people = ["mum","dad","son"]
- meals keys "0".."6" empty string
- focus entries empty string for each person
- events/todos empty
- notes empty
- version = 1
- updatedAt = now

API CONTRACT (Pages Functions)
All JSON responses: { ok: true, data: ... } or { ok: false, error: { code, message } }
Return proper HTTP status codes.

1) GET /api/week/current
- Determine current weekId in Europe/London.
- Return WeekDoc (create default if missing).
Response: { ok: true, data: WeekDoc }

2) GET /api/week/:weekId
- Validate weekId format: /^\d{4}-W\d{2}$/
- Return WeekDoc (create default if missing).
Response: { ok: true, data: WeekDoc }

3) PUT /api/week/:weekId
Purpose: Replace entire WeekDoc (simple + maintainable). Use optimistic concurrency.
Request body: WeekDoc
Rules:
- weekId in URL must match body.weekId
- Validate required fields, day ranges, time format if provided
- Concurrency: require "If-Match-Version" header equals stored version OR body.version equals stored version.
  - If mismatch => 409 Conflict with code "VERSION_CONFLICT"
- On success: increment version by 1, set updatedAt=now, store to KV.
Response: { ok: true, data: WeekDoc } (the updated doc with incremented version)

4) POST /api/week/:weekId/rollover
Purpose: archive a week and create next week.
Behavior:
- Read week:{weekId} (create default if missing).
- Write archive:{weekId} with the exact current doc (no modifications).
- Compute nextWeekId.
- Create next week doc:
  - Start from default doc for nextWeekId
  - Carryover unfinished todos (status !== "done") if query param carry=1 (default carry=1):
      - Copy title/owner/effort; set status="todo"; unset dueDay; new id; append.
  - Do NOT carry over events/meals/notes/focus (keep blank) in v1.
- Store week:{nextWeekId}.
Response: { ok: true, data: { archivedWeekId, nextWeekId, nextWeek: WeekDoc } }

VALIDATION (server-side)
- day must be integer 0..6
- time if present must match /^\d{2}:\d{2}$/ and be valid hour/minute
- title trimmed, non-empty, max 140 chars
- who must only include known PersonId
- meals must have keys "0".."6" (string)
- focus must have keys for each person
- limit array sizes to sane bounds (e.g., events <= 200, todos <= 200) to prevent KV abuse.

FRONTEND UI REQUIREMENTS
- Mobile-first, single page with tabs (no heavy routing).
Tabs: "This Week", "Events", "To-dos", "Meals & Focus"
Top bar: Week label (e.g., 2025-W51) + "Archive & Next Week" button (confirm modal).

This Week tab:
- Summary counts: upcoming events this week, open todos
- Notes textarea (auto-save)
- Quick view: next 3 events + open todos assigned to “me” (choose me via selector)

Events tab:
- Group list by day (Mon..Sun)
- Each event row shows time (if any), title, who chips, tag
- Add/edit event via bottom-sheet modal:
  fields: day, time, title, who multi-select, tag
- Delete event action
- Reorder not required; sort by day then time then title.

To-dos tab:
- Filters: All / Mine / Open
- Each todo row shows title, owner, status, optional dueDay and effort
- Quick add at top: title + owner (defaults to selected “me”)
- Tap status cycles todo -> doing -> done (or checkbox sets done)
- Edit todo modal: title, owner, status, dueDay, effort
- Delete todo action
- Sort: open first, then by dueDay (undefined last), then owner.

Meals & Focus tab:
- Meals: 7 inputs labeled by day, stored in meals["0"]..["6"]
- Focus: one input per person
- All auto-save.

“Me” selection:
- Simple dropdown at top-right: mum/dad/son (stored in localStorage). Used for Mine filter and defaults.

AUTO-SAVE / STATE
- Frontend loads WeekDoc from GET /api/week/current.
- Keep local state copy of WeekDoc.
- On edits: update local state immediately, then debounce save (e.g., 800ms) calling PUT /api/week/:weekId with the whole doc and current version.
- If 409 conflict:
  - Fetch latest from server
  - Show a small banner: “Updated elsewhere. Tap to reload.”
  - In v1, simplest resolution is: discard local and reload latest on tap.
(Keep it simple—only 3–4 users.)

UI / STYLING
- Use plain CSS (src/ui/styles.css) or minimal CSS modules.
- Avoid heavy UI kits. Keep components small and readable.
- Ensure accessible inputs, large touch targets, sticky add button optional.

ID GENERATION
- Use crypto.randomUUID() when available; fallback to simple random string.
- IDs are created client-side for events/todos.

LOCAL DEV / DEPLOYMENT
- Use Wrangler for Pages dev so Functions run locally.
- Provide scripts:
  - "dev": "wrangler pages dev dist --compatibility-date=2025-01-01 -- npm run build:client"
  - Better approach:
      - "dev": "wrangler pages dev . --npm"
      - configure wrangler to build via Vite (Pages supports this)
- Build:
  - "build": "vite build"
- Document minimal steps in README:
  1) Create Cloudflare Pages project from repo
  2) Bind KV namespace to FAMILY_PLANNER_KV
  3) (Optional) Protect with Cloudflare Access (allowlist family emails)
  4) Deploy

MAINTAINABILITY GUIDELINES (must follow)
- Keep business logic in shared helpers (weekId, defaults, validation).
- Keep API simple: PUT whole doc + version.
- Keep types explicit and narrow (PersonId union).
- Minimal dependencies (React, ReactDOM only; no Redux, no date libraries unless absolutely necessary).
- Use eslint + prettier (optional, but recommended).
- Add a small test file for weekId calculation (optional).

DELIVERABLES
- Working app with the tabs and functionality above
- Fully working Pages Functions API talking to KV
- README with setup + KV binding instructions
- Sensible error handling + conflict handling
- Clean, readable code
