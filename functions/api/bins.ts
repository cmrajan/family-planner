import { jsonError, jsonOk } from "../_lib/response";
import { Env } from "../_lib/store";
import { BinCollectionsDoc } from "../../src/domain/types";
import { getOrCreateBinCollections } from "../_lib/binCollections";

export async function onRequest({ env, request }: { env: Env; request: Request }) {
  if (request.method !== "GET") {
    return jsonError("METHOD_NOT_ALLOWED", "Method not allowed", 405);
  }
  const uprn = (env.BIN_COLLECTIONS_UPRN ?? "").trim();
  if (!uprn) {
    return jsonError("BINS_NOT_CONFIGURED", "BIN_COLLECTIONS_UPRN is required", 400);
  }
  const doc = await getOrCreateBinCollections(env, uprn, request);
  if (!doc) {
    return jsonError("bins_not_found", "Bin collections not found", 404);
  }
  return jsonOk(doc);
}
