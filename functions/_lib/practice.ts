import {
  PracticeDoc,
  PracticeReminderSettings,
  PracticeSkill,
  PersonId,
} from "../../src/domain/types";
import { PEOPLE } from "./week";
import { createId } from "./id";

const TIMEZONE = "Europe/London" as const;
const DEFAULT_WEEKDAY_REMINDERS = ["07:00", "12:00", "18:30"];
const DEFAULT_WEEKEND_REMINDERS = ["08:00", "13:00", "18:30"];

function createSkill(
  name: string,
  icon: string,
  tinyWin: string,
  order: number
): PracticeSkill {
  return {
    id: createId(),
    name,
    icon,
    order,
    tinyWin,
  };
}

function buildDefaultSkills(): Record<PersonId, PracticeSkill[]> {
  const mum: PracticeSkill[] = [
    createSkill("Piano", "🎹", "Sit down + play 8 bars slowly", 0),
    createSkill("Reading", "📖", "Read 2 pages", 1),
  ];
  const dad: PracticeSkill[] = [
    createSkill("Guitar", "🎸", "Tune guitar + 1 chord change", 0),
    createSkill("Reading", "📖", "Read 2 pages", 1),
  ];
  const son: PracticeSkill[] = [
    createSkill("Chess", "♟️", "Solve 1 puzzle", 0),
    createSkill("Reading", "📖", "Read 2 pages", 1),
  ];
  return { mum, dad, son };
}

function buildDefaultReminders(): PracticeReminderSettings {
  return {
    enabledByPerson: {
      mum: true,
      dad: true,
      son: true,
    },
    weekdayTimes: [...DEFAULT_WEEKDAY_REMINDERS],
    weekendTimes: [...DEFAULT_WEEKEND_REMINDERS],
  };
}

export function normalizePracticeDoc(doc: PracticeDoc): PracticeDoc {
  if (doc.reminders && typeof doc.reminders === "object") {
    return doc;
  }
  return {
    ...doc,
    reminders: buildDefaultReminders(),
  };
}

export function defaultPracticeDoc(): PracticeDoc {
  return {
    schemaVersion: 1,
    timezone: TIMEZONE,
    version: 1,
    updatedAt: new Date().toISOString(),
    people: [...PEOPLE],
    skillsByPerson: buildDefaultSkills(),
    logs: [],
    reviewsByWeekId: {},
    reminders: buildDefaultReminders(),
  };
}
