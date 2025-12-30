# Meal Ideas — Overhaul Notes (2025-12-24)

## Meals: simplification

### Recommended: replace “Meals by day” with “Meal ideas bucket”
Goal: a shared pool that anyone can add to, and you can pull inspiration from.

**Separate doc path (best UX, Adds a new Key in KV, but I think it is best way):**
- Add one KV doc: `meal_ideas:v1` or `meals:v1:ideas`.
- This is a new key, but it’s a clear and contained reason: “global list, not week-scoped”.

### Implementation notes (added)
- Implemented as `meal_ideas:v1` in the existing `FAMILY_PLANNER_KV` namespace.
- API endpoint: `GET/PUT /api/meal-ideas` (versioned, optimistic concurrency via `If-Match-Version`).
- No new Cloudflare bindings needed beyond the existing `FAMILY_PLANNER_KV`.

### Make meals relevant without being “meal planning”
If the bucket exists, you can make it useful in 10 seconds:
- Show **3 random ideas** on the This Week dashboard when meals are empty.
- A single “We have no plan—pick one” CTA.
