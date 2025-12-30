# School Dates (Example School) — Addition Spec (2025-12-21)

Below is a concrete spec you can hand to an LLM agent. It focuses on **KV storage + schema**, plus **planner UI changes** (new School Dates page + home highlight). Scraping/ingestion is explicitly out of scope beyond “it will write this schema”.

Source data baseline is an example school term dates page. ([Example School][1])

---

# Spec: School Dates (Example School) in Family Planner

## 0) Goals

### Primary goals

1. Store school term/holiday/inset/bank-holiday dates in **Cloudflare KV** as structured, versioned JSON.
2. Add a **School Dates** page/tab in the family planner to view these dates (mobile-first).
3. Add a **Home highlight** section that appears if any school dates intersect the currently viewed week.

### Non-goals (for this phase)

* Implement scraping/parsing logic (separate workstream).
* Two-way sync with any external calendars (ICS, Google, etc.).
* Per-child personalization beyond “school overlay shown” (optional later).

---

## 1) Data scope (baseline)

We store “date items” extracted from a school term dates page, covering at minimum:

* Academic years: **2025–2026**, **2026–2027** ([Example School][1])
* Item types we expect:

  * `term_start`, `term_end`
  * `holiday` (half term), `reading_week`
  * `staff_day` (inset)
  * `bank_holiday`
  * `exam` (entrance exam)
  * `info` (other informational lines, if needed)

We store both:

* Human label (as displayed)
* Normalized ISO dates (YYYY-MM-DD), with optional half-day marker.

---

## 2) KV Key design

### Namespace / environment

* Use a KV namespace like: `PLANNER_KV`

### Key naming conventions

Designed to support multiple schools later:

* **Canonical dataset (latest):**

  * `school_dates:v1:example-school:latest`

* **Versioned snapshots (optional but recommended):**

  * `school_dates:v1:example-school:snapshots:<YYYY-MM-DD>`
  * Example: `school_dates:v1:example-school:snapshots:2025-12-21`

* **Derived lightweight index for home/week queries (optional but recommended):**

  * `school_dates:v1:example-school:index:by_date:<YYYY-MM-DD>`
  * Value: array of item IDs that touch that date
  * Only needed if you expect lots of items or multiple schools. If not, skip and compute in-app from `latest`.

### KV value format

* Always JSON
* UTF-8
* Keep sizes small (under a few hundred KB easily)

---

## 3) Schema (JSON)

### 3.1 Top-level document: `SchoolDatesDocument`

Stored under `school_dates:v1:example-school:latest`.

```json
{
  "schemaVersion": 1,
  "source": {
    "name": "Example School",
    "slug": "example-school",
    "url": "https://example.com/term-dates",
    "fetchedAt": "2025-12-21T01:00:00Z",
    "etag": "optional",
    "lastModified": "optional",
    "contentHash": "sha256:optional"
  },
  "timezone": "Europe/London",
  "academicYears": [
    {
      "label": "2025-2026",
      "items": [ /* SchoolDateItem[] */ ]
    },
    {
      "label": "2026-2027",
      "items": [ /* SchoolDateItem[] */ ]
    }
  ]
}
```

### 3.2 Item schema: `SchoolDateItem`

Each item is a date *or* date range.

```json
{
  "id": "example-school|2025-2026|michaelmas|term_start|2025-09-08",
  "type": "term_start",
  "label": "Michaelmas Term commences for all students",
  "term": "Michaelmas",
  "academicYear": "2025-2026",

  "startDate": "2025-09-08",
  "endDate": "2025-09-08",

  "startDayPart": "full",
  "endDayPart": "full",

  "notes": null,
  "audience": ["students"],
  "tags": ["school", "example-school"],

  "sourceText": "Monday 8th September"
}
```

#### Field rules

* `id`: stable, deterministic; should not change between fetches if the underlying item is the same.
* `type`: enum:

  * `term_start`, `term_end`, `holiday`, `reading_week`, `staff_day`, `bank_holiday`, `exam`, `reopen`, `info`
* `term`: enum or string: `Michaelmas`, `Lent`, `Summer`, or `null` when not applicable.
* `startDate`, `endDate`: ISO date strings. For single-day items, equal.
* `startDayPart`, `endDayPart`: enum `full | am | pm`

  * Use `am/pm` when explicitly present (e.g., “(a.m.)”, “(p.m.)”).
* `audience`: array of strings (e.g., `["students"]`, `["staff"]`, `["boarders"]`)
* `sourceText`: original raw date phrase (helps debugging)

---

## 4) Baseline data to include (from current page)

Agent should populate initial `latest` document with at least these items:

### Academic year 2025–2026 ([Example School][1])

* Staff Day — 2025-09-03
* Staff Day — 2025-09-04
* Year 7 Entrance Examination — 2025-09-05
* Michaelmas term starts (all students) — 2025-09-08
* Half Term — 2025-10-27 to 2025-10-31
* Reading Week — 2025-11-03 to 2025-11-07
* School reopens for students — 2025-11-10
* Term ends — 2025-12-19 (am)
* Lent term commences — 2026-01-05
* Staff Day — 2026-01-26
* Half Term — 2026-02-16 to 2026-02-20
* School reopens for students — 2026-02-23
* Term ends — 2026-03-27 (am)
* Summer term commences — 2026-04-13
* Bank Holiday — 2026-05-04
* Half Term — 2026-05-25 to 2026-05-29
* School reopens for students — 2026-06-01
* Term ends — 2026-07-16
* Staff Days list (duplicate of above staff days; store as `staff_day` items only once each)

### Academic year 2026–2027 ([Example School][1])

* Staff Day — 2026-09-01
* Staff Day — 2026-09-02
* Michaelmas term starts (all students) — 2026-09-03

  * Notes: boarders return night of 2026-09-02 (store as `info` or `reopen` item with audience `["boarders"]`)
* Reading Week — 2026-10-19 to 2026-10-23
* Half Term — 2026-10-26 to 2026-10-30
* School reopens for students — 2026-11-02
* Term ends — 2026-12-16 (pm)
* Lent term commences — 2027-01-04
* Staff Day — 2027-02-12
* Half Term — 2027-02-15 to 2027-02-19
* School reopens for students — 2027-02-22
* Term ends — 2027-03-25 (pm)
* Summer term commences — 2027-04-12
* Bank Holiday — 2027-05-03
* Half Term — 2027-05-31 to 2027-06-04
* School reopens for students — 2027-06-07
* Term ends for students — 2027-07-15 (am)
* Entrance Test — 2027-07-16
* Staff Days list (store as `staff_day` items only once each)

---

## 5) Planner integration requirements

### 5.1 New page/tab: “School Dates”

Add a new top-level navigation item (mobile-first).

#### Page sections (mobile-first layout)

1. **School selector** (for now only “Example School”, but structure UI to support more later)
2. **Academic year selector** (default: current academic year based on “today”)
3. **Upcoming** list (next ~60–90 days)
4. **Full year** list grouped by term
5. Optional: “Overlay on calendar” toggle (local preference)

#### List item display

For each `SchoolDateItem`, show:

* Label (primary)
* Date or date range (secondary)
* Small type badge (e.g., “Half Term”, “Staff Day”)
* If half-day: display “AM” / “PM”

#### Sorting rules

* Upcoming: sort by `startDate`
* Full year: group by `term` (Michaelmas/Lent/Summer), then sort by `startDate`

---

### 5.2 Home page: “School this week” highlight

On the home page “This week” view:

**Show a section only if** any school date intersects the currently selected week window.

#### Intersection rule

A school item intersects the week if:

* `startDate <= weekEndDate` AND `endDate >= weekStartDate`

#### Display rules

* Section title: **School this week**
* Show up to 3 items; if more, show “+ N more” linking to School Dates page.
* Each row shows:

  * Day (Mon/Tue/…) or date range shorthand
  * Label
  * Small badge

Example rows:

* “Mon–Fri: Half Term”
* “Fri (AM): Term ends”

---

## 6) Application data access patterns

### Client read model (simple)

* Client fetches one JSON doc:

  * `school_dates:v1:example-school:latest`
* Client computes:

  * current academic year
  * upcoming list
  * week intersection

This is simplest and likely fast enough.

### Optional server facade

If your app already uses an API layer:

* Add endpoint: `GET /api/school-dates?school=example-school`

  * Response: `SchoolDatesDocument`

(Still backed by KV.)

---

## 7) Versioning & future-proofing

### Schema versioning

* `schemaVersion: 1` required at top level
* If schema changes:

  * Bump schemaVersion
  * Write to new KV prefix: `school_dates:v2:*`

### Multi-school future support

* Add more schools by writing additional `...:<schoolSlug>:latest` keys
* UI school selector should be data-driven later (but can be hardcoded for v1)

---

## 8) Acceptance criteria (what “done” means)

1. KV contains `school_dates:v1:example-school:latest` matching schema above, populated with items for 2025–2026 and 2026–2027 as listed.
2. Family planner has a new **School Dates** page accessible via navigation (mobile-first).
3. Home “This week” view shows **School this week** only when applicable; otherwise hidden.
4. Week intersection logic correctly includes ranges and half-day items.


[1]: https://example.com/term-dates "Example School - Term Dates"
