import React from "react";
import { KvBackupV1 } from "../../domain/types";

type ImportMode = "missing-only" | "overwrite";

type ApiOk<T> = { ok: true; data: T };
type ApiError<T = unknown> = { ok: false; error: { code: string; message: string }; data?: T };
type ApiResponse<T, E = unknown> = ApiOk<T> | ApiError<E>;

interface BackupProps {
  onBack: () => void;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getFilenameFromDisposition(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const match = /filename=\"?([^\";]+)\"?/.exec(header);
  return match?.[1] ?? null;
}

function summarizeBackup(doc: KvBackupV1) {
  const counts = {
    total: doc.entries.length,
    week: 0,
    archive: 0,
    mealIdeas: 0,
    todos: 0,
    schoolDates: 0,
    bins: 0,
    other: 0,
  };
  for (const entry of doc.entries) {
    if (entry.key.startsWith("week:")) {
      counts.week += 1;
    } else if (entry.key.startsWith("archive:")) {
      counts.archive += 1;
    } else if (entry.key === "meal_ideas:v1") {
      counts.mealIdeas += 1;
    } else if (entry.key === "todos:v1") {
      counts.todos += 1;
    } else if (entry.key.startsWith("school_dates:v1:")) {
      counts.schoolDates += 1;
    } else if (entry.key.startsWith("bins:")) {
      counts.bins += 1;
    } else {
      counts.other += 1;
    }
  }
  return counts;
}

export default function Backup({ onBack }: BackupProps) {
  const [exporting, setExporting] = React.useState(false);
  const [exportError, setExportError] = React.useState<string | null>(null);

  const [fileName, setFileName] = React.useState<string | null>(null);
  const [fileText, setFileText] = React.useState<string | null>(null);
  const [backup, setBackup] = React.useState<KvBackupV1 | null>(null);
  const [fileError, setFileError] = React.useState<string | null>(null);

  const [mode, setMode] = React.useState<ImportMode>("missing-only");
  const [confirmText, setConfirmText] = React.useState("");
  const overwriteEnabled = mode === "overwrite";
  const overwriteConfirmed = !overwriteEnabled || confirmText.trim() === "OVERWRITE";

  const [validating, setValidating] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [importResult, setImportResult] = React.useState<string | null>(null);

  const summary = backup ? summarizeBackup(backup) : null;

  const handleExport = async () => {
    if (exporting) {
      return;
    }
    setExportError(null);
    setExporting(true);
    try {
      const response = await fetch("/api/backup/export");
      if (!response.ok) {
        const body = (await response.json()) as ApiError;
        setExportError(
          body && body.ok === false
            ? `${body.error.code}: ${body.error.message}`
            : "Unable to export backup"
        );
        return;
      }
      const disposition = response.headers.get("Content-Disposition");
      const filename = getFilenameFromDisposition(disposition) ?? "family-planner-kv-backup.json";
      const blob = await response.blob();
      downloadBlob(blob, filename);
    } catch {
      setExportError("Unable to export backup.");
    } finally {
      setExporting(false);
    }
  };

  const handleSelectFile = async (file: File | null) => {
    setFileError(null);
    setFileName(file?.name ?? null);
    setFileText(null);
    setBackup(null);
    setImportResult(null);
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      setFileText(text);
      const parsed = JSON.parse(text) as KvBackupV1;
      if (
        !parsed ||
        parsed.format !== "family-planner-kv-backup" ||
        parsed.formatVersion !== 1 ||
        !Array.isArray(parsed.entries)
      ) {
        setFileError("Not a valid family planner backup file.");
        return;
      }
      setBackup(parsed);
    } catch {
      setFileError("Unable to read or parse JSON file.");
    }
  };

  const postImport = async (dryRun: boolean) => {
    if (!fileText || !backup) {
      setImportResult("Select a backup file first.");
      return;
    }
    setImportResult(null);
    const params = new URLSearchParams();
    params.set("dryRun", dryRun ? "1" : "0");
    params.set("mode", mode);

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (overwriteEnabled) {
      headers["X-Backup-Confirm"] = "overwrite";
    }

    const response = await fetch(`/api/backup/import?${params.toString()}`, {
      method: "POST",
      headers,
      body: fileText,
    });
    const data = (await response.json()) as ApiResponse<
      {
        mode: ImportMode;
        dryRun: boolean;
        importedKeys: string[];
        skippedKeys: string[];
        conflicts: string[];
        warnings: string[];
      },
      { keys?: string[]; issues?: { key: string; errors: string[] }[] }
    >;

    if (!data || data.ok !== true) {
      const detail = data && "error" in data ? `${data.error.code}: ${data.error.message}` : "Import failed";
      if (data && "data" in data && data.data && typeof data.data === "object") {
        const extra =
          "keys" in data.data && Array.isArray(data.data.keys)
            ? `\nKeys: ${data.data.keys.join(", ")}`
            : null;
        setImportResult(extra ? `${detail}${extra}` : detail);
        return;
      }
      setImportResult(detail);
      return;
    }

    const imported = data.data.importedKeys.length;
    const skipped = data.data.skippedKeys.length;
    setImportResult(
      dryRun
        ? `Validation OK. Would write ${imported} keys.`
        : `Import complete. Wrote ${imported} keys${skipped ? ` (skipped ${skipped})` : ""}.`
    );
  };

  const handleValidate = async () => {
    if (validating || importing) {
      return;
    }
    setValidating(true);
    try {
      await postImport(true);
    } finally {
      setValidating(false);
    }
  };

  const handleImport = async () => {
    if (importing || validating) {
      return;
    }
    if (!overwriteConfirmed) {
      setImportResult('Type "OVERWRITE" to enable overwrite imports.');
      return;
    }
    setImporting(true);
    try {
      await postImport(false);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="screen">
      <div className="card">
        <div className="row">
          <h3>Backup / Restore</h3>
          <button className="btn btn-ghost" onClick={onBack}>
            Back
          </button>
        </div>
        <div className="muted">
          Export downloads a full snapshot of KV. Import restores keys into the current KV
          namespace.
        </div>
      </div>

      <div className="card">
        <h3>Export</h3>
        <button className="btn" onClick={handleExport} disabled={exporting}>
          {exporting ? "Preparing..." : "Download backup"}
        </button>
        {exportError ? <div className="field-error">{exportError}</div> : null}
      </div>

      <div className="card">
        <h3>Import</h3>
        <div className="form">
          <label className="field-row">
            <span className="summary-label">Backup file</span>
            <input
              type="file"
              accept="application/json"
              onChange={(event) => handleSelectFile(event.target.files?.[0] ?? null)}
            />
          </label>
          {fileName ? <div className="meta-text">Selected: {fileName}</div> : null}
          {fileError ? <div className="field-error">{fileError}</div> : null}

          {summary ? (
            <div className="meta-text">
              Entries: {summary.total} (week {summary.week}, archive {summary.archive}, meal
              ideas {summary.mealIdeas}, to-dos {summary.todos}, school dates{" "}
              {summary.schoolDates}, bins {summary.bins}, other {summary.other})
            </div>
          ) : null}

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={overwriteEnabled}
              onChange={(event) => {
                setMode(event.target.checked ? "overwrite" : "missing-only");
                setConfirmText("");
              }}
            />
            Overwrite existing keys (dangerous)
          </label>

          {overwriteEnabled ? (
            <label className="field-row">
              <span className="summary-label">Confirm</span>
              <input
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                placeholder="Type OVERWRITE"
              />
            </label>
          ) : null}
        </div>

        <div className="row">
          <button className="btn btn-ghost" disabled={validating || importing} onClick={handleValidate}>
            {validating ? "Validating..." : "Validate only"}
          </button>
          <button
            className="btn"
            disabled={validating || importing || !backup || !overwriteConfirmed}
            onClick={handleImport}
          >
            {importing ? "Importing..." : "Import"}
          </button>
        </div>

        {importResult ? <div className="meta-text">{importResult}</div> : null}
      </div>
    </div>
  );
}
