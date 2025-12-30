import { EventTag, PersonId } from "../../domain/types";

const TAG_COLORS: Record<EventTag, string> = {
  school: "#4f7f9c",
  sport: "#6f8f4e",
  family: "#b07b5a",
  work: "#6d6a96",
  other: "#7a756f",
  recurring: "#b36a2f",
};

const PERSON_PALETTE = ["#3f7c8e", "#7c5c9b", "#c07a55", "#5f8a6a", "#9a6b4a"];

export function getTagColor(tag: EventTag | undefined): string | undefined {
  if (!tag) {
    return undefined;
  }
  return TAG_COLORS[tag];
}

export function getPersonColor(personId: PersonId): string {
  let hash = 0;
  for (let i = 0; i < personId.length; i += 1) {
    hash = (hash * 31 + personId.charCodeAt(i)) % 100000;
  }
  return PERSON_PALETTE[hash % PERSON_PALETTE.length];
}
