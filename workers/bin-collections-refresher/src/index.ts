import { refreshBinCollections } from "../../../src/shared/binCollectionsRefresh";

export interface Env {
  FAMILY_PLANNER_KV: KVNamespace;
  BIN_COLLECTIONS_UPRN?: string;
  BIN_COLLECTIONS_SOURCE_BASE?: string;
}

async function handleRefresh(env: Env) {
  if (!env.BIN_COLLECTIONS_UPRN || !env.BIN_COLLECTIONS_SOURCE_BASE) {
    console.log(
      "[bin-collections] Skipped: BIN_COLLECTIONS_UPRN and BIN_COLLECTIONS_SOURCE_BASE not set"
    );
    return;
  }
  const result = await refreshBinCollections({
    env,
    logger: (message) => console.log(`[bin-collections] ${message}`),
  });
  console.log(
    `[bin-collections] Completed: changed=${result.changed} events=${result.doc.events.length}`
  );
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      handleRefresh(env).catch((error) => {
        console.error("[bin-collections] Refresh failed", error);
        throw error;
      })
    );
  },
};
