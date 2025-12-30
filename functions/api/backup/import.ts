import { Env, mealIdeasKey, practiceKey, todosKey } from "../../_lib/store";
import { jsonError, jsonErrorWithData, jsonOk } from "../../_lib/response";
import { isBackupAdmin } from "../../_lib/backupAuth";
import { parseWeekId } from "../../_lib/week";
import { normalizePracticeDoc } from "../../_lib/practice";
import {
  validateMealIdeasDoc,
  validatePracticeDoc,
  validateWeekDoc,
  validateTodosDoc,
} from "../../_lib/validate";
import { validateSchoolDatesDocument } from "../../../src/shared/schoolDatesValidation";
import { validateBinCollectionsDoc } from "../../../src/shared/binCollectionsValidation";
import {
  BinCollectionsDoc,
  KvBackupV1,
  KvBackupEntryV1,
  MealIdeasDoc,
  PracticeDoc,
  SchoolDatesDocument,
  TodosDoc,
  WeekDoc,
} from "../../../src/domain/types";

type ImportMode = "missing-only" | "overwrite";

const MAX_KEY_LENGTH = 512;
const MAX_VALUE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

function isControlChar(value: string): boolean {
  return /[\x00-\x1F\x7F]/.test(value);
}

function validateKey(key: string): string | null {
  if (!key || typeof key !== "string") {
    return "key_missing";
  }
  if (key !== key.trim()) {
    return "key_whitespace";
  }
  if (key.length === 0 || key.length > MAX_KEY_LENGTH) {
    return "key_length";
  }
  if (isControlChar(key)) {
    return "key_control_chars";
  }
  return null;
}

function getMode(request: Request): ImportMode {
  const raw = new URL(request.url).searchParams.get("mode");
  return raw === "overwrite" ? "overwrite" : "missing-only";
}

function getDryRun(request: Request): boolean {
  return new URL(request.url).searchParams.get("dryRun") === "1";
}

function ensureJsonString(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isBackupV1(value: unknown): value is KvBackupV1 {
  if (!value || typeof value !== "object") {
    return false;
  }
  const doc = value as Partial<KvBackupV1>;
  return (
    doc.format === "family-planner-kv-backup" &&
    doc.formatVersion === 1 &&
    typeof doc.exportedAt === "string" &&
    Boolean(doc.exportedFrom) &&
    Array.isArray(doc.entries)
  );
}

function validateKnownEntry(key: string, entryValue: string): string[] {
  if (key === mealIdeasKey()) {
    const parsed = ensureJsonString(entryValue) as MealIdeasDoc | null;
    if (!parsed) {
      return ["json_invalid"];
    }
    return validateMealIdeasDoc(parsed);
  }

  if (key === practiceKey()) {
    const parsed = ensureJsonString(entryValue) as PracticeDoc | null;
    if (!parsed) {
      return ["json_invalid"];
    }
    const normalized = normalizePracticeDoc(parsed);
    return validatePracticeDoc(normalized);
  }

  if (key === todosKey()) {
    const parsed = ensureJsonString(entryValue) as TodosDoc | null;
    if (!parsed) {
      return ["json_invalid"];
    }
    return validateTodosDoc(parsed);
  }

  if (key.startsWith("week:")) {
    const weekId = key.slice("week:".length);
    if (!parseWeekId(weekId)) {
      return ["week_id_invalid"];
    }
    const parsed = ensureJsonString(entryValue) as WeekDoc | null;
    if (!parsed) {
      return ["json_invalid"];
    }
    return validateWeekDoc(parsed, weekId);
  }

  if (key.startsWith("archive:")) {
    const weekId = key.slice("archive:".length);
    if (!parseWeekId(weekId)) {
      return ["week_id_invalid"];
    }
    const parsed = ensureJsonString(entryValue) as WeekDoc | null;
    if (!parsed) {
      return ["json_invalid"];
    }
    return validateWeekDoc(parsed, weekId);
  }

  if (key.startsWith("school_dates:v1:")) {
    const parsed = ensureJsonString(entryValue) as SchoolDatesDocument | null;
    if (!parsed) {
      return ["json_invalid"];
    }
    return validateSchoolDatesDocument(parsed);
  }

  if (key.startsWith("bins:")) {
    const parsed = ensureJsonString(entryValue) as BinCollectionsDoc | null;
    if (!parsed) {
      return ["json_invalid"];
    }
    return validateBinCollectionsDoc(parsed);
  }

  return [];
}

export async function onRequest({
  request,
  env,
}: {
  request: Request;
  env: Env;
}) {
  if (request.method !== "POST") {
    return jsonError("METHOD_NOT_ALLOWED", "Method not allowed", 405);
  }

  if (!isBackupAdmin(request, env)) {
    return jsonError("UNAUTHORIZED", "Not permitted", 401);
  }

  const mode = getMode(request);
  const dryRun = getDryRun(request);

  if (mode === "overwrite") {
    const confirm = request.headers.get("X-Backup-Confirm");
    if (confirm !== "overwrite") {
      return jsonError(
        "OVERWRITE_CONFIRM_REQUIRED",
        "Overwrite mode requires confirmation",
        400
      );
    }
  }

  let parsedBody: unknown;
  try {
    const rawText = await request.text();
    parsedBody = JSON.parse(rawText) as unknown;
  } catch {
    return jsonError("INVALID_JSON", "Invalid JSON body", 400);
  }

  if (!isBackupV1(parsedBody)) {
    return jsonError("BACKUP_FORMAT_INVALID", "Backup format is invalid", 400);
  }

  const backup = parsedBody as KvBackupV1;
  const entries = backup.entries;

  const seenKeys = new Set<string>();
  const duplicateKeys: string[] = [];
  const validationIssues: { key: string; errors: string[] }[] = [];
  let totalBytes = 0;

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") {
      return jsonError("BACKUP_FORMAT_INVALID", "Backup entry is invalid", 400);
    }
    const key = (entry as KvBackupEntryV1).key;
    const encoding = (entry as KvBackupEntryV1).encoding;
    const value = (entry as KvBackupEntryV1).value;

    const keyError = validateKey(key);
    if (keyError) {
      return jsonError("KEY_INVALID", keyError, 400);
    }

    if (seenKeys.has(key)) {
      duplicateKeys.push(key);
    } else {
      seenKeys.add(key);
    }

    if (encoding !== "text" && encoding !== "json") {
      return jsonError("BACKUP_FORMAT_INVALID", "Entry encoding is invalid", 400);
    }
    if (typeof value !== "string") {
      return jsonError("BACKUP_FORMAT_INVALID", "Entry value is invalid", 400);
    }

    totalBytes += key.length + value.length;
    if (value.length > MAX_VALUE_BYTES) {
      return jsonError("VALUE_TOO_LARGE", "Entry value too large", 400);
    }
    if (totalBytes > MAX_TOTAL_BYTES) {
      return jsonError("VALUE_TOO_LARGE", "Backup too large to import", 400);
    }

    if (encoding === "json" && ensureJsonString(value) === null) {
      validationIssues.push({ key, errors: ["json_invalid"] });
      continue;
    }

    const knownErrors = validateKnownEntry(key, value);
    if (knownErrors.length > 0) {
      validationIssues.push({ key, errors: knownErrors });
    }
  }

  if (duplicateKeys.length > 0) {
    return jsonErrorWithData(
      "BACKUP_DUPLICATE_KEYS",
      "Duplicate keys in backup",
      { keys: duplicateKeys.sort() },
      400
    );
  }

  if (validationIssues.length > 0) {
    return jsonErrorWithData(
      "VALIDATION_FAILED",
      "Backup contains invalid documents",
      { issues: validationIssues },
      400
    );
  }

  const conflicts: string[] = [];
  const importedKeys: string[] = [];
  const skippedKeys: string[] = [];
  const warnings: string[] = [];

  try {
    if (mode === "missing-only") {
      for (const entry of entries) {
        const existing = await env.FAMILY_PLANNER_KV.get(entry.key, "text");
        if (existing !== null) {
          conflicts.push(entry.key);
        }
      }
      if (conflicts.length > 0) {
        conflicts.sort();
        return jsonErrorWithData(
          "IMPORT_CONFLICTS",
          "Some keys already exist",
          { keys: conflicts },
          409
        );
      }
    }

    if (dryRun) {
      const wouldImportKeys = entries.map((entry) => entry.key).sort();
      return jsonOk({
        mode,
        dryRun: true,
        importedKeys: wouldImportKeys,
        skippedKeys: [],
        conflicts,
        warnings,
      });
    }

    for (const entry of entries) {
      if (mode === "missing-only") {
        const existing = await env.FAMILY_PLANNER_KV.get(entry.key, "text");
        if (existing !== null) {
          skippedKeys.push(entry.key);
          continue;
        }
      }

      let valueToStore = entry.value;
      if (entry.key === practiceKey()) {
        const parsed = ensureJsonString(entry.value) as PracticeDoc | null;
        if (parsed) {
          valueToStore = JSON.stringify(normalizePracticeDoc(parsed));
        }
      }

      await env.FAMILY_PLANNER_KV.put(entry.key, valueToStore);
      importedKeys.push(entry.key);
    }

    importedKeys.sort();
    skippedKeys.sort();
    return jsonOk({
      mode,
      dryRun: false,
      importedKeys,
      skippedKeys,
      conflicts: [],
      warnings,
    });
  } catch (error) {
    console.warn("Backup import failed", error);
    return jsonError("IMPORT_FAILED", "Unable to import backup", 500);
  }
}
