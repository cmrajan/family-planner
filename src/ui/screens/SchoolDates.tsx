import React from "react";
import { SchoolDatesDocument, SchoolDateItem } from "../../domain/types";
import {
  SCHOOL_TYPE_LABELS,
  formatDateRange,
  formatDayPart,
  getAcademicYearLabel,
  getUpcomingItems,
  sortByStartDate,
} from "../../utils/schoolDates";

export type SchoolDatesRefreshNotice = { message: string; tone: "info" | "error" };

interface SchoolDatesProps {
  data: SchoolDatesDocument | null;
  loading: boolean;
  error: string | null;
  overlayEnabled: boolean;
  onOverlayChange: (next: boolean) => void;
  refreshing: boolean;
  refreshNotice: SchoolDatesRefreshNotice | null;
  onRefresh: () => void;
}

function getDefaultYear(doc: SchoolDatesDocument): string {
  const current = getAcademicYearLabel();
  const available = doc.academicYears.map((year) => year.label);
  return available.includes(current) ? current : doc.academicYears[0]?.label ?? "";
}

function formatItemDate(item: SchoolDateItem): string {
  const range = formatDateRange(item.startDate, item.endDate);
  if (item.startDate === item.endDate) {
    const part = formatDayPart(item.startDayPart);
    return part ? `${range} (${part})` : range;
  }
  return range;
}

const TERM_ORDER = ["Michaelmas", "Lent", "Summer", "Other"] as const;

type TermGroup = (typeof TERM_ORDER)[number];

function groupByTerm(items: SchoolDateItem[]): Record<TermGroup, SchoolDateItem[]> {
  const groups: Record<TermGroup, SchoolDateItem[]> = {
    Michaelmas: [],
    Lent: [],
    Summer: [],
    Other: [],
  };
  items.forEach((item) => {
    const term = item.term ?? "Other";
    if (term === "Michaelmas" || term === "Lent" || term === "Summer") {
      groups[term].push(item);
    } else {
      groups.Other.push(item);
    }
  });
  return groups;
}

function formatUpdatedLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function SchoolDates({
  data,
  loading,
  error,
  overlayEnabled,
  onOverlayChange,
  refreshing,
  refreshNotice,
  onRefresh,
}: SchoolDatesProps) {
  const [selectedYear, setSelectedYear] = React.useState<string>("");

  React.useEffect(() => {
    if (!data) {
      return;
    }
    const nextDefault = getDefaultYear(data);
    setSelectedYear((prev) => (prev && prev !== nextDefault ? prev : nextDefault));
  }, [data]);

  if (loading) {
    return (
      <div className="screen">
        <div className="card">
          <h3>School dates</h3>
          <div className="muted">Loading school dates...</div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="screen">
        <div className="card">
          <div className="row">
            <h3>School dates</h3>
            <button className="btn btn-ghost" disabled={refreshing} onClick={onRefresh}>
              {refreshing ? "Refreshing..." : "Refresh now"}
            </button>
          </div>
          <div className="muted">{error ?? "School dates unavailable."}</div>
          {refreshNotice ? (
            <div className={refreshNotice.tone === "error" ? "field-error" : "meta-text"}>
              {refreshNotice.message}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const upcoming = getUpcomingItems(data, 90);
  const yearItems =
    data.academicYears.find((year) => year.label === selectedYear)?.items ?? [];
  const grouped = groupByTerm([...yearItems].sort(sortByStartDate));
  const lastUpdated = formatUpdatedLabel(data.source.fetchedAt);

  return (
    <div className="screen">
      <div className="card">
        <div className="row">
          <h3>School dates</h3>
          <button className="btn btn-ghost" disabled={refreshing} onClick={onRefresh}>
            {refreshing ? "Refreshing..." : "Refresh now"}
          </button>
        </div>
        <div className="meta-text">Last updated: {lastUpdated}</div>
        {refreshNotice ? (
          <div className={refreshNotice.tone === "error" ? "field-error" : "meta-text"}>
            {refreshNotice.message}
          </div>
        ) : null}
        <div className="form">
          <label className="field-row">
            <span className="summary-label">School</span>
            <select value={data.source.slug} disabled>
              <option value={data.source.slug}>{data.source.name}</option>
            </select>
          </label>
          <label className="field-row">
            <span className="summary-label">Academic year</span>
            <select
              value={selectedYear}
              onChange={(event) => setSelectedYear(event.target.value)}
            >
              {data.academicYears.map((year) => (
                <option key={year.label} value={year.label}>
                  {year.label}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={overlayEnabled}
              onChange={(event) => onOverlayChange(event.target.checked)}
            />
            Overlay on calendar
          </label>
        </div>
      </div>

      <div className="card">
        <h3>Upcoming</h3>
        {upcoming.length === 0 ? (
          <div className="muted">No upcoming school dates.</div>
        ) : (
          <ul className="list">
            {upcoming.map((item) => (
              <li key={item.id} className="school-item">
                <div className="school-item-row">
                  <span className="row-title-text">{item.label}</span>
                  <span className="badge">{SCHOOL_TYPE_LABELS[item.type]}</span>
                </div>
                <div className="meta-text">{formatItemDate(item)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h3>Full year</h3>
        {TERM_ORDER.map((term) => {
          const items = grouped[term];
          if (items.length === 0) {
            return null;
          }
          return (
            <div key={term} className="school-term">
              <div className="summary-label">{term}</div>
              <ul className="list">
                {items.map((item) => (
                  <li key={item.id} className="school-item">
                    <div className="school-item-row">
                      <span className="row-title-text">{item.label}</span>
                      <span className="badge">{SCHOOL_TYPE_LABELS[item.type]}</span>
                    </div>
                    <div className="meta-text">{formatItemDate(item)}</div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
