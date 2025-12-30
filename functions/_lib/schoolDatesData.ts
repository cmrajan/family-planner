import { SchoolDatesDocument } from "../../src/domain/types";

const TAGS = ["school", "example-school"];

export const EXAMPLE_SCHOOL_DATES: SchoolDatesDocument = {
  schemaVersion: 1,
  source: {
    name: "Example School",
    slug: "example-school",
    url: "https://example.com/term-dates",
    fetchedAt: "2025-01-01T00:00:00Z",
  },
  timezone: "Europe/London",
  academicYears: [
    {
      label: "2025-2026",
      items: [
        {
          id: "example-school|2025-2026|michaelmas|term_start|2025-09-01",
          type: "term_start",
          label: "Autumn term starts",
          term: "Michaelmas",
          academicYear: "2025-2026",
          startDate: "2025-09-01",
          endDate: "2025-09-01",
          startDayPart: "full",
          endDayPart: "full",
          notes: null,
          audience: ["students"],
          tags: TAGS,
          sourceText: "Autumn term starts — 1 September 2025",
        },
        {
          id: "example-school|2025-2026|michaelmas|holiday|2025-10-27",
          type: "holiday",
          label: "Half term",
          term: "Michaelmas",
          academicYear: "2025-2026",
          startDate: "2025-10-27",
          endDate: "2025-10-31",
          startDayPart: "full",
          endDayPart: "full",
          notes: null,
          audience: ["students"],
          tags: TAGS,
          sourceText: "Half term — 27 October 2025 to 31 October 2025",
        },
        {
          id: "example-school|2025-2026|michaelmas|term_end|2025-12-19",
          type: "term_end",
          label: "Autumn term ends (pm)",
          term: "Michaelmas",
          academicYear: "2025-2026",
          startDate: "2025-12-19",
          endDate: "2025-12-19",
          startDayPart: "full",
          endDayPart: "pm",
          notes: null,
          audience: ["students"],
          tags: TAGS,
          sourceText: "Autumn term ends — 19 December 2025 (pm)",
        },
      ],
    },
  ],
};

