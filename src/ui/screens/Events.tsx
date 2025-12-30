import React from "react";
import { WeekDoc, PlannerEvent, PersonId, EventTag } from "../../domain/types";
import { DAY_LABELS, getCurrentDayIndex } from "../../domain/week";
import { createId } from "../../utils/id";
import { normalizeTimeInput } from "../../utils/time";
import { parseQuickEventInput } from "../../utils/quickEvent";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { getPersonColor, getTagColor } from "../utils/meta";

interface EventsProps {
  week: WeekDoc;
  me: PersonId;
  onUpdate: (mutator: (draft: WeekDoc) => void) => void;
  onRepeat: (event: PlannerEvent, count: number) => void;
  readOnly: boolean;
}

interface QuickDraft {
  raw: string;
  time: string;
  location: string;
  allDay: boolean;
  who: PersonId[];
  error: string;
  timeOverridden: boolean;
  locationOverridden: boolean;
  whoExpanded: boolean;
}

const TAGS: EventTag[] = ["school", "sport", "family", "work", "other", "recurring"];

function sortEventsForDay(events: PlannerEvent[]) {
  const hasOrder = events.some((event) => Number.isInteger(event.order));
  return [...events].sort((a, b) => {
    const at = a.time ?? "";
    const bt = b.time ?? "";
    if (at !== bt) {
      return at.localeCompare(bt);
    }
    if (hasOrder) {
      const ao = a.order ?? Number.MAX_SAFE_INTEGER;
      const bo = b.order ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) {
        return ao - bo;
      }
    }
    return a.title.localeCompare(b.title);
  });
}

function suggestTimeForDay(day: number, events: PlannerEvent[]): string {
  const times = events
    .filter((event) => event.day === day && event.time)
    .map((event) => event.time as string)
    .sort();
  return times.length > 0 ? times[times.length - 1] : "";
}

const createQuickDraft = (): QuickDraft => ({
  raw: "",
  time: "",
  location: "",
  allDay: false,
  who: [],
  error: "",
  timeOverridden: false,
  locationOverridden: false,
  whoExpanded: false,
});

export default function Events({ week, me, onUpdate, onRepeat, readOnly }: EventsProps) {
  const [editing, setEditing] = React.useState<PlannerEvent | null>(null);
  const [lastWho, setLastWho] = React.useState<PersonId[]>([]);
  const [timeError, setTimeError] = React.useState("");
  const [repeatCount, setRepeatCount] = React.useState(0);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [personFilter, setPersonFilter] = React.useState<"everyone" | "me">(
    "everyone"
  );
  const [tagFilter, setTagFilter] = React.useState<EventTag | "all">("all");
  const [searchTerm, setSearchTerm] = React.useState("");
  const isMobile = React.useMemo(
    () => window.matchMedia("(max-width: 699px)").matches,
    []
  );
  const [collapsedDays, setCollapsedDays] = React.useState<Record<number, boolean>>(
    {}
  );
  const [openDay, setOpenDay] = React.useState<number | null>(null);
  const [quickDraft, setQuickDraft] = React.useState<QuickDraft>(() =>
    createQuickDraft()
  );
  const [discardPrompt, setDiscardPrompt] = React.useState<{
    day: number;
    nextDay?: number;
  } | null>(null);
  const quickAddRef = React.useRef<HTMLDivElement | null>(null);
  const quickInputRef = React.useRef<HTMLInputElement | null>(null);

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredEvents = week.events.filter((event) => {
    if (
      personFilter === "me" &&
      event.who.length > 0 &&
      !event.who.includes(me)
    ) {
      return false;
    }
    if (tagFilter !== "all" && event.tag !== tagFilter) {
      return false;
    }
    if (normalizedSearch) {
      const title = event.title.toLowerCase();
      const location = event.location?.toLowerCase() ?? "";
      if (!title.includes(normalizedSearch) && !location.includes(normalizedSearch)) {
        return false;
      }
    }
    return true;
  });

  const grouped = DAY_LABELS.map((label, day) => ({
    label,
    day,
    events: sortEventsForDay(filteredEvents.filter((event) => event.day === day)),
  }));
  const parsedQuickDraft = React.useMemo(
    () => parseQuickEventInput(quickDraft.raw),
    [quickDraft.raw]
  );
  const canSaveQuickDraft = parsedQuickDraft.title.trim().length > 0;

  const startEdit = (event: PlannerEvent) => {
    if (readOnly) {
      return;
    }
    setEditing({ ...event, who: [...event.who] });
    setTimeError("");
    setRepeatCount(0);
  };

  const isDraftDirty = React.useCallback((draft: QuickDraft) => {
    return (
      draft.raw.trim().length > 0 ||
      draft.time.trim().length > 0 ||
      draft.location.trim().length > 0 ||
      draft.allDay ||
      draft.who.length > 0
    );
  }, []);

  const resetQuickDraft = React.useCallback(() => {
    setQuickDraft(createQuickDraft());
  }, []);

  const closeQuickAdd = React.useCallback(() => {
    setOpenDay(null);
    setDiscardPrompt(null);
    resetQuickDraft();
  }, [resetQuickDraft]);

  const openQuickAdd = React.useCallback(
    (day: number) => {
      setOpenDay(day);
      setDiscardPrompt(null);
      resetQuickDraft();
      setCollapsedDays((prev) => ({ ...prev, [day]: false }));
    },
    [resetQuickDraft]
  );

  const requestCloseQuickAdd = React.useCallback(() => {
    if (openDay === null) {
      return;
    }
    if (isDraftDirty(quickDraft)) {
      setDiscardPrompt({ day: openDay });
      return;
    }
    closeQuickAdd();
  }, [openDay, quickDraft, isDraftDirty, closeQuickAdd]);

  const requestOpenQuickAdd = React.useCallback(
    (day: number) => {
      if (readOnly) {
        return;
      }
      if (openDay === day) {
        requestCloseQuickAdd();
        return;
      }
      if (openDay !== null && isDraftDirty(quickDraft)) {
        setDiscardPrompt({ day: openDay, nextDay: day });
        return;
      }
      openQuickAdd(day);
    },
    [
      openDay,
      quickDraft,
      readOnly,
      isDraftDirty,
      openQuickAdd,
      requestCloseQuickAdd,
    ]
  );

  const saveQuickEvent = React.useCallback(() => {
    if (readOnly) {
      return;
    }
    if (openDay === null) {
      return;
    }
    const parsed = parseQuickEventInput(quickDraft.raw);
    const title = parsed.title.trim();
    if (!title) {
      quickInputRef.current?.focus();
      return;
    }
    let time = quickDraft.timeOverridden ? quickDraft.time : parsed.time;
    if (quickDraft.allDay) {
      time = "";
    }
    if (time.trim()) {
      const normalized = normalizeTimeInput(time);
      if (normalized === null) {
        setQuickDraft((prev) => ({
          ...prev,
          error: "Use HH:MM, e.g. 07:30.",
        }));
        return;
      }
      time = normalized;
    }
    const location = quickDraft.locationOverridden
      ? quickDraft.location.trim()
      : parsed.location.trim();
    onUpdate((draftWeek) => {
      draftWeek.events.push({
        id: createId(),
        day: openDay,
        time: time || undefined,
        title,
        location: location || undefined,
        who: quickDraft.who,
        tag: "family",
      });
    });
    setLastWho(quickDraft.who);
    closeQuickAdd();
  }, [readOnly, openDay, quickDraft, onUpdate, closeQuickAdd]);

  const openModalFromQuickAdd = React.useCallback(() => {
    if (openDay === null) {
      return;
    }
    const parsed = parseQuickEventInput(quickDraft.raw);
    const title = parsed.title.trim();
    let time = quickDraft.timeOverridden ? quickDraft.time : parsed.time;
    if (quickDraft.allDay) {
      time = "";
    }
    if (time.trim()) {
      const normalized = normalizeTimeInput(time);
      if (normalized === null) {
        setQuickDraft((prev) => ({
          ...prev,
          error: "Use HH:MM, e.g. 07:30.",
        }));
        return;
      }
      time = normalized;
    }
    const location = quickDraft.locationOverridden
      ? quickDraft.location.trim()
      : parsed.location.trim();
    setEditing({
      id: "",
      day: openDay,
      time,
      title,
      location,
      who: [...quickDraft.who],
      tag: "family",
    });
    setTimeError("");
    setRepeatCount(0);
    closeQuickAdd();
  }, [openDay, quickDraft, closeQuickAdd]);

  const saveEvent = () => {
    if (!editing) {
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
    const existing = week.events.find((event) => event.id === eventToSave.id);
    if (existing && existing.day !== eventToSave.day) {
      eventToSave.order = undefined;
    }
    onUpdate((draft) => {
      const index = draft.events.findIndex((evt) => evt.id === eventToSave.id);
      if (index >= 0) {
        draft.events[index] = eventToSave;
      } else {
        draft.events.push(eventToSave);
      }
    });
    setLastWho(eventToSave.who);
    if (repeatCount > 0) {
      onRepeat(eventToSave, repeatCount);
    }
    setRepeatCount(0);
    setEditing(null);
  };

  const deleteEvent = (eventId: string) => {
    if (readOnly) {
      return;
    }
    onUpdate((draft) => {
      draft.events = draft.events.filter((event) => event.id !== eventId);
    });
  };

  const reorderWithinDay = (day: number, fromId: string, toId: string) => {
    if (readOnly) {
      return;
    }
    onUpdate((draft) => {
      const items = draft.events.filter((event) => event.day === day);
      const ordered = sortEventsForDay(items);
      const fromIndex = ordered.findIndex((event) => event.id === fromId);
      const toIndex = ordered.findIndex((event) => event.id === toId);
      if (fromIndex < 0 || toIndex < 0) {
        return;
      }
      const [moved] = ordered.splice(fromIndex, 1);
      ordered.splice(toIndex, 0, moved);
      const orderMap = new Map(ordered.map((event, idx) => [event.id, idx]));
      draft.events.forEach((event) => {
        if (event.day === day) {
          const nextOrder = orderMap.get(event.id);
          if (nextOrder !== undefined) {
            event.order = nextOrder;
          }
        }
      });
    });
  };

  React.useEffect(() => {
    setLastWho((prev) => {
      if (prev.length === 0) {
        return [];
      }
      const filtered = prev.filter((person) => week.people.includes(person));
      if (filtered.length > 0) {
        return filtered;
      }
      return [];
    });
  }, [me, week.people]);

  React.useEffect(() => {
    if (readOnly) {
      setEditing(null);
      setTimeError("");
      setRepeatCount(0);
      closeQuickAdd();
    }
  }, [readOnly, closeQuickAdd]);

  React.useEffect(() => {
    if (!isMobile) {
      return;
    }
    setCollapsedDays((prev) => {
      if (Object.keys(prev).length > 0) {
        return prev;
      }
      const next: Record<number, boolean> = {};
      grouped.forEach((group) => {
        next[group.day] = group.events.length === 0;
      });
      return next;
    });
  }, [grouped, isMobile]);

  React.useEffect(() => {
    if (openDay === null) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }
      if (target.closest("[data-quick-add-trigger]")) {
        return;
      }
      if (quickAddRef.current?.contains(target)) {
        return;
      }
      if (isDraftDirty(quickDraft)) {
        setDiscardPrompt({ day: openDay });
        return;
      }
      closeQuickAdd();
    };
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [openDay, quickDraft, isDraftDirty, closeQuickAdd]);

  React.useEffect(() => {
    if (openDay === null) {
      return;
    }
    const handle = window.requestAnimationFrame(() => {
      quickInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(handle);
  }, [openDay]);

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>Events</h2>
        <Button
          className="share-hidden"
          onClick={() => requestOpenQuickAdd(getCurrentDayIndex())}
          disabled={readOnly}
        >
          Add event
        </Button>
      </div>

      <div className="card">
        <div className="filter-row">
          <span className="muted">Show</span>
          <button
            className={`pill${personFilter === "everyone" ? " pill-active" : ""}`}
            onClick={() => setPersonFilter("everyone")}
          >
            Everyone
          </button>
          <button
            className={`pill${personFilter === "me" ? " pill-active" : ""}`}
            onClick={() => setPersonFilter("me")}
          >
            Me
          </button>
          <select
            value={tagFilter}
            onChange={(event) => setTagFilter(event.target.value as EventTag | "all")}
          >
            <option value="all">All tags</option>
            {TAGS.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Search title or location"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>
      </div>

      {filteredEvents.length === 0 && (
        <div className="card">
          <div className="muted">
            {week.events.length === 0
              ? 'No events yet. Tap "Add event" to get started.'
              : "No events match the current filters."}
          </div>
        </div>
      )}

      {grouped.map((group) => (
        <div key={group.day} id={`events-day-${group.day}`} className="card">
          <div className="day-header">
            <h3>{group.label}</h3>
            <button
              className="link share-hidden inline-add-trigger"
              data-quick-add-trigger
              aria-label={`Add event for ${group.label}`}
              onClick={() => requestOpenQuickAdd(group.day)}
              disabled={readOnly}
            >
              + Add event
            </button>
            <button
              className="link collapse-toggle"
              onClick={() =>
                setCollapsedDays((prev) => ({
                  ...prev,
                  [group.day]: !prev[group.day],
                }))
              }
            >
              {collapsedDays[group.day] ? "Expand" : "Collapse"}
            </button>
          </div>
          <div
            className={`day-body${collapsedDays[group.day] ? " is-collapsed" : ""}`}
          >
            {openDay === group.day && (
              <div
                className="inline-add share-hidden"
                ref={openDay === group.day ? quickAddRef : null}
              >
                <div className="inline-add-primary">
                  <input
                    ref={quickInputRef}
                    type="text"
                    inputMode="text"
                    enterKeyHint="done"
                    placeholder='Add an event… (e.g., "Dinner 19:00 @ Lebanese")'
                    value={quickDraft.raw}
                    onChange={(event) => {
                      const raw = event.target.value;
                      const parsed = parseQuickEventInput(raw);
                      setQuickDraft((prev) => ({
                        ...prev,
                        raw,
                        time:
                          !prev.timeOverridden && !prev.allDay
                            ? parsed.time
                            : prev.time,
                        location: !prev.locationOverridden
                          ? parsed.location
                          : prev.location,
                        error: "",
                      }));
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        saveQuickEvent();
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        requestCloseQuickAdd();
                      }
                    }}
                    disabled={readOnly}
                    aria-label="Add event title"
                  />
                  {canSaveQuickDraft && (
                    <button
                      type="button"
                      className="inline-add-save"
                      onClick={saveQuickEvent}
                      aria-label="Save event"
                      disabled={readOnly}
                    >
                      ✔
                    </button>
                  )}
                </div>
                {quickDraft.error && (
                  <div className="field-error">{quickDraft.error}</div>
                )}
                <div className="inline-add-secondary">
                  <span className="inline-label">Time</span>
                  <div className="inline-control-row">
                    <input
                      type="time"
                      value={quickDraft.time}
                      onChange={(event) =>
                        setQuickDraft((prev) => ({
                          ...prev,
                          time: event.target.value,
                          allDay: false,
                          timeOverridden: true,
                          error: "",
                        }))
                      }
                      disabled={readOnly || quickDraft.allDay}
                      aria-label="Event time"
                    />
                    <button
                      type="button"
                      className={`pill${quickDraft.allDay ? " pill-active" : ""}`}
                      onClick={() =>
                        setQuickDraft((prev) => ({
                          ...prev,
                          allDay: !prev.allDay,
                          time: prev.allDay ? prev.time : "",
                        }))
                      }
                      disabled={readOnly}
                      aria-label="Toggle all day"
                    >
                      All day
                    </button>
                  </div>
                </div>
                <div className="inline-add-secondary">
                  <span className="inline-label">Location</span>
                  <input
                    type="text"
                    placeholder="Optional"
                    value={quickDraft.location}
                    onChange={(event) =>
                      setQuickDraft((prev) => ({
                        ...prev,
                        location: event.target.value,
                        locationOverridden: true,
                      }))
                    }
                    disabled={readOnly}
                    aria-label="Event location"
                  />
                </div>
                <div className="inline-add-secondary">
                  <span className="inline-label">Who</span>
                  <div className="inline-control-row inline-who">
                    {!quickDraft.whoExpanded ? (
                      <button
                        type="button"
                        className={`pill${
                          quickDraft.who.length === 0 ? " pill-active" : ""
                        }`}
                        onClick={() =>
                          setQuickDraft((prev) => ({
                            ...prev,
                            whoExpanded: true,
                          }))
                        }
                        disabled={readOnly}
                        aria-label="Select people"
                      >
                        Everyone
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className={`pill${
                            quickDraft.who.length === 0 ? " pill-active" : ""
                          }`}
                          onClick={() =>
                            setQuickDraft((prev) => ({
                              ...prev,
                              who: [],
                            }))
                          }
                          disabled={readOnly}
                          aria-label="Select everyone"
                        >
                          Everyone
                        </button>
                        {week.people.map((person) => (
                          <button
                            key={person}
                            type="button"
                            className={`pill${
                              quickDraft.who.includes(person) ? " pill-active" : ""
                            }`}
                            onClick={() =>
                              setQuickDraft((prev) => {
                                const selected = prev.who.includes(person);
                                const next = selected
                                  ? prev.who.filter((id) => id !== person)
                                  : [...prev.who, person];
                                return {
                                  ...prev,
                                  who: next,
                                };
                              })
                            }
                            disabled={readOnly}
                            aria-label={`Toggle ${person}`}
                          >
                            {person}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                </div>
                <div className="inline-add-actions">
                  <button
                    type="button"
                    className="link"
                    onClick={openModalFromQuickAdd}
                    disabled={readOnly}
                  >
                    More options
                  </button>
                  <div className="inline-add-buttons">
                    {canSaveQuickDraft && (
                      <Button onClick={saveQuickEvent} disabled={readOnly}>
                        Save
                      </Button>
                    )}
                    <Button variant="ghost" onClick={requestCloseQuickAdd}>
                      Cancel
                    </Button>
                  </div>
                </div>
                {discardPrompt?.day === group.day && (
                  <div className="inline-discard">
                    <span>Discard draft?</span>
                    <div className="inline-add-buttons">
                      <Button
                        variant="ghost"
                        onClick={() => setDiscardPrompt(null)}
                      >
                        Keep editing
                      </Button>
                      <Button
                        onClick={() => {
                          const nextDay = discardPrompt?.nextDay;
                          if (nextDay !== undefined) {
                            openQuickAdd(nextDay);
                            return;
                          }
                          closeQuickAdd();
                        }}
                      >
                        Discard
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {group.events.length === 0 ? (
              <div className="muted">No events.</div>
            ) : (
              <ul className="list">
                {group.events.map((event) => (
                  <li
                    key={event.id}
                    className={`row${draggingId === event.id ? " row-dragging" : ""}`}
                    draggable={!readOnly}
                    onDragStart={(dragEvent) => {
                      dragEvent.dataTransfer.setData("text/plain", event.id);
                      setDraggingId(event.id);
                    }}
                    onDragOver={(dragEvent) => dragEvent.preventDefault()}
                    onDrop={(dragEvent) => {
                      dragEvent.preventDefault();
                      const fromId = dragEvent.dataTransfer.getData("text/plain");
                      if (fromId) {
                        reorderWithinDay(group.day, fromId, event.id);
                      }
                      setDraggingId(null);
                    }}
                    onDragEnd={() => setDraggingId(null)}
                  >
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
                        onClick={() => startEdit(event)}
                        disabled={readOnly}
                      >
                        Edit
                      </button>
                      <button
                        className="link danger"
                        onClick={() => deleteEvent(event.id)}
                        disabled={readOnly}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ))}

      <Modal
        title={editing?.id ? "Edit event" : "Add event"}
        open={!!editing}
        onClose={() => {
          setEditing(null);
          setRepeatCount(0);
        }}
      >
        {editing && (
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
                  setEditing({
                    ...editing,
                    day: Number(event.target.value),
                  })
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
                  } else {
                    setEditing({
                      ...editing,
                      time: suggestTimeForDay(editing.day, week.events),
                    });
                  }
                }}
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
              />
            </label>
            <fieldset className="fieldset">
              <legend>Who</legend>
              {week.people.map((person) => (
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
              >
                {TAGS.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Repeat (weeks)
              <input
                type="number"
                min={0}
                max={12}
                value={repeatCount}
                onChange={(event) =>
                  setRepeatCount(Math.max(0, Number(event.target.value)))
                }
              />
            </label>
            <div className="modal-actions">
              <Button type="submit">Save</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
