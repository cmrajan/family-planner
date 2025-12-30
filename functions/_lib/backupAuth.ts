import { Env } from "./store";

function isLocalRequest(request: Request): boolean {
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function parseAdminEmails(raw?: string): Set<string> {
  if (!raw || !raw.trim()) {
    return new Set();
  }
  const emails = raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return new Set(emails);
}

export function isBackupAdmin(request: Request, env: Env): boolean {
  if (isLocalRequest(request)) {
    return true;
  }

  const email = request.headers
    .get("cf-access-authenticated-user-email")
    ?.trim()
    .toLowerCase();
  if (!email) {
    return false;
  }

  const allowed = parseAdminEmails(env.BACKUP_ADMIN_EMAILS);
  if (allowed.size === 0) {
    return false;
  }
  return allowed.has(email);
}

