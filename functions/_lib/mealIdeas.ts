import { MealIdeasDoc } from "../../src/domain/types";

export function defaultMealIdeasDoc(): MealIdeasDoc {
  return {
    schemaVersion: 1,
    version: 1,
    updatedAt: new Date().toISOString(),
    ideas: [],
  };
}
