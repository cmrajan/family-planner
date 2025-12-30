import { WeekDoc, MealIdeasDoc, PracticeDoc, TodosDoc } from "../../src/domain/types";
import { defaultWeekDoc } from "./week";
import { defaultMealIdeasDoc } from "./mealIdeas";
import { defaultPracticeDoc } from "./practice";
import { defaultTodosDoc } from "./todos";

export interface Env {
  FAMILY_PLANNER_KV: KVNamespace;
  USER_EMAIL_MAP?: string;
  DEV_USER_EMAIL?: string;
  BIN_COLLECTIONS_UPRN?: string;
  BIN_COLLECTIONS_SOURCE_BASE?: string;
  BACKUP_ADMIN_EMAILS?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  SCHOOL_DATES_SOURCE_URL?: string;
  SCHOOL_DATES_SOURCE_NAME?: string;
  SCHOOL_DATES_SCHOOL_SLUG?: string;
  PUSH_VAPID_PUBLIC_KEY?: string;
  PUSH_VAPID_PRIVATE_KEY?: string;
  PUSH_VAPID_SUBJECT?: string;
}

export function weekKey(weekId: string): string {
  return `week:${weekId}`;
}

export function archiveKey(weekId: string): string {
  return `archive:${weekId}`;
}

export function mealIdeasKey(): string {
  return "meal_ideas:v1";
}

export function practiceKey(): string {
  return "practice:v1";
}

export function todosKey(): string {
  return "todos:v1";
}

export async function getWeek(env: Env, weekId: string): Promise<WeekDoc | null> {
  return await env.FAMILY_PLANNER_KV.get(weekKey(weekId), "json");
}

export async function getArchive(
  env: Env,
  weekId: string
): Promise<WeekDoc | null> {
  return await env.FAMILY_PLANNER_KV.get(archiveKey(weekId), "json");
}

export async function putWeek(env: Env, doc: WeekDoc): Promise<void> {
  await env.FAMILY_PLANNER_KV.put(weekKey(doc.weekId), JSON.stringify(doc));
}

export async function getMealIdeas(env: Env): Promise<MealIdeasDoc | null> {
  return await env.FAMILY_PLANNER_KV.get(mealIdeasKey(), "json");
}

export async function putMealIdeas(env: Env, doc: MealIdeasDoc): Promise<void> {
  await env.FAMILY_PLANNER_KV.put(mealIdeasKey(), JSON.stringify(doc));
}

export async function getPractice(env: Env): Promise<PracticeDoc | null> {
  return await env.FAMILY_PLANNER_KV.get(practiceKey(), "json");
}

export async function putPractice(env: Env, doc: PracticeDoc): Promise<void> {
  await env.FAMILY_PLANNER_KV.put(practiceKey(), JSON.stringify(doc));
}

export async function getTodos(env: Env): Promise<TodosDoc | null> {
  return await env.FAMILY_PLANNER_KV.get(todosKey(), "json");
}

export async function putTodos(env: Env, doc: TodosDoc): Promise<void> {
  await env.FAMILY_PLANNER_KV.put(todosKey(), JSON.stringify(doc));
}

export async function getOrCreateWeek(
  env: Env,
  weekId: string
): Promise<WeekDoc> {
  const existing = await getWeek(env, weekId);
  if (existing) {
    return existing;
  }
  const created = defaultWeekDoc(weekId);
  await putWeek(env, created);
  return created;
}

export async function getOrCreateMealIdeas(env: Env): Promise<MealIdeasDoc> {
  const existing = await getMealIdeas(env);
  if (existing) {
    return existing;
  }
  const created = defaultMealIdeasDoc();
  await putMealIdeas(env, created);
  return created;
}

export async function getOrCreatePractice(env: Env): Promise<PracticeDoc> {
  const existing = await getPractice(env);
  if (existing) {
    return existing;
  }
  const created = defaultPracticeDoc();
  await putPractice(env, created);
  return created;
}

export async function getOrCreateTodos(env: Env): Promise<TodosDoc> {
  const existing = await getTodos(env);
  if (existing) {
    return existing;
  }
  const created = defaultTodosDoc();
  await putTodos(env, created);
  return created;
}

export async function putArchive(env: Env, weekId: string, doc: WeekDoc) {
  await env.FAMILY_PLANNER_KV.put(archiveKey(weekId), JSON.stringify(doc));
}
