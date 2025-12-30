import {
  WeekDoc,
  PlannerEvent,
  TodoItem,
  PersonId,
  TodoStatus,
  EventTag,
  Effort,
  MealIdeasDoc,
  PracticeDoc,
  PracticeLogEntry,
  PracticeReminderSettings,
  PracticeSkill,
  PracticeWeeklyReview,
  TodosDoc,
} from "../../src/domain/types";
import { PEOPLE, parseWeekId } from "./week";

const MAX_EVENTS = 200;
const MAX_TODOS = 200;
const MAX_TODOS_DOC = 500;

const TAGS: EventTag[] = ["school", "sport", "family", "work", "other", "recurring"];
const STATUSES: TodoStatus[] = ["todo", "doing", "done"];
const EFFORTS: Effort[] = ["5m", "15m", "30m", "1h+"];
const MAX_MEAL_IDEAS = 300;
const MAX_MEAL_IDEA_LENGTH = 80;
const MAX_PRACTICE_SKILLS = 30;
const MAX_PRACTICE_LOGS = 20000;
const MAX_PRACTICE_NAME = 40;
const MAX_PRACTICE_ICON = 8;
const MAX_PRACTICE_TINY_WIN = 80;
const MAX_PRACTICE_IDENTITY = 120;
const MAX_PRACTICE_PLAN = 120;
const MAX_PRACTICE_ENV_ITEMS = 10;
const MAX_PRACTICE_ENV_LABEL = 80;
const MAX_PRACTICE_REVIEW = 500;
const MAX_PRACTICE_MINUTES = 240;
const MAX_PRACTICE_NOTE = 200;
const MAX_PRACTICE_REMINDER_TIMES = 6;

export function validateWeekDoc(doc: WeekDoc, expectedWeekId: string): string[] {
  const errors: string[] = [];
  if (doc.weekId !== expectedWeekId) {
    errors.push("weekId_mismatch");
  }
  if (doc.timezone !== "Europe/London") {
    errors.push("timezone_invalid");
  }
  if (!Array.isArray(doc.people) || doc.people.length === 0) {
    errors.push("people_missing");
  }
  if (doc.people.some((person) => !PEOPLE.includes(person))) {
    errors.push("people_invalid");
  }
  if (doc.people.length !== PEOPLE.length) {
    errors.push("people_invalid");
  }
  for (const person of PEOPLE) {
    if (!doc.people.includes(person)) {
      errors.push("people_invalid");
      break;
    }
  }
  if (!Number.isInteger(doc.version) || doc.version < 1) {
    errors.push("version_invalid");
  }
  if (!doc.updatedAt || typeof doc.updatedAt !== "string") {
    errors.push("updatedAt_invalid");
  }
  if (!Array.isArray(doc.events) || doc.events.length > MAX_EVENTS) {
    errors.push("events_invalid");
  } else {
    doc.events.forEach((event) => {
      errors.push(...validateEvent(event, doc.people));
    });
  }
  if (!Array.isArray(doc.todos) || doc.todos.length > MAX_TODOS) {
    errors.push("todos_invalid");
  } else {
    doc.todos.forEach((todo) => {
      errors.push(...validateTodo(todo, doc.people));
    });
  }
  if (!doc.meals || typeof doc.meals !== "object") {
    errors.push("meals_invalid");
  } else {
    for (let i = 0; i < 7; i += 1) {
      const value = doc.meals[String(i)];
      if (typeof value !== "string") {
        errors.push("meals_invalid");
        break;
      }
    }
  }
  if (!doc.focus || typeof doc.focus !== "object") {
    errors.push("focus_invalid");
  } else {
    for (const person of PEOPLE) {
      if (typeof doc.focus[person] !== "string") {
        errors.push("focus_invalid");
        break;
      }
    }
  }
  if (typeof doc.notes !== "string") {
    errors.push("notes_invalid");
  }
  return errors;
}

export function validateMealIdeasDoc(doc: MealIdeasDoc): string[] {
  const errors: string[] = [];
  if (doc.schemaVersion !== 1) {
    errors.push("schema_invalid");
  }
  if (!Number.isInteger(doc.version) || doc.version < 1) {
    errors.push("version_invalid");
  }
  if (!doc.updatedAt || typeof doc.updatedAt !== "string") {
    errors.push("updatedAt_invalid");
  }
  if (!Array.isArray(doc.ideas)) {
    errors.push("ideas_invalid");
  } else {
    if (doc.ideas.length > MAX_MEAL_IDEAS) {
      errors.push("ideas_invalid");
    }
    for (const idea of doc.ideas) {
      if (typeof idea !== "string") {
        errors.push("ideas_invalid");
        break;
      }
      const trimmed = idea.trim();
      if (!trimmed || trimmed.length > MAX_MEAL_IDEA_LENGTH) {
        errors.push("ideas_invalid");
        break;
      }
    }
  }
  return errors;
}

export function validateTodosDoc(doc: TodosDoc): string[] {
  const errors: string[] = [];
  if (doc.schemaVersion !== 1) {
    errors.push("schema_invalid");
  }
  if (doc.timezone !== "Europe/London") {
    errors.push("timezone_invalid");
  }
  if (!Number.isInteger(doc.version) || doc.version < 1) {
    errors.push("version_invalid");
  }
  if (!doc.updatedAt || typeof doc.updatedAt !== "string") {
    errors.push("updatedAt_invalid");
  }
  if (!Array.isArray(doc.todos) || doc.todos.length > MAX_TODOS_DOC) {
    errors.push("todos_invalid");
  } else {
    doc.todos.forEach((todo) => {
      errors.push(...validateTodo(todo, PEOPLE));
    });
  }
  return errors;
}

export function validatePracticeDoc(doc: PracticeDoc): string[] {
  const errors: string[] = [];
  if (doc.schemaVersion !== 1) {
    errors.push("schema_invalid");
  }
  if (doc.timezone !== "Europe/London") {
    errors.push("timezone_invalid");
  }
  if (!Array.isArray(doc.people) || doc.people.length === 0) {
    errors.push("people_missing");
  } else {
    if (doc.people.some((person) => !PEOPLE.includes(person))) {
      errors.push("people_invalid");
    }
    if (doc.people.length !== PEOPLE.length) {
      errors.push("people_invalid");
    }
    for (const person of PEOPLE) {
      if (!doc.people.includes(person)) {
        errors.push("people_invalid");
        break;
      }
    }
  }
  if (!Number.isInteger(doc.version) || doc.version < 1) {
    errors.push("version_invalid");
  }
  if (!doc.updatedAt || typeof doc.updatedAt !== "string") {
    errors.push("updatedAt_invalid");
  }
  if (!doc.reminders || typeof doc.reminders !== "object") {
    errors.push("reminders_invalid");
  } else {
    errors.push(...validatePracticeReminders(doc.reminders, PEOPLE));
  }

  const skillIdsByPerson: Record<PersonId, Set<string>> = {
    mum: new Set(),
    dad: new Set(),
    son: new Set(),
  };
  if (!doc.skillsByPerson || typeof doc.skillsByPerson !== "object") {
    errors.push("skills_invalid");
  } else {
    const keys = Object.keys(doc.skillsByPerson);
    if (keys.some((key) => !PEOPLE.includes(key as PersonId))) {
      errors.push("skills_invalid");
    }
    for (const person of PEOPLE) {
      const list = doc.skillsByPerson[person];
      if (!Array.isArray(list)) {
        errors.push("skills_invalid");
        continue;
      }
      if (list.length > MAX_PRACTICE_SKILLS) {
        errors.push("skills_invalid");
      }
      for (const skill of list) {
        errors.push(...validatePracticeSkill(skill));
        if (skill && typeof skill.id === "string") {
          if (skillIdsByPerson[person].has(skill.id)) {
            errors.push("skill_id_duplicate");
          } else {
            skillIdsByPerson[person].add(skill.id);
          }
        }
      }
    }
  }

  if (!Array.isArray(doc.logs)) {
    errors.push("logs_invalid");
  } else {
    if (doc.logs.length > MAX_PRACTICE_LOGS) {
      errors.push("logs_invalid");
    }
    for (const entry of doc.logs) {
      errors.push(...validatePracticeLogEntry(entry, skillIdsByPerson));
    }
  }

  if (!doc.reviewsByWeekId || typeof doc.reviewsByWeekId !== "object") {
    errors.push("reviews_invalid");
  } else {
    for (const [weekId, reviews] of Object.entries(doc.reviewsByWeekId)) {
      if (!parseWeekId(weekId)) {
        errors.push("review_week_invalid");
      }
      if (!reviews || typeof reviews !== "object") {
        errors.push("reviews_invalid");
        continue;
      }
      for (const [personId, review] of Object.entries(reviews)) {
        if (!PEOPLE.includes(personId as PersonId)) {
          errors.push("review_person_invalid");
          continue;
        }
        errors.push(...validatePracticeReview(review as PracticeWeeklyReview));
      }
    }
  }

  return errors;
}

function validateEvent(event: PlannerEvent, people: PersonId[]): string[] {
  const errors: string[] = [];
  if (!event.id || typeof event.id !== "string") {
    errors.push("event_id_invalid");
  }
  if (!Number.isInteger(event.day) || event.day < 0 || event.day > 6) {
    errors.push("event_day_invalid");
  }
  if (event.time) {
    if (!/^\d{2}:\d{2}$/.test(event.time)) {
      errors.push("event_time_invalid");
    } else {
      const [h, m] = event.time.split(":").map(Number);
      if (h < 0 || h > 23 || m < 0 || m > 59) {
        errors.push("event_time_invalid");
      }
    }
  }
  if (!event.title || typeof event.title !== "string") {
    errors.push("event_title_invalid");
  } else {
    const trimmed = event.title.trim();
    if (!trimmed || trimmed.length > 140) {
      errors.push("event_title_invalid");
    }
  }
  if (event.location !== undefined) {
    if (typeof event.location !== "string") {
      errors.push("event_location_invalid");
    } else {
      const trimmed = event.location.trim();
      if (!trimmed || trimmed.length > 80) {
        errors.push("event_location_invalid");
      }
    }
  }
  if (event.order !== undefined) {
    if (!Number.isInteger(event.order) || event.order < 0) {
      errors.push("event_order_invalid");
    }
  }
  if (!Array.isArray(event.who)) {
    errors.push("event_who_invalid");
  } else if (event.who.some((person) => !people.includes(person))) {
    errors.push("event_who_invalid");
  }
  if (event.tag && !TAGS.includes(event.tag)) {
    errors.push("event_tag_invalid");
  }
  return errors;
}

function validatePracticeReminders(
  reminders: PracticeReminderSettings,
  people: PersonId[]
): string[] {
  const errors: string[] = [];
  if (!reminders || typeof reminders !== "object") {
    errors.push("reminders_invalid");
    return errors;
  }
  if (!reminders.enabledByPerson || typeof reminders.enabledByPerson !== "object") {
    errors.push("reminders_invalid");
  } else {
    const keys = Object.keys(reminders.enabledByPerson);
    if (keys.some((key) => !people.includes(key as PersonId))) {
      errors.push("reminders_invalid");
    }
    for (const person of people) {
      if (typeof reminders.enabledByPerson[person] !== "boolean") {
        errors.push("reminders_invalid");
      }
    }
  }
  errors.push(...validateReminderTimes(reminders.weekdayTimes));
  errors.push(...validateReminderTimes(reminders.weekendTimes));
  return errors;
}

function validateReminderTimes(times: unknown): string[] {
  if (!Array.isArray(times) || times.length > MAX_PRACTICE_REMINDER_TIMES) {
    return ["reminders_invalid"];
  }
  const errors: string[] = [];
  for (const time of times) {
    if (!isValidTimeString(time)) {
      errors.push("reminder_time_invalid");
    }
  }
  return errors;
}

function isValidTimeString(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) {
    return false;
  }
  const [hour, minute] = value.split(":").map(Number);
  return (
    Number.isInteger(hour) &&
    Number.isInteger(minute) &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59
  );
}

function validateTodo(todo: TodoItem, people: PersonId[]): string[] {
  const errors: string[] = [];
  if (!todo.id || typeof todo.id !== "string") {
    errors.push("todo_id_invalid");
  }
  if (!todo.title || typeof todo.title !== "string") {
    errors.push("todo_title_invalid");
  } else {
    const trimmed = todo.title.trim();
    if (!trimmed || trimmed.length > 140) {
      errors.push("todo_title_invalid");
    }
  }
  if (!people.includes(todo.owner)) {
    errors.push("todo_owner_invalid");
  }
  if (!STATUSES.includes(todo.status)) {
    errors.push("todo_status_invalid");
  }
  if (todo.effort && !EFFORTS.includes(todo.effort)) {
    errors.push("todo_effort_invalid");
  }
  if (todo.order !== undefined) {
    if (!Number.isInteger(todo.order) || todo.order < 0) {
      errors.push("todo_order_invalid");
    }
  }
  return errors;
}

function validatePracticeSkill(skill: PracticeSkill): string[] {
  const errors: string[] = [];
  if (!skill || typeof skill !== "object") {
    errors.push("skill_invalid");
    return errors;
  }
  if (!skill.id || typeof skill.id !== "string") {
    errors.push("skill_id_invalid");
  }
  if (!skill.name || typeof skill.name !== "string") {
    errors.push("skill_name_invalid");
  } else {
    const trimmed = skill.name.trim();
    if (!trimmed || trimmed.length > MAX_PRACTICE_NAME) {
      errors.push("skill_name_invalid");
    }
  }
  if (!skill.icon || typeof skill.icon !== "string") {
    errors.push("skill_icon_invalid");
  } else {
    const trimmed = skill.icon.trim();
    if (!trimmed || trimmed.length > MAX_PRACTICE_ICON) {
      errors.push("skill_icon_invalid");
    }
  }
  if (!Number.isInteger(skill.order) || skill.order < 0) {
    errors.push("skill_order_invalid");
  }
  if (skill.archivedAt !== undefined) {
    if (typeof skill.archivedAt !== "string") {
      errors.push("skill_archived_invalid");
    } else if (Number.isNaN(Date.parse(skill.archivedAt))) {
      errors.push("skill_archived_invalid");
    }
  }
  if (!skill.tinyWin || typeof skill.tinyWin !== "string") {
    errors.push("skill_tinywin_invalid");
  } else {
    const trimmed = skill.tinyWin.trim();
    if (!trimmed || trimmed.length > MAX_PRACTICE_TINY_WIN) {
      errors.push("skill_tinywin_invalid");
    }
  }
  if (skill.identity !== undefined) {
    if (typeof skill.identity !== "string") {
      errors.push("skill_identity_invalid");
    } else if (skill.identity.trim().length > MAX_PRACTICE_IDENTITY) {
      errors.push("skill_identity_invalid");
    }
  }
  if (skill.plan !== undefined) {
    if (typeof skill.plan !== "string") {
      errors.push("skill_plan_invalid");
    } else if (skill.plan.trim().length > MAX_PRACTICE_PLAN) {
      errors.push("skill_plan_invalid");
    }
  }
  if (skill.environment !== undefined) {
    if (!Array.isArray(skill.environment)) {
      errors.push("skill_environment_invalid");
    } else {
      if (skill.environment.length > MAX_PRACTICE_ENV_ITEMS) {
        errors.push("skill_environment_invalid");
      }
      const seen = new Set<string>();
      for (const item of skill.environment) {
        if (!item || typeof item !== "object") {
          errors.push("skill_environment_invalid");
          continue;
        }
        if (!item.id || typeof item.id !== "string") {
          errors.push("skill_environment_invalid");
        } else if (seen.has(item.id)) {
          errors.push("skill_environment_invalid");
        } else {
          seen.add(item.id);
        }
        if (!item.label || typeof item.label !== "string") {
          errors.push("skill_environment_invalid");
        } else {
          const trimmed = item.label.trim();
          if (!trimmed || trimmed.length > MAX_PRACTICE_ENV_LABEL) {
            errors.push("skill_environment_invalid");
          }
        }
        if (typeof item.done !== "boolean") {
          errors.push("skill_environment_invalid");
        }
      }
    }
  }
  return errors;
}

function validatePracticeLogEntry(
  entry: PracticeLogEntry,
  skillIdsByPerson: Record<PersonId, Set<string>>
): string[] {
  const errors: string[] = [];
  if (!entry || typeof entry !== "object") {
    errors.push("log_invalid");
    return errors;
  }
  if (!entry.id || typeof entry.id !== "string") {
    errors.push("log_id_invalid");
  }
  if (!entry.weekId || typeof entry.weekId !== "string") {
    errors.push("log_week_invalid");
  } else if (!parseWeekId(entry.weekId)) {
    errors.push("log_week_invalid");
  }
  if (!Number.isInteger(entry.day) || entry.day < 0 || entry.day > 6) {
    errors.push("log_day_invalid");
  }
  if (!PEOPLE.includes(entry.personId)) {
    errors.push("log_person_invalid");
  }
  if (!entry.skillId || typeof entry.skillId !== "string") {
    errors.push("log_skill_invalid");
  } else if (
    PEOPLE.includes(entry.personId) &&
    !skillIdsByPerson[entry.personId].has(entry.skillId)
  ) {
    errors.push("log_skill_invalid");
  }
  if (entry.durationMinutes !== undefined) {
    if (!Number.isInteger(entry.durationMinutes)) {
      errors.push("log_duration_invalid");
    } else if (
      entry.durationMinutes < 1 ||
      entry.durationMinutes > MAX_PRACTICE_MINUTES
    ) {
      errors.push("log_duration_invalid");
    }
  }
  if (entry.note !== undefined) {
    if (typeof entry.note !== "string") {
      errors.push("log_note_invalid");
    } else if (entry.note.trim().length > MAX_PRACTICE_NOTE) {
      errors.push("log_note_invalid");
    }
  }
  if (!entry.createdAt || typeof entry.createdAt !== "string") {
    errors.push("log_created_invalid");
  }
  return errors;
}

function validatePracticeReview(review: PracticeWeeklyReview): string[] {
  const errors: string[] = [];
  if (!review || typeof review !== "object") {
    errors.push("review_invalid");
    return errors;
  }
  if (typeof review.helped !== "string") {
    errors.push("review_helped_invalid");
  } else if (review.helped.length > MAX_PRACTICE_REVIEW) {
    errors.push("review_helped_invalid");
  }
  if (typeof review.tweak !== "string") {
    errors.push("review_tweak_invalid");
  } else if (review.tweak.length > MAX_PRACTICE_REVIEW) {
    errors.push("review_tweak_invalid");
  }
  if (!review.updatedAt || typeof review.updatedAt !== "string") {
    errors.push("review_updated_invalid");
  }
  return errors;
}
