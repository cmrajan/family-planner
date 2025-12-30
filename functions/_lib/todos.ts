import { TodosDoc } from "../../src/domain/types";

export function defaultTodosDoc(): TodosDoc {
  return {
    schemaVersion: 1,
    timezone: "Europe/London",
    version: 1,
    updatedAt: new Date().toISOString(),
    todos: [],
  };
}
