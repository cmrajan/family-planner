import { jsonError, jsonOk } from "../../_lib/response";
import { Env } from "../../_lib/store";

export async function onRequest({
  request,
  env,
}: {
  request: Request;
  env: Env;
}) {
  if (request.method !== "GET") {
    return jsonError("METHOD_NOT_ALLOWED", "Method not allowed", 405);
  }
  const publicKey = env.PUSH_VAPID_PUBLIC_KEY?.trim();
  if (!publicKey) {
    return jsonError(
      "PUSH_NOT_CONFIGURED",
      "Push notifications are not configured",
      500
    );
  }
  return jsonOk({ publicKey });
}
