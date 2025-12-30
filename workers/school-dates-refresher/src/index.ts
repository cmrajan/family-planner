import { refreshSchoolDates } from "../../../src/shared/schoolDatesRefresh";

export interface Env {
  FAMILY_PLANNER_KV: KVNamespace;
  SCHOOL_DATES_SOURCE_URL?: string;
  SCHOOL_DATES_SOURCE_NAME?: string;
  SCHOOL_DATES_SCHOOL_SLUG?: string;
}

async function handleRefresh(env: Env) {
  if (!env.SCHOOL_DATES_SOURCE_URL) {
    console.log("[school-dates] Skipped: SCHOOL_DATES_SOURCE_URL not set");
    return;
  }
  const result = await refreshSchoolDates({
    env,
    logger: (message) => console.log(`[school-dates] ${message}`),
  });
  console.log(
    `[school-dates] Completed: updated=${result.updated} years=${result.academicYears} items=${result.items}`
  );
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(handleRefresh(env).catch((error) => {
      console.error("[school-dates] Refresh failed", error);
      throw error;
    }));
  },
};
