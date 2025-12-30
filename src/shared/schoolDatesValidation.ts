import {
  SchoolAcademicYear,
  SchoolDateItem,
  SchoolDateType,
  SchoolDayPart,
  SchoolDatesDocument,
  SchoolTerm,
} from "../domain/types";

export const SCHOOL_DATE_TYPES: SchoolDateType[] = [
  "term_start",
  "term_end",
  "holiday",
  "reading_week",
  "staff_day",
  "bank_holiday",
  "exam",
  "reopen",
  "info",
];

export const SCHOOL_DAY_PARTS: SchoolDayPart[] = ["full", "am", "pm"];

export const SCHOOL_TERMS: SchoolTerm[] = ["Michaelmas", "Lent", "Summer", null];

export function schoolDatesKey(schoolSlug: string): string {
  return `school_dates:v1:${schoolSlug}:latest`;
}

export function validateSchoolDatesDocument(doc: SchoolDatesDocument): string[] {
  const errors: string[] = [];
  if (doc.schemaVersion !== 1) {
    errors.push("schema_version_invalid");
  }
  if (!doc.source || typeof doc.source !== "object") {
    errors.push("source_invalid");
  } else {
    if (!doc.source.name || typeof doc.source.name !== "string") {
      errors.push("source_name_invalid");
    }
    if (!doc.source.slug || typeof doc.source.slug !== "string") {
      errors.push("source_slug_invalid");
    }
    if (!doc.source.url || typeof doc.source.url !== "string") {
      errors.push("source_url_invalid");
    }
    if (!doc.source.fetchedAt || typeof doc.source.fetchedAt !== "string") {
      errors.push("source_fetched_invalid");
    }
  }
  if (doc.timezone !== "Europe/London") {
    errors.push("timezone_invalid");
  }
  if (!Array.isArray(doc.academicYears) || doc.academicYears.length === 0) {
    errors.push("academic_years_invalid");
  } else {
    doc.academicYears.forEach((year) => {
      errors.push(...validateAcademicYear(year));
    });
  }
  return errors;
}

export function validateAcademicYear(year: SchoolAcademicYear): string[] {
  const errors: string[] = [];
  if (!year.label || typeof year.label !== "string") {
    errors.push("academic_year_label_invalid");
  }
  if (!Array.isArray(year.items)) {
    errors.push("academic_year_items_invalid");
  } else {
    year.items.forEach((item) => {
      errors.push(...validateSchoolDateItem(item, year.label));
    });
  }
  return errors;
}

export function validateSchoolDateItem(
  item: SchoolDateItem,
  yearLabel: string
): string[] {
  const errors: string[] = [];
  if (!item.id || typeof item.id !== "string") {
    errors.push("item_id_invalid");
  }
  if (!SCHOOL_DATE_TYPES.includes(item.type)) {
    errors.push("item_type_invalid");
  }
  if (!item.label || typeof item.label !== "string") {
    errors.push("item_label_invalid");
  }
  if (!SCHOOL_TERMS.includes(item.term)) {
    errors.push("item_term_invalid");
  }
  if (item.academicYear !== yearLabel) {
    errors.push("item_year_mismatch");
  }
  if (!isValidIsoDate(item.startDate) || !isValidIsoDate(item.endDate)) {
    errors.push("item_date_invalid");
  } else if (item.startDate > item.endDate) {
    errors.push("item_date_range_invalid");
  }
  if (!SCHOOL_DAY_PARTS.includes(item.startDayPart)) {
    errors.push("item_start_day_part_invalid");
  }
  if (!SCHOOL_DAY_PARTS.includes(item.endDayPart)) {
    errors.push("item_end_day_part_invalid");
  }
  if (item.notes !== null && typeof item.notes !== "string") {
    errors.push("item_notes_invalid");
  }
  if (!Array.isArray(item.audience) || item.audience.some((value) => typeof value !== "string")) {
    errors.push("item_audience_invalid");
  }
  if (!Array.isArray(item.tags) || item.tags.some((value) => typeof value !== "string")) {
    errors.push("item_tags_invalid");
  }
  if (!item.sourceText || typeof item.sourceText !== "string") {
    errors.push("item_source_text_invalid");
  }
  return errors;
}

export function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
