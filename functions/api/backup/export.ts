import { Env } from "../../_lib/store";
import { jsonError } from "../../_lib/response";
import { isBackupAdmin } from "../../_lib/backupAuth";
import { KvBackupV1, KvBackupEntryV1 } from "../../../src/domain/types";

const MAX_TOTAL_EXPORT_BYTES = 10 * 1024 * 1024;
const CONCURRENCY = 15;

function looksLikeJson(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function isValidJson(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapFn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    const mapped = await Promise.all(chunk.map(mapFn));
    results.push(...mapped);
  }
  return results;
}

function buildFilename(now: Date): string {
  const date = now.toISOString().slice(0, 10);
  return `family-planner-kv-backup-${date}.json`;
}

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

  if (!isBackupAdmin(request, env)) {
    return jsonError("UNAUTHORIZED", "Not permitted", 401);
  }

  try {
    const entries: KvBackupEntryV1[] = [];
    let cursor: string | undefined = undefined;
    let estimatedBytes = 0;

    while (true) {
      const listed: KVNamespaceListResult<unknown, string> =
        await env.FAMILY_PLANNER_KV.list({ cursor });
      const keys = listed.keys.map((item) => item.name);

      const fetched = await mapWithConcurrency(
        keys,
        CONCURRENCY,
        async (key: string): Promise<KvBackupEntryV1 | null> => {
          const raw = await env.FAMILY_PLANNER_KV.get(key, "text");
          if (raw === null) {
            return null;
          }
          const encoding: "text" | "json" =
            looksLikeJson(raw) && isValidJson(raw) ? "json" : "text";
          return {
            key,
            encoding,
            value: raw,
            contentType: encoding === "json" ? "application/json" : undefined,
          };
        }
      );

      for (const entry of fetched) {
        if (!entry) {
          continue;
        }
        entries.push(entry);
        estimatedBytes += entry.key.length + entry.value.length;
        if (estimatedBytes > MAX_TOTAL_EXPORT_BYTES) {
          return jsonError(
            "EXPORT_TOO_LARGE",
            "Backup is too large for single-file export",
            413
          );
        }
      }

      if (listed.list_complete) {
        break;
      }
      cursor = listed.cursor;
    }

    entries.sort((a, b) => a.key.localeCompare(b.key));

    const hostname = new URL(request.url).hostname;
    const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
    const backup: KvBackupV1 = {
      format: "family-planner-kv-backup",
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      exportedFrom: {
        app: "family-planner",
        environment: isLocal ? "local" : undefined,
        hostname,
      },
      entries,
    };

    const filename = buildFilename(new Date());
    return new Response(JSON.stringify(backup), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.warn("Backup export failed", error);
    return jsonError("EXPORT_FAILED", "Unable to export backup", 500);
  }
}
