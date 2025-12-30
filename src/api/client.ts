import {
  WeekDoc,
  WeekPayload,
  SchoolDatesDocument,
  BinCollectionsDoc,
  MealIdeasDoc,
  UniversalAddParseRequest,
  UniversalAddParseResult,
  PushSubscribeRequest,
  PushSubscribeResponse,
  PushUnsubscribeRequest,
  PushSendTestResponse,
  PushTestRequest,
  PracticeDoc,
  TodosDoc,
  ViewerInfo,
} from "../domain/types";

interface ApiOk<T> {
  ok: true;
  data: T;
}

interface ApiError {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

type ApiResponse<T> = ApiOk<T> | ApiError;

async function requestJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const data = (await response.json()) as ApiResponse<T>;
  if (!data.ok) {
    const error = new Error(data.error.message);
    (error as { code?: string; status?: number }).code = data.error.code;
    (error as { code?: string; status?: number }).status = response.status;
    throw error;
  }
  return data.data;
}

export async function fetchCurrentWeek(): Promise<WeekPayload> {
  return requestJson<WeekPayload>("/api/week/current");
}

export async function fetchWeek(weekId: string): Promise<WeekPayload> {
  return requestJson<WeekPayload>(`/api/week/${weekId}`);
}

export async function putWeek(week: WeekDoc): Promise<WeekDoc> {
  return requestJson<WeekDoc>(`/api/week/${week.weekId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "If-Match-Version": String(week.version),
    },
    body: JSON.stringify(week),
  });
}

export async function rolloverWeek(weekId: string): Promise<{
  archivedWeekId: string;
  nextWeekId: string;
  nextWeek: WeekDoc;
}> {
  return rolloverWeekWithOptions(weekId, {
    carryMeals: false,
    carryFocus: false,
    carryRecurring: false,
  });
}

export async function rolloverWeekWithOptions(
  weekId: string,
  options: {
    carryMeals: boolean;
    carryFocus: boolean;
    carryRecurring: boolean;
  }
): Promise<{
  archivedWeekId: string;
  nextWeekId: string;
  nextWeek: WeekDoc;
}> {
  const params = new URLSearchParams();
  if (options.carryMeals) {
    params.set("carryMeals", "1");
  }
  if (options.carryFocus) {
    params.set("carryFocus", "1");
  }
  if (options.carryRecurring) {
    params.set("carryRecurring", "1");
  }
  const query = params.toString();
  const url = query
    ? `/api/week/${weekId}/rollover?${query}`
    : `/api/week/${weekId}/rollover`;
  return requestJson(url, {
    method: "POST",
  });
}

export async function fetchSchoolDates(
  schoolSlug: string
): Promise<SchoolDatesDocument> {
  const params = new URLSearchParams();
  params.set("school", schoolSlug);
  return requestJson<SchoolDatesDocument>(`/api/school-dates?${params.toString()}`);
}

export async function fetchBinCollections(): Promise<BinCollectionsDoc> {
  return requestJson<BinCollectionsDoc>("/api/bins");
}

export async function fetchMealIdeas(): Promise<MealIdeasDoc> {
  return requestJson<MealIdeasDoc>("/api/meal-ideas");
}

export async function putMealIdeas(doc: MealIdeasDoc): Promise<MealIdeasDoc> {
  return requestJson<MealIdeasDoc>("/api/meal-ideas", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "If-Match-Version": String(doc.version),
    },
    body: JSON.stringify(doc),
  });
}

export async function fetchPractice(): Promise<PracticeDoc> {
  const data = await requestJson<{ doc: PracticeDoc }>("/api/practice");
  return data.doc;
}

export async function fetchTodos(): Promise<{ doc: TodosDoc; viewer?: ViewerInfo }> {
  return requestJson<{ doc: TodosDoc; viewer?: ViewerInfo }>("/api/todos");
}

export async function putTodos(doc: TodosDoc): Promise<TodosDoc> {
  return requestJson<TodosDoc>("/api/todos", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "If-Match-Version": String(doc.version),
    },
    body: JSON.stringify(doc),
  });
}

export async function putPractice(doc: PracticeDoc): Promise<PracticeDoc> {
  return requestJson<PracticeDoc>("/api/practice", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "If-Match-Version": String(doc.version),
    },
    body: JSON.stringify(doc),
  });
}

export async function parseUniversalAdd(
  payload: UniversalAddParseRequest
): Promise<UniversalAddParseResult> {
  return requestJson<UniversalAddParseResult>("/api/universal-add/parse", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function fetchVapidPublicKey(): Promise<{ publicKey: string }> {
  return requestJson<{ publicKey: string }>("/api/push/vapid-public-key");
}

export async function subscribePush(
  payload: PushSubscribeRequest
): Promise<PushSubscribeResponse> {
  return requestJson<PushSubscribeResponse>("/api/push/subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function unsubscribePush(
  payload: PushUnsubscribeRequest
): Promise<{ removed: number; count: number }> {
  return requestJson<{ removed: number; count: number }>("/api/push/unsubscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function sendPushTest(
  payload: PushTestRequest
): Promise<PushSendTestResponse> {
  return requestJson<PushSendTestResponse>("/api/push/test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export interface SchoolDatesRefreshResponse {
  ok: true;
  updated: boolean;
  school: string;
  fetchedAt?: string;
  items?: number;
  academicYears?: number;
}

export async function refreshSchoolDates(
  schoolSlug: string
): Promise<SchoolDatesRefreshResponse> {
  const params = new URLSearchParams();
  params.set("school", schoolSlug);
  const response = await fetch(`/api/school-dates/refresh?${params.toString()}`, {
    method: "POST",
  });
  const data = (await response.json()) as
    | SchoolDatesRefreshResponse
    | {
        ok: false;
        error: { code: string; message: string };
      };
  if (!data || data.ok !== true) {
    const error = new Error(
      (data && "error" in data && data.error.message) || "Unable to refresh school dates"
    );
    (error as { code?: string; status?: number }).code =
      data && "error" in data ? data.error.code : undefined;
    (error as { code?: string; status?: number }).status = response.status;
    throw error;
  }
  return data;
}

export interface BinCollectionsRefreshResponse {
  changed: boolean;
  doc?: BinCollectionsDoc;
}

export async function refreshBinCollections(): Promise<BinCollectionsRefreshResponse> {
  const response = await fetch("/api/bins/refresh", { method: "POST" });
  const data = (await response.json()) as unknown;

  if (data && typeof data === "object" && "ok" in data && (data as ApiError).ok === false) {
    const apiError = data as ApiError;
    const error = new Error(apiError.error.message);
    (error as { code?: string; status?: number }).code = apiError.error.code;
    (error as { code?: string; status?: number }).status = response.status;
    throw error;
  }

  if (data && typeof data === "object" && "changed" in data) {
    const parsed = data as BinCollectionsRefreshResponse;
    if (typeof parsed.changed === "boolean") {
      return parsed;
    }
  }

  const error = new Error("Unable to refresh bins");
  (error as { code?: string; status?: number }).status = response.status;
  throw error;
}
