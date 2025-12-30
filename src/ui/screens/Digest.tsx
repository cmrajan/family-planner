import React from "react";
import { WeekDoc, PlannerEvent, TodoItem, BinCollectionsDoc } from "../../domain/types";
import {
  DAY_LABELS,
  TIMEZONE,
  getCurrentDayIndex,
  getWeekStartDate,
} from "../../domain/week";
import { formatServiceLabel } from "../../utils/binCollections";
import { getIsoDateInTimeZone } from "../../utils/schoolDates";

interface DigestProps {
  currentWeek: WeekDoc | null;
  nextWeek: WeekDoc | null;
  todos: TodoItem[];
  loading: boolean;
  error: string | null;
  nextWeekLoading: boolean;
  nextWeekError: string | null;
  binCollections: BinCollectionsDoc | null;
}

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIMEZONE,
  day: "numeric",
  month: "short",
});

const rangeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIMEZONE,
  day: "numeric",
  month: "short",
});

function addDays(base: Date, offset: number): Date {
  const next = new Date(base);
  next.setUTCDate(base.getUTCDate() + offset);
  return next;
}

function sortEvents(a: PlannerEvent, b: PlannerEvent) {
  if (a.order !== undefined || b.order !== undefined) {
    const ao = a.order ?? Number.MAX_SAFE_INTEGER;
    const bo = b.order ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) {
      return ao - bo;
    }
  }
  const at = a.time ?? "";
  const bt = b.time ?? "";
  if (at !== bt) {
    return at.localeCompare(bt);
  }
  return a.title.localeCompare(b.title);
}

function sortTodos(a: TodoItem, b: TodoItem) {
  if (a.order !== undefined || b.order !== undefined) {
    const ao = a.order ?? Number.MAX_SAFE_INTEGER;
    const bo = b.order ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) {
      return ao - bo;
    }
  }
  return a.title.localeCompare(b.title);
}

function getWhoLabel(event: PlannerEvent, people: WeekDoc["people"]) {
  if (event.who.length === 0 || event.who.length === people.length) {
    return "";
  }
  return event.who.join(", ");
}

export default function Digest({
  currentWeek,
  nextWeek,
  todos,
  loading,
  error,
  nextWeekLoading,
  nextWeekError,
  binCollections,
}: DigestProps) {
  if (loading) {
    return (
      <div className="screen">
        <div className="card">Loading digest...</div>
      </div>
    );
  }

  if (error || !currentWeek) {
    return (
      <div className="screen">
        <div className="card">{error ?? "Digest unavailable."}</div>
      </div>
    );
  }

  const todayIndex = getCurrentDayIndex();
  const currentWeekStart = getWeekStartDate(currentWeek.weekId);
  const nextWeekStart = nextWeek ? getWeekStartDate(nextWeek.weekId) : null;

  if (!currentWeekStart) {
    return (
      <div className="screen">
        <div className="card">Digest unavailable.</div>
      </div>
    );
  }

  const binEventsByDate = React.useMemo(() => {
    if (!binCollections) {
      return new Map<string, BinCollectionsDoc["events"]>();
    }
    const map = new Map<string, BinCollectionsDoc["events"]>();
    binCollections.events.forEach((event) => {
      const existing = map.get(event.date);
      if (existing) {
        existing.push(event);
      } else {
        map.set(event.date, [event]);
      }
    });
    return map;
  }, [binCollections]);

  const openTodos = React.useMemo(
    () => todos.filter((todo) => todo.status !== "done").sort(sortTodos),
    [todos]
  );

  const days = Array.from({ length: 7 }, (_, offset) => {
    const dayIndex = todayIndex + offset;
    const useNextWeek = dayIndex > 6;
    const targetWeek = useNextWeek ? nextWeek : currentWeek;
    const baseDate = useNextWeek ? nextWeekStart : currentWeekStart;
    const normalizedDay = useNextWeek ? dayIndex - 7 : dayIndex;
    const date = baseDate ? addDays(baseDate, normalizedDay) : null;
    const dateIso = date ? getIsoDateInTimeZone(date, TIMEZONE) : null;
    const binEvents = dateIso ? binEventsByDate.get(dateIso) ?? [] : [];
    const binLabel = binEvents.map(formatServiceLabel).join(", ");

    const events = targetWeek
      ? targetWeek.events
          .filter((event) => event.day === normalizedDay)
          .sort(sortEvents)
      : [];

    return {
      key: `${targetWeek?.weekId ?? "missing"}-${normalizedDay}`,
      label: DAY_LABELS[normalizedDay],
      date,
      events,
      binEvents,
      binLabel,
      targetWeek,
      useNextWeek,
    };
  });

  const rangeStart = days[0].date;
  const rangeEnd = days[days.length - 1].date;
  const rangeLabel =
    rangeStart && rangeEnd
      ? `${rangeFormatter.format(rangeStart)} to ${rangeFormatter.format(rangeEnd)}`
      : "";

  return (
    <div className="screen digest-screen">
      <div className="card digest-header">
        <div>
          <div className="summary-label">What&apos;s coming up</div>
          <div className="digest-range">{rangeLabel}</div>
        </div>
        <div className="muted">Next 7 days across everyone.</div>
      </div>

      {openTodos.length > 0 && (
        <div className="card">
          <h3>Anytime to-dos</h3>
          <ul className="list">
            {openTodos.slice(0, 8).map((todo) => (
              <li key={todo.id} className="list-row">
                <span className="badge badge-compact">To-do</span>
                <span className="row-title-text">{todo.title}</span>
                <span className="meta-text">({todo.owner})</span>
              </li>
            ))}
          </ul>
          {openTodos.length > 8 && (
            <div className="muted">+{openTodos.length - 8} more open to-dos.</div>
          )}
        </div>
      )}

      {days.map((day, index) => {
        const needsNextWeek = day.useNextWeek && !day.targetWeek;
        const isToday = index === 0;
        return (
          <div key={day.key} className="card digest-day">
            <div className="digest-day-header">
              <div className="digest-day-title">
                {day.label}
                {isToday && <span className="today-chip">Today</span>}
              </div>
              <div className="digest-day-date">
                {day.date ? dateFormatter.format(day.date) : ""}
              </div>
            </div>

            {needsNextWeek && (
              <div className="muted">
                {nextWeekLoading
                  ? "Loading next week..."
                  : nextWeekError ?? "Next week unavailable."}
              </div>
            )}

            {!needsNextWeek &&
              day.events.length === 0 &&
              day.binEvents.length === 0 && (
              <div className="muted">Nothing scheduled yet.</div>
            )}

            {!needsNextWeek &&
              (day.events.length > 0 || day.binEvents.length > 0) && (
              <ul className="list digest-list">
                {day.events.map((event) => {
                  const whoLabel = day.targetWeek
                    ? getWhoLabel(event, day.targetWeek.people)
                    : "";
                  return (
                    <li key={event.id} className="list-row">
                      <span className="row-time">
                        {event.time ? event.time : "All day"}
                      </span>
                      <span className="row-title-text">{event.title}</span>
                      {event.location && (
                        <span className="meta-text">@ {event.location}</span>
                      )}
                      {whoLabel && (
                        <span className="meta-text">({whoLabel})</span>
                      )}
                    </li>
                  );
                })}
                {day.binEvents.length > 0 && (
                  <li key={`${day.key}-bins`} className="list-row">
                    <span className="badge badge-compact">Bins</span>
                    <span className="row-title-text">{day.binLabel}</span>
                  </li>
                )}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
