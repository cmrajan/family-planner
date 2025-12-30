import { getCurrentWeekId } from "../../_lib/week";
import { getArchive, getOrCreateWeek, Env } from "../../_lib/store";
import { jsonOk } from "../../_lib/response";
import { getViewerInfo } from "../../_lib/auth";

export async function onRequest({
  env,
  request,
}: {
  env: Env;
  request: Request;
}) {
  const weekId = getCurrentWeekId();
  const archived = await getArchive(env, weekId);
  const week = archived ?? (await getOrCreateWeek(env, weekId));
  const viewer = getViewerInfo(request, env, week.people);
  return jsonOk({ week, readOnly: Boolean(archived), viewer });
}
