export function normalizeTimeInput(input: string): string | "" | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }
  const compact = trimmed.replace(/\s+/g, "");
  let hour: number | null = null;
  let minute: number | null = null;

  if (/^\d{1,2}$/.test(compact)) {
    hour = Number(compact);
    minute = 0;
  } else if (/^\d{3,4}$/.test(compact)) {
    const padded = compact.padStart(4, "0");
    hour = Number(padded.slice(0, 2));
    minute = Number(padded.slice(2, 4));
  } else if (/^\d{1,2}:\d{1,2}$/.test(compact)) {
    const [rawHour, rawMinute] = compact.split(":");
    hour = Number(rawHour);
    minute = Number(rawMinute);
  }

  if (hour === null || minute === null) {
    return null;
  }
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return null;
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
