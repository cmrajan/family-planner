import { jsonError } from "../../_lib/response";
import { Env } from "../../_lib/store";
import {
  BinCollectionsRefreshError,
  refreshBinCollections,
} from "../../../src/shared/binCollectionsRefresh";

export async function onRequest({ env, request }: { env: Env; request: Request }) {
  if (request.method !== "POST") {
    return jsonError("METHOD_NOT_ALLOWED", "Method not allowed", 405);
  }
  try {
    const result = await refreshBinCollections({ env });
    return jsonResponse({ changed: result.changed, doc: result.doc });
  } catch (error) {
    if (error instanceof BinCollectionsRefreshError) {
      if (error.code === "bins_source_fetch_failed") {
        return jsonError("bins_source_fetch_failed", "Unable to fetch bin collections", 502);
      }
      if (error.code === "bins_source_invalid") {
        return jsonError("bins_source_invalid", "Bin collection data invalid", 502);
      }
      if (error.code === "bins_internal_error") {
        return jsonError("BINS_NOT_CONFIGURED", error.message, 400);
      }
    }
    console.log("Bin collections refresh failed", error);
    return jsonError("bins_internal_error", "Unable to refresh bin collections", 500);
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
