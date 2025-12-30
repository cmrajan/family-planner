import {
  SchoolAcademicYear,
  SchoolDateItem,
  SchoolDatesDocument,
  SchoolDateType,
  SchoolDayPart,
  SchoolTerm,
} from "../domain/types";
import {
  isValidIsoDate,
  schoolDatesKey,
  validateSchoolDatesDocument,
} from "./schoolDatesValidation";

const DEFAULT_SCHOOL_SLUG = "example-school";
const DEFAULT_SCHOOL_NAME = "Example School";

export interface RefreshContext {
  env: {
    FAMILY_PLANNER_KV: KVNamespace;
    SCHOOL_DATES_SOURCE_URL?: string;
    SCHOOL_DATES_SOURCE_NAME?: string;
    SCHOOL_DATES_SCHOOL_SLUG?: string;
  };
  fetchImpl?: typeof fetch;
  logger?: (message: string) => void;
  now?: () => Date;
}

export interface RefreshResult {
  updated: boolean;
  school: string;
  fetchedAt: string;
  items: number;
  academicYears: number;
  contentHash: string;
  document: SchoolDatesDocument;
}

export async function refreshSchoolDates(context: RefreshContext): Promise<RefreshResult> {
  const config = resolveConfig(context.env);
  const fetcher = context.fetchImpl ?? fetch;
  const fetchedAt = (context.now ?? (() => new Date()))().toISOString();
  const response = await fetcher(config.sourceUrl, {
    headers: {
      "User-Agent": `family-planner/school-dates-refresher/${config.schoolSlug}`,
    },
  });
  log(context, `Fetch status ${response.status}`);
  if (!response.ok) {
    throw new Error(`fetch_failed:${response.status}`);
  }
  const html = await response.text();
  const document = await buildSchoolDatesDocument(html, fetchedAt, config, {
    etag: response.headers.get("etag") ?? undefined,
    lastModified: response.headers.get("last-modified") ?? undefined,
  });
  const normalizedYears = normalizeAcademicYears(document.academicYears);
  const contentHash = await hashAcademicYears(normalizedYears);
  const nextDocument: SchoolDatesDocument = {
    ...document,
    academicYears: normalizedYears,
    source: {
      ...document.source,
      contentHash,
    },
  };
  const validationErrors = validateSchoolDatesDocument(nextDocument);
  if (validationErrors.length > 0) {
    log(context, `Validation failed: ${validationErrors.join(",")}`);
    throw new Error(`validation_failed:${validationErrors.join(",")}`);
  }

  const key = schoolDatesKey(config.schoolSlug);
  const existing = await context.env.FAMILY_PLANNER_KV.get<SchoolDatesDocument>(key, "json");
  if (existing?.source?.contentHash === contentHash) {
    const summary = summarizeDocument(existing);
    log(
      context,
      `Unchanged: ${summary.academicYears} year(s), ${summary.items} item(s), hash ${contentHash}`
    );
    return {
      updated: false,
      school: config.schoolSlug,
      fetchedAt: nextDocument.source.fetchedAt,
      contentHash,
      ...summary,
      document: existing,
    };
  }

  await context.env.FAMILY_PLANNER_KV.put(key, JSON.stringify(nextDocument));
  const summary = summarizeDocument(nextDocument);
  log(
    context,
    `Updated KV: ${summary.academicYears} year(s), ${summary.items} item(s), hash ${contentHash}`
  );

  return {
    updated: true,
    school: config.schoolSlug,
    fetchedAt: nextDocument.source.fetchedAt,
    contentHash,
    ...summary,
    document: nextDocument,
  };
}

interface BuildOptions {
  etag?: string;
  lastModified?: string;
}

type SchoolDatesConfig = {
  schoolSlug: string;
  sourceName: string;
  sourceUrl: string;
  tags: string[];
};

function resolveConfig(env: RefreshContext["env"]): SchoolDatesConfig {
  const schoolSlug = (env.SCHOOL_DATES_SCHOOL_SLUG ?? DEFAULT_SCHOOL_SLUG).trim() || DEFAULT_SCHOOL_SLUG;
  const sourceName = (env.SCHOOL_DATES_SOURCE_NAME ?? DEFAULT_SCHOOL_NAME).trim() || DEFAULT_SCHOOL_NAME;
  const sourceUrl = (env.SCHOOL_DATES_SOURCE_URL ?? "").trim();
  if (!sourceUrl) {
    throw new Error("SCHOOL_DATES_SOURCE_URL_REQUIRED");
  }
  return {
    schoolSlug,
    sourceName,
    sourceUrl,
    tags: ["school", schoolSlug],
  };
}

async function buildSchoolDatesDocument(
  html: string,
  fetchedAt: string,
  config: SchoolDatesConfig,
  options: BuildOptions
): Promise<SchoolDatesDocument> {
  const blocks = await collectBlocks(html);
  const academicYears = await parseBlocksToAcademicYears(blocks, config.schoolSlug, config.tags);
  return {
    schemaVersion: 1,
    source: {
      name: config.sourceName,
      slug: config.schoolSlug,
      url: config.sourceUrl,
      fetchedAt,
      etag: options.etag,
      lastModified: options.lastModified,
    },
    timezone: "Europe/London",
    academicYears,
  };
}

type ParsedBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "row"; cells: string[] }
  | { type: "text"; text: string };

async function collectBlocks(html: string): Promise<ParsedBlock[]> {
  const blocks: ParsedBlock[] = [];
  const tableScope = new TableScope();
  const rowCollector = new TableRowCollector((cells) => blocks.push({ type: "row", cells }));
  const cellCollector = new TableCellCollector(rowCollector);
  const headingCollector = new HeadingCollector((level, text) =>
    blocks.push({ type: "heading", level, text })
  );
  const textCollector = new TextCollector(tableScope, (text) => blocks.push({ type: "text", text }));

  await new HTMLRewriter()
    .on("table", tableScope)
    .on("h1, h2, h3, h4", headingCollector)
    .on("tr", rowCollector)
    .on("tr td, tr th", cellCollector)
    .on("p", textCollector)
    .on("li", textCollector)
    .transform(new Response(html))
    .text();

  return blocks;
}

async function parseBlocksToAcademicYears(
  blocks: ParsedBlock[],
  schoolSlug: string,
  tags: string[]
): Promise<SchoolAcademicYear[]> {
  const years: Record<string, SchoolDateItem[]> = {};
  let currentYear: string | null = null;
  let headingTerm: SchoolTerm = null;
  const usedIds = new Set<string>();
  const baseCounts = new Map<string, number>();

  for (const block of blocks) {
    if (block.type === "heading") {
      const yearLabel = parseAcademicYearLabel(block.text);
      if (yearLabel) {
        currentYear = yearLabel;
        headingTerm = null;
      }
      const headingTermCandidate = inferTerm(block.text);
      if (headingTermCandidate) {
        headingTerm = headingTermCandidate;
      }
      continue;
    }

    if (block.type === "row") {
      const parsed = parseRow(block.cells);
      if (!parsed) {
        updateContextFromText(block.cells[0] ?? "", (year) => {
          currentYear = year;
          headingTerm = null;
        });
        const candidateTerm = inferTerm(block.cells[0] ?? "");
        if (candidateTerm) {
          headingTerm = candidateTerm;
        }
        continue;
      }
      if (!currentYear) {
        continue;
      }
      const termFromLabel = inferTerm(parsed.label);
      if (termFromLabel) {
        headingTerm = termFromLabel;
      }
      const item = await buildItem(
        parsed,
        currentYear,
        headingTerm,
        usedIds,
        baseCounts,
        schoolSlug,
        tags
      );
      if (!years[currentYear]) {
        years[currentYear] = [];
      }
      years[currentYear].push(item);
      continue;
    }

    if (block.type === "text") {
      if (shouldIgnoreTextBlock(block.text)) {
        continue;
      }
      const parsed = parseInline(block.text);
      if (!parsed) {
        updateContextFromText(block.text, (year) => {
          currentYear = year;
          headingTerm = null;
        });
        const candidateTerm = inferTerm(block.text);
        if (candidateTerm) {
          headingTerm = candidateTerm;
        }
        continue;
      }
      if (!currentYear) {
        continue;
      }
      const termFromLabel = inferTerm(parsed.label);
      if (termFromLabel) {
        headingTerm = termFromLabel;
      }
      const item = await buildItem(
        parsed,
        currentYear,
        headingTerm,
        usedIds,
        baseCounts,
        schoolSlug,
        tags
      );
      if (!years[currentYear]) {
        years[currentYear] = [];
      }
      years[currentYear].push(item);
    }
  }

  return Object.entries(years).map(([label, items]) => ({
    label,
    items,
  }));
}

interface ParsedRow {
  label: string;
  dateText: string;
}

function parseRow(cells: string[]): ParsedRow | null {
  if (!cells || cells.length === 0) {
    return null;
  }
  if (cells.length >= 2) {
    const [first, ...rest] = cells;
    const label = cleanText(first);
    const dateText = cleanText(rest.join(" "));
    if (label && dateText) {
      return { label, dateText };
    }
  }
  if (cells.length === 1) {
    return parseInline(cells[0]);
  }
  return null;
}

function parseInline(text: string): ParsedRow | null {
  const trimmed = cleanText(text);
  if (!trimmed) {
    return null;
  }
  const parts = splitLabelAndDate(trimmed);
  if (parts) {
    return parts;
  }
  if (containsMonth(trimmed)) {
    return { label: trimmed, dateText: trimmed };
  }
  return null;
}

function shouldIgnoreTextBlock(text: string): boolean {
  const trimmed = cleanText(text);
  if (!trimmed) {
    return true;
  }
  const lowered = trimmed.toLowerCase();
  if (lowered.includes("staff days") && /\b20\d{2}\s*[/\-]\s*20\d{2}\b/.test(lowered)) {
    return true;
  }
  if (lowered.includes("website design by")) {
    return true;
  }
  return false;
}

function splitLabelAndDate(text: string): ParsedRow | null {
  const colonIndex = text.indexOf(":");
  if (colonIndex > 0 && colonIndex < text.length - 1) {
    const label = cleanText(text.slice(0, colonIndex));
    const dateText = cleanText(text.slice(colonIndex + 1));
    if (label && dateText) {
      return { label, dateText };
    }
  }
  const dashMatch = /\s-\s/.exec(text);
  if (dashMatch) {
    const [left, right] = text.split(/\s-\s/, 2);
    const label = cleanText(left);
    const dateText = cleanText(right);
    if (label && dateText && containsMonth(dateText)) {
      return { label, dateText };
    }
  }
  return null;
}

interface BuiltDateRange {
  startDate: string;
  endDate: string;
  startDayPart: SchoolDayPart;
  endDayPart: SchoolDayPart;
}

async function buildItem(
  row: ParsedRow,
  academicYear: string,
  headingTerm: SchoolTerm,
  usedIds: Set<string>,
  baseCounts: Map<string, number>,
  schoolSlug: string,
  tags: string[]
) {
  const termFromLabel = inferTerm(row.label);
  const term = headingTerm ?? termFromLabel ?? null;
  const type = mapTypeFromLabel(row.label);
  const dateRange = parseDateRange(row.dateText, academicYear);
  const id = await buildItemId({
    schoolSlug,
    academicYear,
    term,
    type,
    startDate: dateRange.startDate,
    label: row.label,
    existing: usedIds,
    baseCounts,
  });
  usedIds.add(id);
  const audience = type === "staff_day" ? ["staff"] : ["students"];
  const item: SchoolDateItem = {
    id,
    type,
    label: row.label,
    term,
    academicYear,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    startDayPart: dateRange.startDayPart,
    endDayPart: dateRange.endDayPart,
    notes: null,
    audience,
    tags,
    sourceText: cleanText(`${row.label} ${row.dateText}`),
  };
  return item;
}

function parseDateRange(text: string, academicYear: string): BuiltDateRange {
  const normalized = normalizeDateText(text);
  const [startRaw, endRaw] = splitDateRange(normalized);
  const yearRange = parseAcademicYearRange(academicYear);
  if (!yearRange) {
    throw new Error(`invalid_academic_year:${academicYear}`);
  }
  const start = parseSingleDate(startRaw, yearRange);
  const end = endRaw ? parseSingleDate(endRaw, yearRange, start) : start;
  if (!isValidIsoDate(start.date) || !isValidIsoDate(end.date)) {
    throw new Error(`invalid_dates:${text}`);
  }
  if (start.date > end.date) {
    throw new Error(`date_range_invalid:${text}`);
  }
  return {
    startDate: start.date,
    endDate: end.date,
    startDayPart: start.dayPart,
    endDayPart: end.dayPart,
  };
}

interface ParsedDate {
  date: string;
  dayPart: SchoolDayPart;
  month: number;
}

function parseSingleDate(
  raw: string,
  academicYear: { start: number; end: number },
  start?: ParsedDate
): ParsedDate {
  const cleaned = normalizedSingleDate(raw);
  const dayPart = extractDayPart(cleaned);
  const text = cleaned.replace(/\(a\.m\.\)|\(p\.m\.\)/gi, "").trim();
  const month = parseMonth(text);
  const day = parseDay(text);
  if (!month || !day) {
    throw new Error(`date_unparsable:${raw}`);
  }
  const year = parseYear(text) ?? inferYearFromMonth(month, academicYear, start?.month);
  const iso = formatIsoDate(year, month, day);
  return {
    date: iso,
    dayPart,
    month,
  };
}

function extractDayPart(text: string): SchoolDayPart {
  const lowered = text.toLowerCase();
  if (lowered.includes("a.m.")) {
    return "am";
  }
  if (lowered.includes("p.m.")) {
    return "pm";
  }
  return "full";
}

function normalizedSingleDate(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function splitDateRange(text: string): [string, string | null] {
  const dashParts = text.split(/\s*-\s*/);
  if (dashParts.length >= 2 && containsMonth(dashParts[0]) && containsMonth(dashParts[1])) {
    return [dashParts[0], dashParts.slice(1).join(" ").trim() || null];
  }
  const toParts = text.split(/\s+to\s+/i);
  if (toParts.length === 2 && containsMonth(toParts[0]) && containsMonth(toParts[1])) {
    return [toParts[0], toParts[1]];
  }
  return [text, null];
}

function parseMonth(text: string): number | null {
  const lowered = text.toLowerCase();
  const months: string[][] = [
    ["january", "jan"],
    ["february", "feb"],
    ["march", "mar"],
    ["april", "apr"],
    ["may"],
    ["june", "jun"],
    ["july", "jul"],
    ["august", "aug"],
    ["september", "sept", "sep"],
    ["october", "oct"],
    ["november", "nov"],
    ["december", "dec"],
  ];
  for (let i = 0; i < months.length; i += 1) {
    const aliases = months[i];
    for (const alias of aliases) {
      if (new RegExp(`\\b${alias}\\b`).test(lowered)) {
        return i + 1;
      }
    }
  }
  return null;
}

function parseDay(text: string): number | null {
  const match = /(\d{1,2})(st|nd|rd|th)?\b/.exec(text);
  if (!match) {
    return null;
  }
  const day = Number(match[1]);
  return Number.isInteger(day) ? day : null;
}

function parseYear(text: string): number | null {
  const match = /(20\d{2})/.exec(text);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  return Number.isInteger(year) ? year : null;
}

function inferYearFromMonth(
  month: number,
  academicYear: { start: number; end: number },
  startMonth?: number
): number {
  if (startMonth && month < startMonth) {
    return academicYear.end;
  }
  if (month >= 9) {
    return academicYear.start;
  }
  return academicYear.end;
}

function formatIsoDate(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  const isoYear = date.getUTCFullYear();
  const isoMonth = date.getUTCMonth() + 1;
  const isoDay = date.getUTCDate();
  return `${isoYear}-${String(isoMonth).padStart(2, "0")}-${String(isoDay).padStart(2, "0")}`;
}

function normalizeDateText(text: string): string {
  return cleanText(text)
    .replace(/[–—]/g, "-")
    .replace(/Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/gi, "")
    .replace(/\bMon\b|\bTue\b|\bTues\b|\bWed\b|\bThu\b|\bThurs\b|\bFri\b|\bSat\b|\bSun\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAcademicYearLabel(text: string): string | null {
  const normalized = cleanText(text);
  const match = /(\d{4})\s*[-/]\s*(\d{4})/.exec(normalized);
  if (!match) {
    return null;
  }
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    return null;
  }
  return `${start}-${end}`;
}

function parseAcademicYearRange(label: string): { start: number; end: number } | null {
  const match = /^(\d{4})-(\d{4})$/.exec(label);
  if (!match) {
    return null;
  }
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    return null;
  }
  return { start, end };
}

function inferTerm(text: string): SchoolTerm {
  const lowered = text.toLowerCase();
  if (lowered.includes("michaelmas")) {
    return "Michaelmas";
  }
  if (lowered.includes("lent")) {
    return "Lent";
  }
  if (lowered.includes("summer")) {
    return "Summer";
  }
  return null;
}

function mapTypeFromLabel(label: string): SchoolDateType {
  const lowered = label.toLowerCase();
  if (lowered.includes("staff day")) {
    return "staff_day";
  }
  if (lowered.includes("half term")) {
    return "holiday";
  }
  if (lowered.includes("reading week")) {
    return "reading_week";
  }
  if (lowered.includes("bank holiday")) {
    return "bank_holiday";
  }
  if (lowered.includes("entrance") && lowered.includes("exam")) {
    return "exam";
  }
  if (lowered.includes("term ends") || lowered.includes("end of term")) {
    return "term_end";
  }
  if (lowered.includes("term commences") || lowered.includes("term starts")) {
    return "term_start";
  }
  if (lowered.includes("school reopens") || lowered.includes("reopens")) {
    return "reopen";
  }
  return "info";
}

async function buildItemId(input: {
  schoolSlug: string;
  academicYear: string;
  term: SchoolTerm;
  type: SchoolDateType;
  startDate: string;
  label: string;
  existing: Set<string>;
  baseCounts: Map<string, number>;
}): Promise<string> {
  const termSlug = mapTermSlug(input.term);
  const base = `${input.schoolSlug}|${input.academicYear}|${termSlug}|${input.type}|${input.startDate}`;
  const seenCount = input.baseCounts.get(base) ?? 0;
  if (seenCount === 0 && !input.existing.has(base)) {
    input.baseCounts.set(base, 1);
    return base;
  }
  const suffix = await hashString(`${input.label}:${seenCount + 1}`);
  const candidate = `${base}|${suffix.slice(0, 8)}`;
  input.baseCounts.set(base, seenCount + 1);
  if (!input.existing.has(candidate)) {
    return candidate;
  }
  return `${candidate}-${seenCount + 1}`;
}

function mapTermSlug(term: SchoolTerm): string {
  if (term === "Michaelmas") {
    return "michaelmas";
  }
  if (term === "Lent") {
    return "lent";
  }
  if (term === "Summer") {
    return "summer";
  }
  return "other";
}

async function hashString(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  const bytes = new Uint8Array(hash);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hashAcademicYears(academicYears: SchoolAcademicYear[]): Promise<string> {
  const canonical = academicYears.map((year) => ({
    label: year.label,
    items: year.items.map((item) => ({
      id: item.id,
      type: item.type,
      label: item.label,
      term: item.term,
      academicYear: item.academicYear,
      startDate: item.startDate,
      endDate: item.endDate,
      startDayPart: item.startDayPart,
      endDayPart: item.endDayPart,
      notes: item.notes,
      audience: [...item.audience],
      tags: [...item.tags],
      sourceText: item.sourceText,
    })),
  }));
  const json = JSON.stringify(canonical);
  const hex = await hashString(json);
  return `sha256:${hex}`;
}

function normalizeAcademicYears(academicYears: SchoolAcademicYear[]): SchoolAcademicYear[] {
  return [...academicYears]
    .map((year) => ({
      label: year.label,
      items: [...year.items].sort(sortSchoolItems),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function sortSchoolItems(a: SchoolDateItem, b: SchoolDateItem): number {
  if (a.startDate !== b.startDate) {
    return a.startDate.localeCompare(b.startDate);
  }
  if (a.endDate !== b.endDate) {
    return a.endDate.localeCompare(b.endDate);
  }
  const labelDiff = a.label.localeCompare(b.label);
  if (labelDiff !== 0) {
    return labelDiff;
  }
  const typeDiff = a.type.localeCompare(b.type);
  if (typeDiff !== 0) {
    return typeDiff;
  }
  return a.id.localeCompare(b.id);
}

function summarizeDocument(doc: SchoolDatesDocument): { items: number; academicYears: number } {
  const academicYears = doc.academicYears.length;
  const items = doc.academicYears.reduce((total, year) => total + year.items.length, 0);
  return { items, academicYears };
}

function updateContextFromText(text: string, setYear: (year: string) => void) {
  const year = parseAcademicYearLabel(text);
  if (year) {
    setYear(year);
  }
}

function containsMonth(text: string): boolean {
  return parseMonth(text) !== null;
}

function cleanText(text: string): string {
  return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function log(context: RefreshContext, message: string) {
  if (context.logger) {
    context.logger(message);
  } else {
    console.log(message);
  }
}

class TableRowCollector {
  private current: string[] | null = null;
  private readonly onRow: (cells: string[]) => void;

  constructor(onRow: (cells: string[]) => void) {
    this.onRow = onRow;
  }

  element(element: Element) {
    this.current = [];
    element.onEndTag(() => {
      if (this.current && this.current.some((cell) => cleanText(cell))) {
        this.onRow(this.current.map((cell) => cleanText(cell)));
      }
      this.current = null;
    });
  }

  addCell(value: string) {
    if (this.current) {
      this.current.push(value);
    }
  }
}

class TableCellCollector {
  private buffer = "";
  private readonly rowCollector: TableRowCollector;

  constructor(rowCollector: TableRowCollector) {
    this.rowCollector = rowCollector;
  }

  element(element: Element) {
    this.buffer = "";
    element.onEndTag(() => {
      this.rowCollector.addCell(this.buffer);
      this.buffer = "";
    });
  }

  text(text: Text) {
    this.buffer += text.text;
  }
}

class HeadingCollector {
  private buffer = "";
  private readonly onHeading: (level: number, text: string) => void;

  constructor(onHeading: (level: number, text: string) => void) {
    this.onHeading = onHeading;
  }

  element(element: Element) {
    this.buffer = "";
    const level = parseInt(element.tagName.replace("h", ""), 10);
    element.onEndTag(() => {
      const text = cleanText(this.buffer);
      if (text) {
        this.onHeading(level, text);
      }
      this.buffer = "";
    });
  }

  text(text: Text) {
    this.buffer += text.text;
  }
}

class TextCollector {
  private buffer = "";
  private ignore = false;
  private readonly tableScope: TableScope;
  private readonly onText: (text: string) => void;

  constructor(tableScope: TableScope, onText: (text: string) => void) {
    this.tableScope = tableScope;
    this.onText = onText;
  }

  element(element: Element) {
    this.buffer = "";
    this.ignore = this.tableScope.isInside();
    element.onEndTag(() => {
      if (this.ignore) {
        this.buffer = "";
        return;
      }
      const text = cleanText(this.buffer);
      if (text) {
        this.onText(text);
      }
      this.buffer = "";
    });
  }

  text(text: Text) {
    this.buffer += text.text;
  }
}

class TableScope {
  private depth = 0;

  element(element: Element) {
    this.depth += 1;
    element.onEndTag(() => {
      this.depth = Math.max(0, this.depth - 1);
    });
  }

  isInside() {
    return this.depth > 0;
  }
}
