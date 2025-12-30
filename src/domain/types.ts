export type PersonId = "mum" | "dad" | "son";

export type EventTag =
  | "school"
  | "sport"
  | "family"
  | "work"
  | "other"
  | "recurring";

export interface PlannerEvent {
  id: string;
  day: number;
  time?: string;
  title: string;
  location?: string;
  order?: number;
  who: PersonId[];
  tag?: EventTag;
}

export type TodoStatus = "todo" | "doing" | "done";
export type Effort = "5m" | "15m" | "30m" | "1h+";

export interface TodoItem {
  id: string;
  title: string;
  owner: PersonId;
  status: TodoStatus;
  effort?: Effort;
  order?: number;
}

export interface TodosDoc {
  schemaVersion: 1;
  timezone: "Europe/London";
  version: number;
  updatedAt: string;
  todos: TodoItem[];
}

export interface WeekDoc {
  weekId: string;
  timezone: "Europe/London";
  people: PersonId[];
  version: number;
  updatedAt: string;
  events: PlannerEvent[];
  todos: TodoItem[];
  meals: Record<string, string>;
  focus: Record<PersonId, string>;
  notes: string;
}

export interface PracticeSkill {
  id: string;
  name: string;
  icon: string;
  order: number;
  archivedAt?: string;
  tinyWin: string;
  identity?: string;
  plan?: string;
  environment?: { id: string; label: string; done: boolean }[];
}

export interface PracticeLogEntry {
  id: string;
  weekId: string;
  day: number;
  personId: PersonId;
  skillId: string;
  durationMinutes?: number;
  note?: string;
  createdAt: string;
}

export interface PracticeWeeklyReview {
  helped: string;
  tweak: string;
  updatedAt: string;
}

export interface PracticeReminderSettings {
  enabledByPerson: Record<PersonId, boolean>;
  weekdayTimes: string[];
  weekendTimes: string[];
}

export interface PracticeDoc {
  schemaVersion: 1;
  timezone: "Europe/London";
  version: number;
  updatedAt: string;
  people: PersonId[];
  skillsByPerson: Record<PersonId, PracticeSkill[]>;
  logs: PracticeLogEntry[];
  reviewsByWeekId: Record<string, Partial<Record<PersonId, PracticeWeeklyReview>>>;
  reminders: PracticeReminderSettings;
}

export type UniversalAddMode = "auto" | "event" | "todo";

export type UniversalAddKind = "event" | "todo";

export interface UniversalAddParseRequest {
  text: string;
  mode: UniversalAddMode;
  timezone: "Europe/London";
  nowIso: string;
  defaultOwner: PersonId;
  people: PersonId[];
  currentWeekId: string;
}

export interface UniversalAddParseEvent {
  kind: "event";
  title: string;
  date?: string;
  day?: number;
  time?: string;
  location?: string;
  who: PersonId[];
  tag?: EventTag;
}

export interface UniversalAddParseTodo {
  kind: "todo";
  title: string;
  owner: PersonId;
  effort?: Effort;
}

export interface UniversalAddParseResult {
  kind: UniversalAddKind;
  confidence: "high" | "medium" | "low";
  reasoning?: string;
  event?: UniversalAddParseEvent;
  todo?: UniversalAddParseTodo;
}

export interface MealIdeasDoc {
  schemaVersion: 1;
  version: number;
  updatedAt: string;
  ideas: string[];
}

export interface ViewerInfo {
  email?: string;
  personId?: PersonId;
}

export interface WeekPayload {
  week: WeekDoc;
  readOnly: boolean;
  viewer?: ViewerInfo;
}

export interface WebPushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface WebPushSubscriptionJson {
  endpoint: string;
  keys: WebPushSubscriptionKeys;
}

export interface PushSubscribeRequest {
  deviceId: string;
  subscription: WebPushSubscriptionJson;
  userAgent?: string;
}

export interface PushSubscribeResponse {
  stored: boolean;
  count: number;
}

export interface PushUnsubscribeRequest {
  deviceId?: string;
  endpoint?: string;
}

export interface PushTestRequest {
  deviceId: string;
}

export interface PushSendTestResponse {
  attempted: number;
  sent: number;
  removed: number;
}

export interface PushMessagePayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
  timestamp: string;
}

export type SchoolDateType =
  | "term_start"
  | "term_end"
  | "holiday"
  | "reading_week"
  | "staff_day"
  | "bank_holiday"
  | "exam"
  | "reopen"
  | "info";

export type SchoolDayPart = "full" | "am" | "pm";

export type SchoolTerm = "Michaelmas" | "Lent" | "Summer" | null;

export interface SchoolDateItem {
  id: string;
  type: SchoolDateType;
  label: string;
  term: SchoolTerm;
  academicYear: string;
  startDate: string;
  endDate: string;
  startDayPart: SchoolDayPart;
  endDayPart: SchoolDayPart;
  notes: string | null;
  audience: string[];
  tags: string[];
  sourceText: string;
}

export interface SchoolAcademicYear {
  label: string;
  items: SchoolDateItem[];
}

export interface SchoolDatesSource {
  name: string;
  slug: string;
  url: string;
  fetchedAt: string;
  etag?: string;
  lastModified?: string;
  contentHash?: string;
}

export interface SchoolDatesDocument {
  schemaVersion: 1;
  source: SchoolDatesSource;
  timezone: "Europe/London";
  academicYears: SchoolAcademicYear[];
}

export type BinServiceId = "food" | "recycling" | "domestic" | "garden" | "unknown";

export interface BinCollectionEvent {
  date: string;
  serviceId: BinServiceId;
  serviceName: string;
  round: string;
  schedule: string;
  dayName: string;
  readDate: string;
}

export interface BinCollectionsDoc {
  schemaVersion: 1;
  uprn: string;
  rangeFrom: string;
  rangeTo: string;
  sourceHash: string;
  updatedAt: string;
  events: BinCollectionEvent[];
}

export type KvBackupFormat = "family-planner-kv-backup";
export type KvBackupEntryEncoding = "text" | "json";

export interface KvBackupEntryV1 {
  key: string;
  encoding: KvBackupEntryEncoding;
  value: string;
  contentType?: string;
}

export interface KvBackupV1 {
  format: KvBackupFormat;
  formatVersion: 1;
  exportedAt: string;
  exportedFrom: {
    app: "family-planner";
    environment?: "local" | "preview" | "production";
    hostname?: string;
  };
  entries: KvBackupEntryV1[];
}
