import { PracticeLogEntry, PersonId } from "../../domain/types";

export function filterLogsByWeek(
  logs: PracticeLogEntry[],
  weekId: string
): PracticeLogEntry[] {
  return logs.filter((entry) => entry.weekId === weekId);
}

export function countSessions(logs: PracticeLogEntry[]): number {
  return logs.length;
}

export function countSessionsForPerson(
  logs: PracticeLogEntry[],
  personId: PersonId
): number {
  return logs.filter((entry) => entry.personId === personId).length;
}

export function countSessionsForPersonDay(
  logs: PracticeLogEntry[],
  weekId: string,
  personId: PersonId,
  day: number
): number {
  return logs.filter(
    (entry) =>
      entry.weekId === weekId &&
      entry.personId === personId &&
      entry.day === day
  ).length;
}

export function countSessionsForSkillDay(
  logs: PracticeLogEntry[],
  weekId: string,
  personId: PersonId,
  skillId: string,
  day: number
): number {
  return logs.filter(
    (entry) =>
      entry.weekId === weekId &&
      entry.personId === personId &&
      entry.skillId === skillId &&
      entry.day === day
  ).length;
}

export function buildSkillDayCounts(
  logs: PracticeLogEntry[],
  personId: PersonId,
  skillId: string
): number[] {
  const counts = Array(7).fill(0);
  for (const entry of logs) {
    if (entry.personId !== personId || entry.skillId !== skillId) {
      continue;
    }
    if (Number.isInteger(entry.day) && entry.day >= 0 && entry.day <= 6) {
      counts[entry.day] += 1;
    }
  }
  return counts;
}

export function countSessionsForSkillWeek(
  logs: PracticeLogEntry[],
  personId: PersonId,
  skillId: string
): number {
  return logs.filter(
    (entry) => entry.personId === personId && entry.skillId === skillId
  ).length;
}

function collectWeekDaySets(
  logs: PracticeLogEntry[],
  predicate: (entry: PracticeLogEntry) => boolean
): Map<string, Set<number>> {
  const totals = new Map<string, Set<number>>();
  for (const entry of logs) {
    if (!predicate(entry)) {
      continue;
    }
    if (!Number.isInteger(entry.day) || entry.day < 0 || entry.day > 6) {
      continue;
    }
    const set = totals.get(entry.weekId) ?? new Set<number>();
    set.add(entry.day);
    totals.set(entry.weekId, set);
  }
  return totals;
}

export function countDaysPracticedForPersonWeek(
  logs: PracticeLogEntry[],
  personId: PersonId
): number {
  const days = new Set<number>();
  for (const entry of logs) {
    if (entry.personId !== personId) {
      continue;
    }
    if (Number.isInteger(entry.day) && entry.day >= 0 && entry.day <= 6) {
      days.add(entry.day);
    }
  }
  return days.size;
}

export function countDaysPracticedForSkillWeek(
  logs: PracticeLogEntry[],
  personId: PersonId,
  skillId: string
): number {
  const days = new Set<number>();
  for (const entry of logs) {
    if (entry.personId !== personId || entry.skillId !== skillId) {
      continue;
    }
    if (Number.isInteger(entry.day) && entry.day >= 0 && entry.day <= 6) {
      days.add(entry.day);
    }
  }
  return days.size;
}

export function getBestWeekForPerson(
  logs: PracticeLogEntry[],
  personId: PersonId
): number {
  const totals = collectWeekDaySets(
    logs,
    (entry) => entry.personId === personId
  );
  let best = 0;
  for (const set of totals.values()) {
    best = Math.max(best, set.size);
  }
  return best;
}

export function getBestWeekForSkill(
  logs: PracticeLogEntry[],
  personId: PersonId,
  skillId: string
): number {
  const totals = collectWeekDaySets(
    logs,
    (entry) => entry.personId === personId && entry.skillId === skillId
  );
  let best = 0;
  for (const set of totals.values()) {
    best = Math.max(best, set.size);
  }
  return best;
}

export function getConsistencyWeeksForSkill(
  logs: PracticeLogEntry[],
  personId: PersonId,
  skillId: string
): number {
  const totals = collectWeekDaySets(
    logs,
    (entry) => entry.personId === personId && entry.skillId === skillId
  );
  let consistent = 0;
  for (const set of totals.values()) {
    if (set.size >= 3) {
      consistent += 1;
    }
  }
  return consistent;
}

export function hasEveryonePracticed(
  logs: PracticeLogEntry[],
  people: PersonId[]
): boolean {
  const counts = new Map<PersonId, number>();
  for (const person of people) {
    counts.set(person, 0);
  }
  for (const entry of logs) {
    if (counts.has(entry.personId)) {
      counts.set(entry.personId, (counts.get(entry.personId) ?? 0) + 1);
    }
  }
  for (const person of people) {
    if ((counts.get(person) ?? 0) < 1) {
      return false;
    }
  }
  return true;
}
