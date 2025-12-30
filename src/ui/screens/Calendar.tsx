import React from "react";
import { fetchWeek, putWeek } from "../../api/client";
import {
  WeekDoc,
  PlannerEvent,
  PersonId,
  EventTag,
  SchoolDatesDocument,
  BinCollectionsDoc,
} from "../../domain/types";
import {
  DAY_LABELS,
  TIMEZONE,
  getCurrentDayIndex,
  getCurrentWeekId,
  getWeekStartDate,
  shiftWeekId,
} from "../../domain/week";
import { cloneDeep } from "../../utils/clone";
import { debounce } from "../../utils/debounce";
import { createId } from "../../utils/id";
import { normalizeTimeInput } from "../../utils/time";
import { parseQuickEventInput } from "../../utils/quickEvent";
import {
  SCHOOL_TYPE_LABELS,
  flattenSchoolItems,
  getIsoDateInTimeZone,
  intersectsRange,
  sortByStartDate,
} from "../../utils/schoolDates";
import { formatServiceLabel } from "../../utils/binCollections";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { getPersonColor, getTagColor } from "../utils/meta";

interface CalendarProps {
  currentWeek: WeekDoc;
  currentReadOnly: boolean;
  viewOnly: boolean;
  me: PersonId;
  schoolDates: SchoolDatesDocument | null;
  schoolOverlayEnabled: boolean;
  binCollections: BinCollectionsDoc | null;
  binOverlayEnabled: boolean;
  onWeekOverride: (next: WeekDoc) => void;
  onCurrentReadOnly: (readOnly: boolean) => void;
}

interface CalendarWeekEntry {
  week: WeekDoc;
  readOnly: boolean;
}

const TAGS: EventTag[] = ["school", "sport", "family", "work", "other", "recurring"];
const WINDOW_WEEKS = 6;

function sortEventsForDay(events: PlannerEvent[]) {
  const hasOrder = events.some((event) => Number.isInteger(event.order));
  return [...events].sort((a, b) => {
    if (hasOrder) {
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
  });
}

function buildWeekWindow(anchorWeekId: string, count: number): string[] {
  const ids: string[] = [];
  let cursor = anchorWeekId;
  for (let i = 0; i < count; i += 1) {
    ids.push(cursor);
    cursor = shiftWeekId(cursor, 1);
  }
  return ids;
}

function getNextEventOrder(doc: WeekDoc, day: number): number {
  const orders = doc.events
    .filter((event) => event.day === day && Number.isInteger(event.order))
    .map((event) => event.order as number);
  return orders.length > 0 ? Math.max(...orders) + 1 : 0;
}

const emptyEvent = (
  day = 0,
  people: PersonId[],
  who: PersonId[],
  time = ""
): PlannerEvent => ({
  id: "",
  day,
  time,
  title: "",
  location: "",
  who: who.length > 0 ? [...who] : [...people],
  tag: "family",
});

export default function Calendar({
  currentWeek,
  currentReadOnly,
  viewOnly,
  me,
  schoolDates,
  schoolOverlayEnabled,
  binCollections,
  binOverlayEnabled,
  onWeekOverride,
  onCurrentReadOnly,
}: CalendarProps) {
  const initialIsMobile =
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 699px)").matches;
  const [isMobile, setIsMobile] = React.useState(() => initialIsMobile);
  const [viewMode, setViewMode] = React.useState<"week" | "month">(() =>
    initialIsMobile ? "week" : "month"
  );
  const [anchorWeekId, setAnchorWeekId] = React.useState(currentWeek.weekId);
  const [anchorLocked, setAnchorLocked] = React.useState(false);
  const [weeksById, setWeeksById] = React.useState<Record<string, CalendarWeekEntry>>(
    () => ({
      [currentWeek.weekId]: {
        week: currentWeek,
        readOnly: currentReadOnly,
      },
    })
  );
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState("");
  const [conflicts, setConflicts] = React.useState<Record<string, boolean>>({});
  const [saveErrors, setSaveErrors] = React.useState<Record<string, string>>({});
  const [activeDay, setActiveDay] = React.useState<{
    weekId: string;
    day: number;
  } | null>(null);
  const [editing, setEditing] = React.useState<PlannerEvent | null>(null);
  const [editingWeekId, setEditingWeekId] = React.useState<string | null>(null);
  const [timeError, setTimeError] = React.useState("");
  const [quickDraft, setQuickDraft] = React.useState({
    title: "",
    time: "",
    error: "",
  });
  const [lastWho, setLastWho] = React.useState<PersonId[]>([me]);
  const todayWeekId = getCurrentWeekId();
  const todayDayIndex = getCurrentDayIndex();
  const isWeekView = isMobile && viewMode === "week";
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const schoolItems = React.useMemo(() => {
    if (!schoolOverlayEnabled || !schoolDates) {
      return [];
    }
    return flattenSchoolItems(schoolDates).sort(sortByStartDate);
  }, [schoolDates, schoolOverlayEnabled]);

  const binEventsByDate = React.useMemo(() => {
    if (!binOverlayEnabled || !binCollections) {
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
  }, [binCollections, binOverlayEnabled]);

  const weekIds = React.useMemo(
    () => buildWeekWindow(anchorWeekId, WINDOW_WEEKS),
    [anchorWeekId]
  );

  const dayFormatter = React.useMemo(
    () => new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, day: "numeric" }),
    []
  );
  const monthFormatter = React.useMemo(
    () => new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, month: "short" }),
    []
  );
  const fullDateFormatter = React.useMemo(
    () =>
      new Intl.DateTimeFormat("en-GB", {
        timeZone: TIMEZONE,
        weekday: "short",
        day: "numeric",
        month: "short",
      }),
    []
  );

  const saveHandlers = React.useRef<Record<string, (doc: WeekDoc) => void>>({});
  const lastSaveAttempt = React.useRef<Record<string, WeekDoc | undefined>>({});

  const formatSaveError = React.useCallback((error: {
    code?: string;
    message?: string;
  }) => {
    const message = error.message ?? "Save failed.";
    if (error.code) {
      return `${error.code}: ${message}`;
    }
    return message;
  }, []);

  const saveWeek = React.useCallback(
    (doc: WeekDoc) => {
      lastSaveAttempt.current[doc.weekId] = doc;
      putWeek(doc)
        .then((updated) => {
          setWeeksById((prev) => {
            const entry = prev[doc.weekId];
            if (!entry || entry.week.version !== doc.version) {
              return prev;
            }
            const nextWeek = {
              ...entry.week,
              version: updated.version,
              updatedAt: updated.updatedAt,
            };
            if (doc.weekId === currentWeek.weekId) {
              onWeekOverride(nextWeek);
            }
            return {
              ...prev,
              [doc.weekId]: {
                ...entry,
                week: nextWeek,
              },
            };
          });
          setConflicts((prev) => {
            if (!prev[doc.weekId]) {
              return prev;
            }
            const next = { ...prev };
            delete next[doc.weekId];
            return next;
          });
          setSaveErrors((prev) => {
            if (!prev[doc.weekId]) {
              return prev;
            }
            const next = { ...prev };
            delete next[doc.weekId];
            return next;
          });
        })
        .catch((error: { status?: number; code?: string; message?: string }) => {
          if (error.status === 409 || error.code === "VERSION_CONFLICT") {
            setConflicts((prev) => ({ ...prev, [doc.weekId]: true }));
            return;
          }
          if (error.status === 403 || error.code === "ARCHIVED_READONLY") {
            setWeeksById((prev) => {
              const entry = prev[doc.weekId];
              if (!entry) {
                return prev;
              }
              return {
                ...prev,
                [doc.weekId]: {
                  ...entry,
                  readOnly: true,
                },
              };
            });
            if (doc.weekId === currentWeek.weekId) {
              onCurrentReadOnly(true);
            }
            return;
          }
          setSaveErrors((prev) => ({
            ...prev,
            [doc.weekId]: formatSaveError(error),
          }));
        });
    },
    [currentWeek.weekId, formatSaveError, onCurrentReadOnly, onWeekOverride]
  );

  const retrySave = React.useCallback(
    (weekId: string) => {
      const doc = lastSaveAttempt.current[weekId];
      if (!doc) {
        return;
      }
      saveWeek(doc);
    },
    [saveWeek]
  );

  React.useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 699px)");
    const update = () => {
      setIsMobile(mediaQuery.matches);
    };
    update();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", update);
    } else if (typeof mediaQuery.addListener === "function") {
      mediaQuery.addListener(update);
    }
    return () => {
      if (typeof mediaQuery.removeEventListener === "function") {
        mediaQuery.removeEventListener("change", update);
      } else if (typeof mediaQuery.removeListener === "function") {
        mediaQuery.removeListener(update);
      }
    };
  }, []);

  React.useEffect(() => {
    setViewMode(isMobile ? "week" : "month");
  }, [isMobile]);

  React.useEffect(() => {
    if (!isWeekView) {
      return;
    }
    const target = currentWeek.weekId;
    const id = window.requestAnimationFrame(() => {
      const container = scrollRef.current;
      const targetEl = container?.querySelector(`[data-week-id="${target}"]`);
      if (targetEl instanceof HTMLElement) {
        targetEl.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
      }
    });
    return () => {
      window.cancelAnimationFrame(id);
    };
  }, [currentWeek.weekId, isWeekView, weekIds.length]);

  React.useEffect(() => {
    setWeeksById((prev) => ({
      ...prev,
      [currentWeek.weekId]: {
        week: currentWeek,
        readOnly: currentReadOnly,
      },
    }));
    if (!anchorLocked) {
      setAnchorWeekId(currentWeek.weekId);
    }
  }, [currentReadOnly, currentWeek, anchorLocked]);

  React.useEffect(() => {
    setLastWho((prev) => {
      const filtered = prev.filter((person) => currentWeek.people.includes(person));
      if (filtered.length > 0) {
        return filtered;
      }
      return [me];
    });
  }, [currentWeek.people, me]);

  React.useEffect(() => {
    let active = true;
    const missing = weekIds.filter((weekId) => !weeksById[weekId]);
    if (missing.length === 0) {
      return () => {
        active = false;
      };
    }
    setLoading(true);
    setLoadError("");
    Promise.all(
      missing.map(async (weekId) => {
        try {
          const payload = await fetchWeek(weekId);
          return { weekId, payload, ok: true as const };
        } catch {
          return { weekId, ok: false as const };
        }
      })
    )
      .then((results) => {
        if (!active) {
          return;
        }
        const failures = results.filter((result) => !result.ok).map((r) => r.weekId);
        if (failures.length > 0) {
          setLoadError(`Unable to load: ${failures.join(", ")}.`);
        }
        const updates: Record<string, CalendarWeekEntry> = {};
        results.forEach((result) => {
          if (result.ok) {
            updates[result.weekId] = {
              week: result.payload.week,
              readOnly: result.payload.readOnly,
            };
          }
        });
        if (Object.keys(updates).length > 0) {
          setWeeksById((prev) => ({ ...prev, ...updates }));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [weekIds, weeksById]);

  React.useEffect(() => {
    if (!activeDay) {
      return;
    }
    if (!weekIds.includes(activeDay.weekId)) {
      setActiveDay(null);
      setEditing(null);
      setEditingWeekId(null);
    }
  }, [activeDay, weekIds]);

  const getDebouncedSave = React.useCallback(
    (weekId: string) => {
      if (!saveHandlers.current[weekId]) {
        saveHandlers.current[weekId] = debounce((doc: WeekDoc) => {
          saveWeek(doc);
        }, 800);
      }
      return saveHandlers.current[weekId];
    },
    [saveWeek]
  );

  const updateWeek = React.useCallback(
    (weekId: string, mutator: (draft: WeekDoc) => void) => {
      if (viewOnly) {
        return;
      }
      setWeeksById((prev) => {
        const entry = prev[weekId];
        if (!entry || entry.readOnly) {
          return prev;
        }
        const nextWeek = cloneDeep(entry.week);
        mutator(nextWeek);
        getDebouncedSave(weekId)(nextWeek);
        if (weekId === currentWeek.weekId) {
          onWeekOverride(nextWeek);
        }
        return {
          ...prev,
          [weekId]: {
            ...entry,
            week: nextWeek,
          },
        };
      });
    },
    [currentWeek.weekId, getDebouncedSave, onWeekOverride, viewOnly]
  );

  const reloadWeek = React.useCallback(
    (weekId: string) => {
      fetchWeek(weekId)
        .then((payload) => {
          setWeeksById((prev) => ({
            ...prev,
            [weekId]: {
              week: payload.week,
              readOnly: payload.readOnly,
            },
          }));
          if (weekId === currentWeek.weekId) {
            onWeekOverride(payload.week);
            onCurrentReadOnly(payload.readOnly);
          }
          setConflicts((prev) => {
            if (!prev[weekId]) {
              return prev;
            }
            const next = { ...prev };
            delete next[weekId];
            return next;
          });
        })
        .catch(() => null);
    },
    [currentWeek.weekId, onWeekOverride]
  );

  const startAdd = (weekId: string, day: number, people: PersonId[]) => {
    if (viewOnly) {
      return;
    }
    setEditing(emptyEvent(day, people, lastWho, ""));
    setEditingWeekId(weekId);
    setTimeError("");
  };

  const startEdit = (weekId: string, event: PlannerEvent) => {
    if (viewOnly) {
      return;
    }
    setEditing({ ...event, who: [...event.who] });
    setEditingWeekId(weekId);
    setTimeError("");
  };

  const saveEvent = () => {
    if (!editing || !editingWeekId) {
      return;
    }
    const normalizedTime = normalizeTimeInput(editing.time ?? "");
    if (normalizedTime === null) {
      setTimeError("Use HH:MM, e.g. 07:30.");
      return;
    }
    const trimmedLocation = editing.location?.trim();
    const eventToSave: PlannerEvent = {
      ...editing,
      id: editing.id || createId(),
      title: editing.title.trim(),
      time: normalizedTime || undefined,
      location: trimmedLocation ? trimmedLocation : undefined,
      who: editing.who,
      tag: editing.tag || undefined,
    };
    updateWeek(editingWeekId, (draft) => {
      const existing = draft.events.find((event) => event.id === eventToSave.id);
      if (existing && existing.day !== eventToSave.day) {
        eventToSave.order = undefined;
      }
      const index = draft.events.findIndex((evt) => evt.id === eventToSave.id);
      if (index >= 0) {
        draft.events[index] = eventToSave;
      } else {
        draft.events.push(eventToSave);
      }
    });
    setLastWho(eventToSave.who);
    setEditing(null);
    setEditingWeekId(null);
    setTimeError("");
  };

  const deleteEvent = (weekId: string, eventId: string) => {
    updateWeek(weekId, (draft) => {
      draft.events = draft.events.filter((event) => event.id !== eventId);
    });
  };

  const toggleQuickWho = (person: PersonId) => {
    setLastWho((prev) => {
      if (prev.includes(person)) {
        return prev.filter((id) => id !== person);
      }
      return [...prev, person];
    });
  };

  const saveQuickEvent = (weekId: string, day: number) => {
    if (viewOnly) {
      return;
    }
    const parsed = parseQuickEventInput(quickDraft.title);
    const title = parsed.title.trim();
    if (!title) {
      return;
    }
    let time = parsed.time;
    if (quickDraft.time.trim()) {
      const normalized = normalizeTimeInput(quickDraft.time);
      if (normalized === null) {
        setQuickDraft((prev) => ({ ...prev, error: "Use HH:MM, e.g. 07:30." }));
        return;
      }
      time = normalized;
    }
    updateWeek(weekId, (draftWeek) => {
      draftWeek.events.push({
        id: createId(),
        day,
        time: time || undefined,
        title,
        location: parsed.location || undefined,
        who: lastWho,
        tag: "family",
        order: getNextEventOrder(draftWeek, day),
      });
    });
    setQuickDraft({ title: "", time: "", error: "" });
  };

  const activeEntry = activeDay ? weeksById[activeDay.weekId] : null;
  const activeWeek = activeEntry?.week ?? null;
  const activeReadOnly = viewOnly || activeEntry?.readOnly;
  const activeWeekStart = activeDay ? getWeekStartDate(activeDay.weekId) : null;
  const activeDate =
    activeDay && activeWeekStart
      ? new Date(
          Date.UTC(
            activeWeekStart.getUTCFullYear(),
            activeWeekStart.getUTCMonth(),
            activeWeekStart.getUTCDate() + activeDay.day
          )
        )
      : null;
  const activeLabel = activeDate ? fullDateFormatter.format(activeDate) : "";
  const activeSaveError = activeDay ? saveErrors[activeDay.weekId] : "";

  return (
    <div className="screen">
      <div className="calendar-toolbar">
        <div>
          <h2>Calendar</h2>
          <div className="muted">
            {isMobile
              ? viewMode === "week"
                ? "Swipe for weeks, scroll for time."
                : "Full 6-week grid."
              : `Rolling ${WINDOW_WEEKS}-week view.`}
          </div>
        </div>
        <div className="calendar-actions">
          {isMobile && (
            <div className="calendar-view-toggle">
              <Button
                variant={viewMode === "week" ? "primary" : "ghost"}
                onClick={() => setViewMode("week")}
              >
                Week
              </Button>
              <Button
                variant={viewMode === "month" ? "primary" : "ghost"}
                onClick={() => setViewMode("month")}
              >
                Month
              </Button>
            </div>
          )}
          <Button
            variant="ghost"
            onClick={() => {
              setAnchorLocked(true);
              setAnchorWeekId((prev) => shiftWeekId(prev, -WINDOW_WEEKS));
            }}
          >
            Earlier
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setAnchorLocked(false);
              setAnchorWeekId(currentWeek.weekId);
            }}
          >
            Current
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setAnchorLocked(true);
              setAnchorWeekId((prev) => shiftWeekId(prev, WINDOW_WEEKS));
            }}
          >
            Later
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="card">
          <div className="muted">{loadError}</div>
        </div>
      )}
      {loading && (
        <div className="card">
          <div className="muted">Loading calendar weeks...</div>
        </div>
      )}

      <div
        className={`calendar-scroll${isWeekView ? " calendar-scroll-week" : ""}`}
        ref={scrollRef}
      >
        {!isWeekView && (
          <div className="calendar-grid calendar-grid-labels">
            {DAY_LABELS.map((label) => (
              <div key={label} className="calendar-label">
                {label}
              </div>
            ))}
          </div>
        )}

        {weekIds.map((weekId) => {
          const entry = weeksById[weekId];
          const weekStart = getWeekStartDate(weekId);
          const weekEnd =
            weekStart &&
            new Date(
              Date.UTC(
                weekStart.getUTCFullYear(),
                weekStart.getUTCMonth(),
                weekStart.getUTCDate() + 6
              )
            );
          const weekRange =
            weekStart && weekEnd
              ? `${dayFormatter.format(weekStart)} ${monthFormatter.format(
                  weekStart
                )} – ${dayFormatter.format(weekEnd)} ${monthFormatter.format(weekEnd)}`
              : "";
          const weekReadOnly = viewOnly || entry?.readOnly;
          const isCurrentWeek = weekId === todayWeekId;

          return (
            <div
              key={weekId}
              className={`calendar-week${isCurrentWeek ? " is-current-week" : ""}`}
              data-week-id={weekId}
            >
              <div className="calendar-week-header">
                <div className="calendar-week-id">Week {weekId}</div>
                {weekRange && <div className="calendar-week-range">{weekRange}</div>}
                {entry?.readOnly && <div className="muted">Archived</div>}
              </div>
              {isWeekView && (
                <div className="calendar-grid calendar-grid-labels calendar-grid-week-labels">
                  {DAY_LABELS.map((label) => (
                    <div key={`${weekId}-${label}`} className="calendar-label">
                      {label}
                    </div>
                  ))}
                </div>
              )}
              <div className="calendar-grid">
                {DAY_LABELS.map((label, day) => {
                  const date =
                    weekStart &&
                    new Date(
                      Date.UTC(
                        weekStart.getUTCFullYear(),
                        weekStart.getUTCMonth(),
                        weekStart.getUTCDate() + day
                      )
                    );
                  const dayNumber = date ? dayFormatter.format(date) : "";
                  const monthLabel = date ? monthFormatter.format(date) : "";
                  const showMonth = dayNumber === "1" || day === 0;
                  const events = entry
                    ? sortEventsForDay(entry.week.events.filter((event) => event.day === day))
                    : [];
                  const preview = events.slice(0, 3);
                  const remaining = events.length - preview.length;
                  const isToday = weekId === todayWeekId && day === todayDayIndex;
                  const schoolDateIso =
                    date && schoolDates
                      ? getIsoDateInTimeZone(date, schoolDates.timezone)
                      : null;
                  const schoolDayItems =
                    schoolDateIso && schoolItems.length > 0
                      ? schoolItems.filter((item) =>
                          intersectsRange(item, schoolDateIso, schoolDateIso)
                        )
                      : [];
                  const schoolPreview = schoolDayItems.slice(0, 2);
                  const schoolRemaining = schoolDayItems.length - schoolPreview.length;
                  const binDateIso = date ? getIsoDateInTimeZone(date, TIMEZONE) : null;
                  const binDayItems = binDateIso
                    ? binEventsByDate.get(binDateIso) ?? []
                    : [];
                  const binPreview = binDayItems.slice(0, 2);
                  const binRemaining = binDayItems.length - binPreview.length;

                  return (
                    <button
                      key={`${weekId}-${label}`}
                      className={`calendar-day${
                        isToday ? " is-today" : ""
                      }${weekReadOnly ? " is-readonly" : ""}`}
                      type="button"
                      onClick={() => {
                        if (!entry) {
                          return;
                        }
                        setActiveDay({ weekId, day });
                        setEditing(null);
                        setEditingWeekId(null);
                        setTimeError("");
                        setQuickDraft({ title: "", time: "", error: "" });
                      }}
                    >
                      <div className="calendar-day-header">
                        <span className="calendar-day-number">{dayNumber}</span>
                        {showMonth && (
                          <span className="calendar-day-month">{monthLabel}</span>
                        )}
                      </div>
                      <div className="calendar-day-events">
                        {!entry && <div className="muted">Loading...</div>}
                        {entry && preview.length === 0 && (
                          <div className="calendar-empty">—</div>
                        )}
                        {preview.map((event) => (
                          <div key={event.id} className="calendar-event">
                            <span className="calendar-event-time">
                              {event.time ? event.time : "All day"}
                            </span>
                            <span className="calendar-event-title">{event.title}</span>
                          </div>
                        ))}
                        {remaining > 0 && (
                          <div className="calendar-more">+{remaining} more</div>
                        )}
                        {schoolOverlayEnabled && schoolPreview.length > 0 && (
                          <div className="calendar-school">
                            {schoolPreview.map((item) => (
                              <div key={item.id} className="calendar-school-item">
                                <span className="badge badge-compact">
                                  {SCHOOL_TYPE_LABELS[item.type]}
                                </span>
                                <span className="calendar-school-title">
                                  {item.label}
                                </span>
                              </div>
                            ))}
                            {schoolRemaining > 0 && (
                              <div className="calendar-more">
                                +{schoolRemaining} more school
                              </div>
                            )}
                          </div>
                        )}
                        {binOverlayEnabled && binPreview.length > 0 && (
                          <div className="calendar-bins">
                            {binPreview.map((event, index) => (
                              <div
                                key={`${event.serviceId}-${event.date}-${index}`}
                                className="calendar-bin-item"
                              >
                                <span className="badge badge-compact">Bins</span>
                                <span className="calendar-bin-title">
                                  {formatServiceLabel(event)}
                                </span>
                              </div>
                            ))}
                            {binRemaining > 0 && (
                              <div className="calendar-more">
                                +{binRemaining} more bins
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        title={editing ? (editing.id ? "Edit event" : "Add event") : activeLabel}
        open={!!activeDay}
        onClose={() => {
          setActiveDay(null);
          setEditing(null);
          setEditingWeekId(null);
          setTimeError("");
        }}
      >
        {activeSaveError && activeDay && (
          <div className="banner">
            Save failed: {activeSaveError}{" "}
            <button className="link" onClick={() => retrySave(activeDay.weekId)}>
              Retry save
            </button>
            .
          </div>
        )}
        {!activeDay || !activeWeek ? (
          <div className="muted">Loading day...</div>
        ) : editing ? (
          <form
            className="form"
            onSubmit={(event) => {
              event.preventDefault();
              saveEvent();
            }}
          >
            <label>
              Day
              <select
                value={editing.day}
                onChange={(event) =>
                  setEditing({ ...editing, day: Number(event.target.value) })
                }
              >
                {DAY_LABELS.map((label, idx) => (
                  <option key={label} value={idx}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Time
              <input
                type="text"
                inputMode="numeric"
                placeholder="HH:MM or 7"
                value={editing.time ?? ""}
                onChange={(event) => {
                  setEditing({ ...editing, time: event.target.value });
                  setTimeError("");
                }}
                onBlur={(event) => {
                  const normalized = normalizeTimeInput(event.target.value);
                  if (normalized === null) {
                    setTimeError("Use HH:MM, e.g. 07:30.");
                    return;
                  }
                  setEditing({ ...editing, time: normalized });
                }}
                disabled={activeReadOnly}
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={!editing.time}
                onChange={(event) => {
                  if (event.target.checked) {
                    setEditing({ ...editing, time: "" });
                    setTimeError("");
                  }
                }}
                disabled={activeReadOnly}
              />
              All day
            </label>
            {timeError && <div className="field-error">{timeError}</div>}
            <label>
              Title
              <input
                type="text"
                value={editing.title}
                onChange={(event) =>
                  setEditing({ ...editing, title: event.target.value })
                }
                disabled={activeReadOnly}
              />
            </label>
            <label>
              Location
              <input
                type="text"
                placeholder="Optional"
                value={editing.location ?? ""}
                onChange={(event) =>
                  setEditing({ ...editing, location: event.target.value })
                }
                disabled={activeReadOnly}
              />
            </label>
            <fieldset className="fieldset">
              <legend>Who</legend>
              {activeWeek.people.map((person) => (
                <label key={person} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={editing.who.includes(person)}
                    onChange={(event) => {
                      const next = event.target.checked
                        ? [...editing.who, person]
                        : editing.who.filter((id) => id !== person);
                      setEditing({ ...editing, who: next });
                    }}
                    disabled={activeReadOnly}
                  />
                  {person}
                </label>
              ))}
            </fieldset>
            <label>
              Tag
              <select
                value={editing.tag ?? ""}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    tag: event.target.value as EventTag,
                  })
                }
                disabled={activeReadOnly}
              >
                {TAGS.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </label>
            <div className="modal-actions">
              <Button type="submit" disabled={activeReadOnly}>
                Save
              </Button>
            </div>
          </form>
        ) : (
          <>
            {activeEntry?.readOnly && (
              <div className="muted">Archived week. Read-only.</div>
            )}
            {conflicts[activeDay.weekId] && (
              <div className="field-error">
                Not saved yet.{" "}
                <button
                  className="link"
                  onClick={() => reloadWeek(activeDay.weekId)}
                >
                  Reload this week.
                </button>
              </div>
            )}
            <div className="quick-add share-hidden">
              <input
                type="text"
                inputMode="numeric"
                placeholder="Time (optional)"
                className="quick-time"
                value={quickDraft.time}
                onChange={(event) =>
                  setQuickDraft((prev) => ({
                    ...prev,
                    time: event.target.value,
                    error: "",
                  }))
                }
                onBlur={(event) => {
                  const normalized = normalizeTimeInput(event.target.value);
                  if (normalized === null) {
                    setQuickDraft((prev) => ({
                      ...prev,
                      error: "Use HH:MM, e.g. 07:30.",
                    }));
                    return;
                  }
                  setQuickDraft((prev) => ({
                    ...prev,
                    time: normalized,
                    error: "",
                  }));
                }}
                disabled={activeReadOnly}
              />
              <input
                type="text"
                placeholder="Add event (e.g. 18:30 dinner @ town)"
                value={quickDraft.title}
                onChange={(event) =>
                  setQuickDraft((prev) => ({ ...prev, title: event.target.value }))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    saveQuickEvent(activeDay.weekId, activeDay.day);
                  }
                }}
                disabled={activeReadOnly}
              />
              <Button
                onClick={() => saveQuickEvent(activeDay.weekId, activeDay.day)}
                disabled={activeReadOnly}
              >
                Add
              </Button>
              <Button
                variant="ghost"
                className="share-hidden"
                onClick={() =>
                  startAdd(activeDay.weekId, activeDay.day, activeWeek.people)
                }
                disabled={activeReadOnly}
              >
                Full edit
              </Button>
            </div>
            <div className="quick-add-meta share-hidden">
              <span className="muted">Who</span>
              <div className="quick-add-people">
                <button
                  type="button"
                  className={`pill${lastWho.length === 0 ? " pill-active" : ""}`}
                  onClick={() => setLastWho([])}
                  disabled={activeReadOnly}
                >
                  Everyone
                </button>
                {activeWeek.people.map((person) => (
                  <button
                    key={person}
                    type="button"
                    className={`pill${lastWho.includes(person) ? " pill-active" : ""}`}
                    onClick={() => toggleQuickWho(person)}
                    disabled={activeReadOnly}
                  >
                    {person}
                  </button>
                ))}
              </div>
            </div>
            {quickDraft.error && <div className="field-error">{quickDraft.error}</div>}
            {activeWeek.events.filter((event) => event.day === activeDay.day).length ===
            0 ? (
              <div className="muted">No events yet.</div>
            ) : (
              <ul className="list">
                {sortEventsForDay(
                  activeWeek.events.filter((event) => event.day === activeDay.day)
                ).map((event) => (
                  <li key={event.id} className="row">
                    <div>
                      <div className="row-title">
                        <span className="row-time">
                          {event.time ? event.time : "All day"}
                        </span>
                        <span className="row-title-text">{event.title}</span>
                      </div>
                      <div className="row-meta">
                        <div className="meta-chips">
                          {event.who.length > 0 ? (
                            event.who.map((person) => (
                              <span key={person} className="meta-chip">
                                <span
                                  className="meta-dot"
                                  style={{ backgroundColor: getPersonColor(person) }}
                                />
                                {person}
                              </span>
                            ))
                          ) : (
                            <span className="meta-chip">
                              <span className="meta-dot meta-dot-muted" />
                              Everyone
                            </span>
                          )}
                          {event.tag && (
                            <span className="meta-chip">
                              <span
                                className="meta-dot"
                                style={{ backgroundColor: getTagColor(event.tag) }}
                              />
                              {event.tag}
                            </span>
                          )}
                          {event.location && (
                            <span className="meta-chip meta-chip-plain">
                              @ {event.location}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="row-actions share-hidden">
                      <button
                        className="link"
                        onClick={() => startEdit(activeDay.weekId, event)}
                        disabled={activeReadOnly}
                      >
                        Edit
                      </button>
                      <button
                        className="link danger"
                        onClick={() => deleteEvent(activeDay.weekId, event.id)}
                        disabled={activeReadOnly}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
