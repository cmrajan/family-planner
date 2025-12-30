import React from "react";
import {
  Effort,
  EventTag,
  PersonId,
  TodosDoc,
  UniversalAddMode,
  UniversalAddParseResult,
  WeekDoc,
} from "../../domain/types";
import {
  DAY_LABELS,
  TIMEZONE,
  getCurrentDayIndex,
  getWeekIdFromDateString,
} from "../../domain/week";
import { fetchWeek, parseUniversalAdd, putWeek } from "../../api/client";
import { createId } from "../../utils/id";
import Button from "./Button";
import Modal from "./Modal";
import { TabKey } from "./Tabs";

const TAGS: EventTag[] = ["school", "sport", "family", "work", "other", "recurring"];
const EFFORTS: Effort[] = ["5m", "15m", "30m", "1h+"];

interface UniversalAddFabProps {
  week: WeekDoc;
  weekReadOnly: boolean;
  todosDoc: TodosDoc | null;
  todosReadOnly: boolean;
  tab: TabKey;
  me: PersonId;
  loadWeekById: (weekId: string) => void;
  onUpdate: (mutator: (draft: WeekDoc) => void) => void;
  onUpdateTodos: (mutator: (draft: TodosDoc) => void) => void;
}

interface EventDraft {
  kind: "event";
  confidence: UniversalAddParseResult["confidence"];
  title: string;
  date: string;
  day: number;
  time: string;
  location: string;
  who: PersonId[];
  tag: EventTag | "";
}

interface TodoDraft {
  kind: "todo";
  confidence: UniversalAddParseResult["confidence"];
  title: string;
  owner: PersonId;
  effort: Effort | "";
}

type Draft = EventDraft | TodoDraft;

type AddMode = "add" | "add-new";

type AddTarget = {
  weekId: string;
  dayIndex: number | undefined;
};

function defaultModeForTab(tab: TabKey): UniversalAddMode {
  if (tab === "todos") {
    return "todo";
  }
  if (tab === "events" || tab === "calendar") {
    return "event";
  }
  return "auto";
}

function isValidIsoDate(value: string): boolean {
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

function isValidTime(value: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return false;
  }
  const [hour, minute] = value.split(":").map(Number);
  return (
    Number.isInteger(hour) &&
    Number.isInteger(minute) &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59
  );
}

function getDayIndexFromDate(value: string): number | null {
  if (!isValidIsoDate(value)) {
    return null;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    weekday: "short",
  });
  const label = formatter.format(date);
  const index = DAY_LABELS.indexOf(label);
  return index >= 0 ? index : null;
}

function buildDraft(result: UniversalAddParseResult, me: PersonId): Draft {
  if (result.kind === "event" && result.event) {
    const date = result.event.date ?? "";
    const dateDay = date ? getDayIndexFromDate(date) : null;
    const derivedDay =
      dateDay !== null ? dateDay : result.event.day ?? getCurrentDayIndex();
    return {
      kind: "event",
      confidence: result.confidence,
      title: result.event.title,
      date,
      day: derivedDay,
      time: result.event.time ?? "",
      location: result.event.location ?? "",
      who: result.event.who.length > 0 ? [...result.event.who] : [],
      tag: result.event.tag ?? "",
    };
  }

  if (result.kind === "todo" && result.todo) {
    return {
      kind: "todo",
      confidence: result.confidence,
      title: result.todo.title,
      owner: result.todo.owner ?? me,
      effort: result.todo.effort ?? "",
    };
  }

  return {
    kind: "todo",
    confidence: "low",
    title: "",
    owner: me,
    effort: "",
  };
}

function getTargetInfo(draft: Draft, currentWeekId: string): AddTarget {
  if (draft.kind === "event") {
    if (draft.date) {
      const weekId = getWeekIdFromDateString(draft.date) ?? currentWeekId;
      const dayIndex = getDayIndexFromDate(draft.date) ?? draft.day;
      return { weekId, dayIndex };
    }
    return { weekId: currentWeekId, dayIndex: draft.day };
  }
  return { weekId: currentWeekId, dayIndex: undefined };
}

function getTargetLabel(draft: Draft, currentWeekId: string): string {
  const target = getTargetInfo(draft, currentWeekId);
  if (target.dayIndex === undefined) {
    return "Anytime";
  }
  return DAY_LABELS[target.dayIndex] ?? "";
}

function getNextEventOrder(doc: WeekDoc, day: number): number {
  const orders = doc.events
    .filter((event) => event.day === day && Number.isInteger(event.order))
    .map((event) => event.order as number);
  return orders.length > 0 ? Math.max(...orders) + 1 : 0;
}

function getNextTodoOrder(doc: TodosDoc): number {
  const orders = doc.todos
    .filter((todo) => Number.isInteger(todo.order))
    .map((todo) => todo.order as number);
  return orders.length > 0 ? Math.max(...orders) + 1 : 0;
}

export default function UniversalAddFab({
  week,
  weekReadOnly,
  todosDoc,
  todosReadOnly,
  tab,
  me,
  loadWeekById,
  onUpdate,
  onUpdateTodos,
}: UniversalAddFabProps) {
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<"input" | "review">("input");
  const [text, setText] = React.useState("");
  const [mode, setMode] = React.useState<UniversalAddMode>(() =>
    defaultModeForTab(tab)
  );
  const [parseError, setParseError] = React.useState("");
  const [submitError, setSubmitError] = React.useState("");
  const [parsing, setParsing] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  React.useEffect(() => {
    if (open && step === "input") {
      textareaRef.current?.focus();
    }
  }, [open, step]);

  const openModal = () => {
    if (todosReadOnly) {
      return;
    }
    setOpen(true);
    setStep("input");
    setText("");
    setMode(defaultModeForTab(tab));
    setParseError("");
    setSubmitError("");
    setDraft(null);
  };

  const closeModal = () => {
    setOpen(false);
    setParseError("");
    setSubmitError("");
    setParsing(false);
    setSubmitting(false);
  };

  const handleParse = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setParseError("Add a short description to parse.");
      return;
    }
    setParseError("");
    setSubmitError("");
    setParsing(true);
    try {
      const result = await parseUniversalAdd({
        text: trimmed,
        mode,
        timezone: TIMEZONE,
        nowIso: new Date().toISOString(),
        defaultOwner: me,
        people: week.people,
        currentWeekId: week.weekId,
      });
      setDraft(buildDraft(result, me));
      setStep("review");
    } catch (error) {
      const message =
        error && typeof error === "object" && "message" in error
          ? String(error.message)
          : "Unable to parse that.";
      setParseError(message);
    } finally {
      setParsing(false);
    }
  };

  const backToInput = () => {
    setStep("input");
    setParseError("");
    setSubmitError("");
  };

  const validateDraft = (): { target: AddTarget; title: string } | null => {
    if (!draft) {
      return null;
    }
    const title = draft.title.trim();
    if (!title) {
      setSubmitError("Title is required.");
      return null;
    }
    if (title.length > 140) {
      setSubmitError("Title must be 140 characters or less.");
      return null;
    }

    if (draft.kind === "event") {
      if (draft.date && !isValidIsoDate(draft.date)) {
        setSubmitError("Date must be YYYY-MM-DD.");
        return null;
      }
      if (!draft.date && (draft.day < 0 || draft.day > 6)) {
        setSubmitError("Day must be between Mon and Sun.");
        return null;
      }
      if (draft.time && !isValidTime(draft.time)) {
        setSubmitError("Time must be HH:MM.");
        return null;
      }
      if (draft.location.trim().length > 80) {
        setSubmitError("Location must be 80 characters or less.");
        return null;
      }
    }

    if (draft.kind === "todo") {
      if (!week.people.includes(draft.owner)) {
        setSubmitError("Owner is invalid.");
        return null;
      }
    }

    const target = getTargetInfo(draft, week.weekId);
    if (draft.kind === "event" && target.dayIndex === undefined) {
      setSubmitError("Pick a day for this event.");
      return null;
    }

    return { target, title };
  };

  const saveToWeek = async (
    targetWeekId: string,
    targetDay: number | undefined,
    title: string,
    mode: AddMode
  ) => {
    if (!draft) {
      return;
    }
    if (draft.kind !== "event") {
      return;
    }
    if (targetWeekId === week.weekId && weekReadOnly) {
      setSubmitError("Archived week (read-only).");
      return;
    }

    const applyToWeek = (doc: WeekDoc) => {
      const eventDay = targetDay ?? draft.day;
      doc.events.push({
        id: createId(),
        day: eventDay,
        time: draft.time.trim() || undefined,
        title,
        location: draft.location.trim() || undefined,
        who: draft.who,
        tag: draft.tag || undefined,
        order: getNextEventOrder(doc, eventDay),
      });
    };

    if (targetWeekId === week.weekId) {
      onUpdate((doc) => {
        applyToWeek(doc);
      });
      if (mode === "add-new") {
        setStep("input");
        setText("");
        setDraft(null);
        setParseError("");
        setSubmitError("");
      } else {
        closeModal();
      }
      return;
    }

    setSubmitting(true);
    try {
      const payload = await fetchWeek(targetWeekId);
      if (payload.readOnly) {
        setSubmitError("Archived week (read-only).");
        setSubmitting(false);
        return;
      }
      applyToWeek(payload.week);
      await putWeek(payload.week);
      loadWeekById(targetWeekId);
      if (mode === "add-new") {
        setStep("input");
        setText("");
        setDraft(null);
        setParseError("");
        setSubmitError("");
      } else {
        closeModal();
      }
    } catch (error) {
      const status =
        error && typeof error === "object" && "status" in error
          ? Number(error.status)
          : undefined;
      const code =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : undefined;
      if (status === 409 || code === "VERSION_CONFLICT") {
        setSubmitError("Updated elsewhere. Reload and retry.");
      } else if (status === 403 || code === "ARCHIVED_READONLY") {
        setSubmitError("Archived week (read-only).");
      } else {
        setSubmitError("Unable to add this item.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdd = async (mode: AddMode) => {
    setSubmitError("");
    const validated = validateDraft();
    if (!validated || !draft) {
      return;
    }
    const { target, title } = validated;
    if (draft.kind === "todo") {
      if (todosReadOnly) {
        setSubmitError("Share view enabled.");
        return;
      }
      if (!todosDoc) {
        setSubmitError("To-dos not loaded yet.");
        return;
      }
      onUpdateTodos((doc) => {
        const nextOrder = getNextTodoOrder(doc);
        doc.todos.push({
          id: createId(),
          title,
          owner: draft.owner,
          status: "todo",
          effort: draft.effort || undefined,
          order: nextOrder,
        });
      });
      if (mode === "add-new") {
        setStep("input");
        setText("");
        setDraft(null);
        setParseError("");
        setSubmitError("");
      } else {
        closeModal();
      }
      return;
    }
    const targetWeekId = target.weekId;
    await saveToWeek(targetWeekId, target.dayIndex, title, mode);
  };

  const handleAddCurrentWeek = async () => {
    setSubmitError("");
    const validated = validateDraft();
    if (!validated || !draft) {
      return;
    }
    if (draft.kind !== "event") {
      return;
    }
    await saveToWeek(week.weekId, validated.target.dayIndex, validated.title, "add");
  };

  const targetInfo =
    draft && draft.kind === "event" ? getTargetInfo(draft, week.weekId) : null;
  const targetLabel =
    draft && draft.kind === "event" ? getTargetLabel(draft, week.weekId) : "";
  const crossWeek = Boolean(
    draft && draft.kind === "event" && targetInfo && targetInfo.weekId !== week.weekId
  );

  const fabLabel = todosReadOnly
    ? "Share view enabled"
    : weekReadOnly
    ? "Archived week (events read-only)"
    : "";

  return (
    <div className="share-hidden">
      <div className="universal-add-fab">
        <button
          type="button"
          className="fab-button"
          onClick={openModal}
          disabled={todosReadOnly}
          aria-label="Add"
          title={todosReadOnly ? "Share view enabled" : "Add"}
        >
          +
        </button>
        {fabLabel && <div className="fab-label">{fabLabel}</div>}
      </div>
      <Modal title="Universal Add" open={open} onClose={closeModal}>
        {step === "input" && (
          <div className="form">
            <div className="grid-row">
              <label className="grid-label" htmlFor="universal-add-text">
                What do you want to add?
              </label>
              <textarea
                id="universal-add-text"
                ref={textareaRef}
                rows={3}
                className="universal-add-textarea"
                placeholder={
                  "Meet with friends on 2 Jan 2026 at my house\nPay school trip tomorrow\nDentist Tue 15:30 @ High St Clinic"
                }
                value={text}
                onChange={(event) => setText(event.target.value)}
                enterKeyHint="done"
              />
            </div>
            <div className="grid-row">
              <label className="grid-label" htmlFor="universal-add-mode">
                Mode
              </label>
              <select
                id="universal-add-mode"
                value={mode}
                onChange={(event) => setMode(event.target.value as UniversalAddMode)}
              >
                <option value="auto">Auto (recommended)</option>
                <option value="event">Event</option>
                <option value="todo">To-do</option>
              </select>
            </div>
            {parseError && <div className="field-error">{parseError}</div>}
            <div className="modal-actions universal-add-actions">
              <Button variant="ghost" onClick={closeModal} disabled={parsing}>
                Cancel
              </Button>
              <Button onClick={handleParse} disabled={parsing || !text.trim()}>
                {parsing ? "Parsing..." : "Parse"}
              </Button>
            </div>
          </div>
        )}
        {step === "review" && draft && (
          <div className="form">
            {draft.confidence === "low" && (
              <div className="banner">Low confidence. Please review carefully.</div>
            )}
            {crossWeek && targetInfo && (
              <div className="banner">
                Will add to Week {targetInfo.weekId} ({targetLabel}).
              </div>
            )}
            <div className="grid-row">
              <label className="grid-label" htmlFor="universal-add-title">
                Title
              </label>
              <input
                id="universal-add-title"
                type="text"
                value={draft.title}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    title: event.target.value,
                  })
                }
              />
            </div>
            {draft.kind === "event" ? (
              <>
                {draft.date ? (
                  <div className="grid-row">
                    <label className="grid-label" htmlFor="universal-add-date">
                      Date
                    </label>
                    <input
                      id="universal-add-date"
                      type="date"
                      value={draft.date}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          date: event.target.value,
                        })
                      }
                    />
                  </div>
                ) : (
                  <div className="grid-row">
                    <label className="grid-label" htmlFor="universal-add-day">
                      Day
                    </label>
                    <select
                      id="universal-add-day"
                      value={draft.day}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          day: Number(event.target.value),
                        })
                      }
                    >
                      {DAY_LABELS.map((label, index) => (
                        <option key={label} value={index}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="grid-row">
                  <label className="grid-label" htmlFor="universal-add-time">
                    Time
                  </label>
                  <input
                    id="universal-add-time"
                    type="time"
                    value={draft.time}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        time: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="grid-row">
                  <label className="grid-label" htmlFor="universal-add-location">
                    Location
                  </label>
                  <input
                    id="universal-add-location"
                    type="text"
                    value={draft.location}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        location: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="grid-row">
                  <span className="grid-label">Who</span>
                  <div className="universal-add-who">
                    <button
                      type="button"
                      className={`pill${draft.who.length === 0 ? " pill-active" : ""}`}
                      onClick={() => setDraft({ ...draft, who: [] })}
                    >
                      Everyone
                    </button>
                    {week.people.map((person) => {
                      const active = draft.who.includes(person);
                      return (
                        <button
                          key={person}
                          type="button"
                          className={`pill${active ? " pill-active" : ""}`}
                          onClick={() => {
                            const next = active
                              ? draft.who.filter((id) => id !== person)
                              : [...draft.who, person];
                            setDraft({
                              ...draft,
                              who: next,
                            });
                          }}
                        >
                          {person}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid-row">
                  <label className="grid-label" htmlFor="universal-add-tag">
                    Tag
                  </label>
                  <select
                    id="universal-add-tag"
                    value={draft.tag}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        tag: event.target.value as EventTag | "",
                      })
                    }
                  >
                    <option value="">None</option>
                    {TAGS.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              <>
                <div className="grid-row">
                  <span className="grid-label">List</span>
                  <div className="meta-text">Anytime</div>
                </div>
                <div className="grid-row">
                  <label className="grid-label" htmlFor="universal-add-owner">
                    Owner
                  </label>
                  <select
                    id="universal-add-owner"
                    value={draft.owner}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        owner: event.target.value as PersonId,
                      })
                    }
                  >
                    {week.people.map((person) => (
                      <option key={person} value={person}>
                        {person}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid-row">
                  <label className="grid-label" htmlFor="universal-add-effort">
                    Effort
                  </label>
                  <select
                    id="universal-add-effort"
                    value={draft.effort}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        effort: event.target.value as Effort | "",
                      })
                    }
                  >
                    <option value="">Any</option>
                    {EFFORTS.map((effort) => (
                      <option key={effort} value={effort}>
                        {effort}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid-row">
                  <span className="grid-label">Status</span>
                  <div className="meta-text">todo</div>
                </div>
              </>
            )}
            {submitError && <div className="field-error">{submitError}</div>}
            <div className="modal-actions universal-add-actions">
              <Button variant="ghost" onClick={backToInput} disabled={submitting}>
                Back
              </Button>
              {crossWeek && (
                <Button
                  variant="ghost"
                  onClick={handleAddCurrentWeek}
                  disabled={submitting}
                >
                  Add to current week instead
                </Button>
              )}
              <Button onClick={() => handleAdd("add")} disabled={submitting}>
                {submitting
                  ? "Adding..."
                  : crossWeek
                  ? "Go to week & add"
                  : "Add"}
              </Button>
              {!crossWeek && (
                <Button
                  variant="ghost"
                  onClick={() => handleAdd("add-new")}
                  disabled={submitting}
                >
                  Add & New
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
