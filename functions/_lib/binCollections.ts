import { BinCollectionEvent, BinCollectionsDoc, BinServiceId } from "../../src/domain/types";
import { binsKey, compareEvents, validateBinCollectionsDoc } from "../../src/shared/binCollectionsValidation";
import { Env } from "./store";

const TIMEZONE = "Europe/London";

const SERVICE_NAMES: Record<BinServiceId, string> = {
  food: "Food Waste Collection Service",
  recycling: "Recycling Collection Service",
  domestic: "Domestic Waste Collection Service",
  garden: "Garden Waste Collection Service",
  unknown: "Other Collection Service",
};

export async function getOrCreateBinCollections(
  env: Env,
  uprn: string,
  request: Request
): Promise<BinCollectionsDoc | null> {
  const key = binsKey(uprn);
  const existing = await env.FAMILY_PLANNER_KV.get<BinCollectionsDoc>(key, "json");
  if (existing) {
    return existing;
  }
  if (!isLocalRequest(request)) {
    return null;
  }
  const seed = buildSeedDoc(uprn);
  const errors = validateBinCollectionsDoc(seed);
  if (errors.length > 0) {
    return null;
  }
  await env.FAMILY_PLANNER_KV.put(key, JSON.stringify(seed));
  return seed;
}

function isLocalRequest(request: Request): boolean {
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function buildSeedDoc(uprn: string): BinCollectionsDoc {
  const events = buildSeedEvents();
  const sortedEvents = [...events].sort(compareEvents);
  const rangeFrom = sortedEvents[0]?.date ?? getTodayIso();
  const rangeTo = sortedEvents[sortedEvents.length - 1]?.date ?? rangeFrom;

  return {
    schemaVersion: 1,
    uprn,
    rangeFrom,
    rangeTo,
    sourceHash: "seed-2025-12-01",
    updatedAt: new Date().toISOString(),
    events: sortedEvents,
  };
}

function buildSeedEvents(): BinCollectionEvent[] {
  const raw = [
    {
      service: "Food Waste Collection Service",
      round: "FOOD5",
      schedule: "Mon",
      day: "Monday",
      date: "01/12/2025 00:00:00",
      read_date: "Monday 1st of December",
    },
    {
      service: "Recycling Collection Service",
      round: "3AREC",
      schedule: "MonFort2",
      day: "Monday",
      date: "01/12/2025 00:00:00",
      read_date: "Monday 1st of December",
    },
    {
      service: "Domestic Waste Collection Service",
      round: "1ADOM",
      schedule: "MonFort1",
      day: "Monday",
      date: "08/12/2025 00:00:00",
      read_date: "Monday 8th of December",
    },
    {
      service: "Food Waste Collection Service",
      round: "FOOD5",
      schedule: "Mon",
      day: "Monday",
      date: "08/12/2025 00:00:00",
      read_date: "Monday 8th of December",
    },
    {
      service: "Garden Waste Collection Service",
      round: "GREEN2",
      schedule: "FriFort1",
      day: "Friday",
      date: "12/12/2025 00:00:00",
      read_date: "Friday 12th of December",
    },
    {
      service: "Food Waste Collection Service",
      round: "FOOD5",
      schedule: "Mon",
      day: "Monday",
      date: "15/12/2025 00:00:00",
      read_date: "Monday 15th of December",
    },
    {
      service: "Recycling Collection Service",
      round: "3AREC",
      schedule: "MonFort2",
      day: "Monday",
      date: "15/12/2025 00:00:00",
      read_date: "Monday 15th of December",
    },
    {
      service: "Domestic Waste Collection Service",
      round: "1ADOM",
      schedule: "MonFort1",
      day: "Monday",
      date: "22/12/2025 00:00:00",
      read_date: "Monday 22nd of December",
    },
    {
      service: "Food Waste Collection Service",
      round: "FOOD5",
      schedule: "Mon",
      day: "Monday",
      date: "22/12/2025 00:00:00",
      read_date: "Monday 22nd of December",
    },
    {
      service: "Food Waste Collection Service",
      round: "FOOD5",
      schedule: "Mon",
      day: "Monday",
      date: "30/12/2025 00:00:00",
      read_date: "Tuesday 30th of December",
    },
    {
      service: "Recycling Collection Service",
      round: "3AREC",
      schedule: "MonFort2",
      day: "Monday",
      date: "30/12/2025 00:00:00",
      read_date: "Tuesday 30th of December",
    },
    {
      service: "Domestic Waste Collection Service",
      round: "1ADOM",
      schedule: "MonFort1",
      day: "Monday",
      date: "06/01/2026 00:00:00",
      read_date: "Tuesday 6th of January",
    },
    {
      service: "Food Waste Collection Service",
      round: "FOOD5",
      schedule: "Mon",
      day: "Monday",
      date: "06/01/2026 00:00:00",
      read_date: "Tuesday 6th of January",
    },
    {
      service: "Garden Waste Collection Service",
      round: "GREEN2",
      schedule: "FriFort1",
      day: "Friday",
      date: "10/01/2026 00:00:00",
      read_date: "Saturday 10th of January",
    },
    {
      service: "Food Waste Collection Service",
      round: "FOOD5",
      schedule: "Mon",
      day: "Monday",
      date: "12/01/2026 00:00:00",
      read_date: "Monday 12th of January",
    },
    {
      service: "Recycling Collection Service",
      round: "3AREC",
      schedule: "MonFort2",
      day: "Monday",
      date: "12/01/2026 00:00:00",
      read_date: "Monday 12th of January",
    },
    {
      service: "Domestic Waste Collection Service",
      round: "1ADOM",
      schedule: "MonFort1",
      day: "Monday",
      date: "19/01/2026 00:00:00",
      read_date: "Monday 19th of January",
    },
    {
      service: "Food Waste Collection Service",
      round: "FOOD5",
      schedule: "Mon",
      day: "Monday",
      date: "19/01/2026 00:00:00",
      read_date: "Monday 19th of January",
    },
    {
      service: "Garden Waste Collection Service",
      round: "GREEN2",
      schedule: "FriFort1",
      day: "Friday",
      date: "23/01/2026 00:00:00",
      read_date: "Friday 23rd of January",
    },
    {
      service: "Food Waste Collection Service",
      round: "FOOD5",
      schedule: "Mon",
      day: "Monday",
      date: "26/01/2026 00:00:00",
      read_date: "Monday 26th of January",
    },
    {
      service: "Recycling Collection Service",
      round: "3AREC",
      schedule: "MonFort2",
      day: "Monday",
      date: "26/01/2026 00:00:00",
      read_date: "Monday 26th of January",
    },
    {
      service: "Domestic Waste Collection Service",
      round: "1ADOM",
      schedule: "MonFort1",
      day: "Monday",
      date: "02/02/2026 00:00:00",
      read_date: "Monday 2nd of February",
    },
    {
      service: "Food Waste Collection Service",
      round: "FOOD5",
      schedule: "Mon",
      day: "Monday",
      date: "02/02/2026 00:00:00",
      read_date: "Monday 2nd of February",
    },
    {
      service: "Garden Waste Collection Service",
      round: "GREEN2",
      schedule: "FriFort1",
      day: "Friday",
      date: "06/02/2026 00:00:00",
      read_date: "Friday 6th of February",
    },
    {
      service: "Food Waste Collection Service",
      round: "FOOD5",
      schedule: "Mon",
      day: "Monday",
      date: "09/02/2026 00:00:00",
      read_date: "Monday 9th of February",
    },
    {
      service: "Recycling Collection Service",
      round: "3AREC",
      schedule: "MonFort2",
      day: "Monday",
      date: "09/02/2026 00:00:00",
      read_date: "Monday 9th of February",
    },
    {
      service: "Domestic Waste Collection Service",
      round: "1ADOM",
      schedule: "MonFort1",
      day: "Monday",
      date: "16/02/2026 00:00:00",
      read_date: "Monday 16th of February",
    },
    {
      service: "Food Waste Collection Service",
      round: "FOOD5",
      schedule: "Mon",
      day: "Monday",
      date: "16/02/2026 00:00:00",
      read_date: "Monday 16th of February",
    },
    {
      service: "Garden Waste Collection Service",
      round: "GREEN2",
      schedule: "FriFort1",
      day: "Friday",
      date: "20/02/2026 00:00:00",
      read_date: "Friday 20th of February",
    },
    {
      service: "Food Waste Collection Service",
      round: "FOOD5",
      schedule: "Mon",
      day: "Monday",
      date: "23/02/2026 00:00:00",
      read_date: "Monday 23rd of February",
    },
    {
      service: "Recycling Collection Service",
      round: "3AREC",
      schedule: "MonFort2",
      day: "Monday",
      date: "23/02/2026 00:00:00",
      read_date: "Monday 23rd of February",
    },
  ];

  return raw.map((item) => ({
    date: parseSeedDate(item.date),
    serviceId: mapServiceId(item.service),
    serviceName: item.service,
    round: item.round,
    schedule: item.schedule,
    dayName: item.day,
    readDate: item.read_date,
  }));
}

function parseSeedDate(value: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})\s+\d{2}:\d{2}:\d{2}$/.exec(value);
  if (!match) {
    return value;
  }
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function mapServiceId(serviceName: string): BinServiceId {
  if (serviceName === SERVICE_NAMES.food) {
    return "food";
  }
  if (serviceName === SERVICE_NAMES.recycling) {
    return "recycling";
  }
  if (serviceName === SERVICE_NAMES.domestic) {
    return "domestic";
  }
  if (serviceName === SERVICE_NAMES.garden) {
    return "garden";
  }
  return "unknown";
}

function getTodayIso(): string {
  const parts = getDatePartsInTimeZone(new Date(), TIMEZONE);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function getDatePartsInTimeZone(date: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
} {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const lookup: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      lookup[part.type] = part.value;
    }
  }
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
  };
}
