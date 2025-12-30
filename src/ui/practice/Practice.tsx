import React from "react";
import {
  PracticeDoc,
  PracticeLogEntry,
  PracticeSkill,
  PersonId,
  PracticeWeeklyReview,
} from "../../domain/types";
import {
  DAY_LABELS,
  getCurrentDayIndex,
  getCurrentWeekId,
  shiftWeekId,
} from "../../domain/week";
import { createId } from "../../utils/id";
import Button from "../components/Button";
import Modal from "../components/Modal";
import {
  buildSkillDayCounts,
  countDaysPracticedForPersonWeek,
  countDaysPracticedForSkillWeek,
  countSessionsForPersonDay,
  filterLogsByWeek,
  getBestWeekForPerson,
  getBestWeekForSkill,
  getConsistencyWeeksForSkill,
  hasEveryonePracticed,
} from "./metrics";

type PracticeView =
  | { key: "family" }
  | { key: "person"; personId: PersonId }
  | { key: "skill"; personId: PersonId; skillId: string }
  | { key: "review" }
  | { key: "manage" };

interface PracticeProps {
  doc: PracticeDoc | null;
  loading: boolean;
  error: string | null;
  saving: boolean;
  conflict: boolean;
  saveError: string | null;
  weekId: string;
  readOnly: boolean;
  onUpdate: (mutator: (draft: PracticeDoc) => void) => void;
  onReload: () => void;
  onRetrySave: () => void;
}

const MAX_PRACTICE_SKILLS = 30;
const MAX_PRACTICE_MINUTES = 240;
const MAX_PRACTICE_NOTE = 200;
const DEFAULT_SKILL_NAME = "New skill";
const DEFAULT_SKILL_ICON = "o";
const DEFAULT_SKILL_TINY_WIN = "Start with 5 minutes.";
const TIMEZONE = "Europe/London";
const MAX_RECENT_SESSIONS = 8;

function sortSkills(skills: PracticeSkill[]): PracticeSkill[] {
  return [...skills].sort((a, b) => {
    if (a.order !== b.order) {
      return a.order - b.order;
    }
    return a.name.localeCompare(b.name);
  });
}

function getActiveSkills(skills: PracticeSkill[]): PracticeSkill[] {
  return sortSkills(skills.filter((skill) => !skill.archivedAt));
}

function getSkillLogsForDay(
  logs: PracticeLogEntry[],
  weekId: string,
  personId: PersonId,
  skillId: string,
  day: number
): PracticeLogEntry[] {
  return logs
    .filter(
      (entry) =>
        entry.weekId === weekId &&
        entry.personId === personId &&
        entry.skillId === skillId &&
        entry.day === day
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function getMostRecentDayWithSessions(
  logs: PracticeLogEntry[],
  weekId: string,
  personId: PersonId
): number | null {
  let latest = -1;
  for (const entry of logs) {
    if (entry.weekId !== weekId || entry.personId !== personId) {
      continue;
    }
    if (entry.day > latest) {
      latest = entry.day;
    }
  }
  return latest >= 0 ? latest : null;
}

function getDefaultSelectedDayIndex(
  doc: PracticeDoc,
  personId: PersonId,
  weekId: string,
  isViewingCurrentWeek: boolean,
  todayIndex: number
): number {
  if (isViewingCurrentWeek) {
    return todayIndex;
  }
  const mostRecent = getMostRecentDayWithSessions(doc.logs, weekId, personId);
  return mostRecent ?? 0;
}

function formatSessionTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIMEZONE,
  }).format(date);
}

function formatSessionDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIMEZONE,
  }).format(date);
}

function PracticeDots({
  counts,
  size = "sm",
}: {
  counts: number[];
  size?: "sm" | "lg";
}) {
  return (
    <div className={`practice-dots practice-dots-${size}`}>
      {DAY_LABELS.map((label, index) => {
        const filled = (counts[index] ?? 0) > 0;
        const total = counts[index] ?? 0;
        const title = `${label}: ${total} session${total === 1 ? "" : "s"}`;
        return (
          <span
            key={`${label}-${index}`}
            className={`practice-dot${filled ? " is-filled" : ""}`}
            title={title}
            role="img"
            aria-label={title}
          />
        );
      })}
    </div>
  );
}

export default function Practice({
  doc,
  loading,
  error,
  saving,
  conflict,
  saveError,
  weekId,
  readOnly,
  onUpdate,
  onReload,
  onRetrySave,
}: PracticeProps) {
  const [view, setView] = React.useState<PracticeView>({ key: "family" });
  const [openDetails, setOpenDetails] = React.useState<Set<string>>(
    () => new Set()
  );
  const currentWeekId = getCurrentWeekId();
  const todayIndex = getCurrentDayIndex();
  const activeWeekId = weekId;
  const isViewingCurrentWeek = activeWeekId === currentWeekId;
  const [selectedDayIndex, setSelectedDayIndex] = React.useState<number>(
    todayIndex
  );
  const selectedDayLabel = DAY_LABELS[selectedDayIndex] ?? "Mon";
  const selectedDayKey = React.useRef<{
    personId: PersonId;
    weekId: string;
  } | null>(null);

  React.useEffect(() => {
    if (!doc) {
      return;
    }
    if (view.key === "person" && !doc.people.includes(view.personId)) {
      setView({ key: "family" });
    }
    if (view.key === "skill") {
      const skills = doc.skillsByPerson[view.personId] ?? [];
      if (!doc.people.includes(view.personId)) {
        setView({ key: "family" });
        return;
      }
      if (!skills.some((skill) => skill.id === view.skillId)) {
        setView({ key: "person", personId: view.personId });
      }
    }
  }, [doc, view]);

  const weekLogs = React.useMemo(() => {
    if (!doc) {
      return [];
    }
    return filterLogsByWeek(doc.logs, activeWeekId);
  }, [doc, activeWeekId]);

  React.useEffect(() => {
    if (!doc || view.key !== "person") {
      return;
    }
    const key = { personId: view.personId, weekId: activeWeekId };
    const previousKey = selectedDayKey.current;
    if (
      previousKey &&
      previousKey.personId === key.personId &&
      previousKey.weekId === key.weekId
    ) {
      return;
    }
    const nextDay = getDefaultSelectedDayIndex(
      doc,
      view.personId,
      activeWeekId,
      isViewingCurrentWeek,
      todayIndex
    );
    setSelectedDayIndex(nextDay);
    selectedDayKey.current = key;
  }, [doc, view, activeWeekId, isViewingCurrentWeek, todayIndex]);

  const activePersonSkills =
    doc && view.key === "person"
      ? getActiveSkills(doc.skillsByPerson[view.personId] ?? [])
      : [];

  const familyBadge = doc ? hasEveryonePracticed(weekLogs, doc.people) : false;
  const familyDaysPracticed = doc
    ? doc.people.reduce(
        (total, personId) =>
          total + countDaysPracticedForPersonWeek(weekLogs, personId),
        0
      )
    : 0;

  const saveLabel = readOnly
    ? "Read-only"
    : conflict
    ? "Not saved"
    : saving
    ? "Saving..."
    : "Saved";
  const saveClass = conflict
    ? "is-alert"
    : readOnly
    ? "is-readonly"
    : saving
    ? "is-saving"
    : "is-saved";

  const openPerson = (personId: PersonId) => setView({ key: "person", personId });
  const openSkill = (personId: PersonId, skillId: string) =>
    setView({ key: "skill", personId, skillId });
  const openManage = () => setView({ key: "manage" });

  const formatReminderTimes = (times: string[]) =>
    times.length === 0 ? "None" : times.join(", ");

  const setReminderEnabled = (personId: PersonId, enabled: boolean) => {
    if (!doc) {
      return;
    }
    onUpdate((draft) => {
      draft.reminders.enabledByPerson[personId] = enabled;
    });
  };

  const addLogEntry = (
    personId: PersonId,
    skillId: string,
    weekIdValue: string,
    day: number
  ) => {
    if (!doc) {
      return;
    }
    onUpdate((draft) => {
      draft.logs.push({
        id: createId(),
        weekId: weekIdValue,
        day,
        personId,
        skillId,
        createdAt: new Date().toISOString(),
      });
    });
  };

  const updateLogEntry = (
    entryId: string,
    updater: (entry: PracticeLogEntry) => void
  ) => {
    if (!doc) {
      return;
    }
    onUpdate((draft) => {
      const target = draft.logs.find((entry) => entry.id === entryId);
      if (!target) {
        return;
      }
      updater(target);
    });
  };

  const removeLogEntry = (entryId: string) => {
    if (!doc) {
      return;
    }
    onUpdate((draft) => {
      draft.logs = draft.logs.filter((entry) => entry.id !== entryId);
    });
    setOpenDetails((prev) => {
      if (!prev.has(entryId)) {
        return prev;
      }
      const next = new Set(prev);
      next.delete(entryId);
      return next;
    });
  };

  const setSessionDetailsOpen = (entryId: string, open: boolean) => {
    setOpenDetails((prev) => {
      const next = new Set(prev);
      if (open) {
        next.add(entryId);
      } else {
        next.delete(entryId);
      }
      return next;
    });
  };

  const resetDayLogs = (
    personId: PersonId,
    skillId: string,
    weekIdValue: string,
    day: number
  ) => {
    if (!doc) {
      return;
    }
    const removedIds = doc.logs
      .filter(
        (entry) =>
          entry.weekId === weekIdValue &&
          entry.day === day &&
          entry.personId === personId &&
          entry.skillId === skillId
      )
      .map((entry) => entry.id);
    onUpdate((draft) => {
      draft.logs = draft.logs.filter(
        (entry) =>
          !(
            entry.weekId === weekIdValue &&
            entry.day === day &&
            entry.personId === personId &&
            entry.skillId === skillId
          )
      );
    });
    if (removedIds.length > 0) {
      setOpenDetails((prev) => {
        const next = new Set(prev);
        for (const entryId of removedIds) {
          next.delete(entryId);
        }
        return next;
      });
    }
  };

  const updateSkill = (
    personId: PersonId,
    skillId: string,
    updater: (skill: PracticeSkill) => void
  ) => {
    if (!doc) {
      return;
    }
    onUpdate((draft) => {
      const skills = draft.skillsByPerson[personId];
      const target = skills?.find((skill) => skill.id === skillId);
      if (!target) {
        return;
      }
      updater(target);
    });
  };

  const addSkill = (personId: PersonId) => {
    if (!doc) {
      return;
    }
    onUpdate((draft) => {
      const skills = draft.skillsByPerson[personId] ?? [];
      if (skills.length >= MAX_PRACTICE_SKILLS) {
        return;
      }
      const nextOrder =
        skills.reduce((max, skill) => Math.max(max, skill.order), -1) + 1;
      skills.push({
        id: createId(),
        name: DEFAULT_SKILL_NAME,
        icon: DEFAULT_SKILL_ICON,
        order: nextOrder,
        tinyWin: DEFAULT_SKILL_TINY_WIN,
      });
      draft.skillsByPerson[personId] = skills;
    });
  };

  const setSkillArchived = (
    personId: PersonId,
    skillId: string,
    archived: boolean
  ) => {
    updateSkill(personId, skillId, (target) => {
      target.archivedAt = archived ? new Date().toISOString() : undefined;
    });
  };

  const updateReview = (
    personId: PersonId,
    field: "helped" | "tweak",
    value: string
  ) => {
    if (!doc) {
      return;
    }
    onUpdate((draft) => {
      const weekReviews =
        draft.reviewsByWeekId[activeWeekId] ??
        ({} as Partial<Record<PersonId, PracticeWeeklyReview>>);
      const existing = weekReviews[personId] ?? {
        helped: "",
        tweak: "",
        updatedAt: new Date().toISOString(),
      };
      weekReviews[personId] = {
        ...existing,
        [field]: value,
        updatedAt: new Date().toISOString(),
      };
      draft.reviewsByWeekId[activeWeekId] = weekReviews;
    });
  };

  if (loading) {
    return <div className="screen">Loading practice...</div>;
  }

  if (!doc) {
    return (
      <div className="screen">
        <div className="card">
          <h3>Practice</h3>
          <p>{error ?? "Practice data is not available."}</p>
          <div className="modal-actions">
            <Button variant="ghost" onClick={onReload}>
              Reload
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen practice-screen">
      <div className="practice-header">
        <div>
          <h2>Practice</h2>
          <div className="practice-subtitle">
            {isViewingCurrentWeek ? "This week" : `Week ${activeWeekId}`}
          </div>
        </div>
        <div className="practice-status">
          <span className={`save-status ${saveClass}`}>{saveLabel}</span>
        </div>
      </div>

      {saveError && (
        <div className="banner">
          Save failed: {saveError}{" "}
          <button className="link" onClick={onRetrySave}>
            Retry save
          </button>
          .
        </div>
      )}

      {view.key === "family" && (
        <>
          {familyBadge && (
            <div className="card practice-badge">
              Everyone practiced at least once this week.
            </div>
          )}
          <div className="practice-actions-row">
            <Button variant="ghost" onClick={() => setView({ key: "review" })}>
              Weekly Review
            </Button>
            <Button variant="ghost" onClick={openManage}>
              Manage skills
            </Button>
          </div>
          <div className="practice-person-grid">
            {doc.people.map((personId) => {
              const skills = getActiveSkills(doc.skillsByPerson[personId] ?? []);
              const daysPracticed = countDaysPracticedForPersonWeek(
                weekLogs,
                personId
              );
              return (
                <button
                  key={personId}
                  type="button"
                  className="card practice-person-card"
                  onClick={() => openPerson(personId)}
                >
                  <div className="practice-person-header">
                    <div className="practice-person-name">{personId}</div>
                    <div className="practice-person-meta">
                      Days practiced this week: {daysPracticed}
                    </div>
                  </div>
                  <div className="practice-skill-list">
                    {skills.length === 0 ? (
                      <div className="muted">No active skills.</div>
                    ) : (
                      skills.map((skill) => {
                        const counts = buildSkillDayCounts(
                          weekLogs,
                          personId,
                          skill.id
                        );
                        return (
                          <div key={skill.id} className="practice-skill-row">
                            <div className="practice-skill-label">
                              <span className="practice-icon">{skill.icon}</span>
                              <span>{skill.name}</span>
                            </div>
                            <PracticeDots counts={counts} />
                          </div>
                        );
                      })
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {view.key === "person" && (
        <>
          <div className="practice-subnav">
            <button className="link" onClick={() => setView({ key: "family" })}>
              Back to family
            </button>
            <div className="practice-subnav-title">{view.personId}</div>
            <button className="link" onClick={openManage}>
              Manage skills
            </button>
          </div>

          {isViewingCurrentWeek &&
            (() => {
              const yesterday =
                todayIndex === 0
                  ? { weekId: shiftWeekId(currentWeekId, -1), day: 6 }
                  : { weekId: currentWeekId, day: todayIndex - 1 };
              const todaySessions = countSessionsForPersonDay(
                doc.logs,
                currentWeekId,
                view.personId,
                todayIndex
              );
              const yesterdaySessions = countSessionsForPersonDay(
                doc.logs,
                yesterday.weekId,
                view.personId,
                yesterday.day
              );
              const showNudge = todaySessions === 0 && yesterdaySessions === 0;
              return showNudge ? (
                <div className="notice practice-nudge">
                  Looks like it's been a couple of days. A Tiny Win still counts.
                </div>
              ) : null;
            })()}

          <div className="card">
            <div className="practice-day-header">
              <h3>Log for: {selectedDayLabel}</h3>
              <div className="practice-day-picker">
                {DAY_LABELS.map((label, index) => {
                  const isSelected = index === selectedDayIndex;
                  return (
                    <button
                      key={label}
                      type="button"
                      className={`practice-day-chip${
                        isSelected ? " is-selected" : ""
                      }`}
                      aria-pressed={isSelected}
                      onClick={() => setSelectedDayIndex(index)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="practice-today-list">
              {activePersonSkills.length === 0 ? (
                <div className="muted">No active skills.</div>
              ) : (
                activePersonSkills.map((skill) => {
                  const dayLogs = getSkillLogsForDay(
                    doc.logs,
                    activeWeekId,
                    view.personId,
                    skill.id,
                    selectedDayIndex
                  );
                  const hasSessions = dayLogs.length > 0;
                  const isFutureSelectedDay =
                    isViewingCurrentWeek && selectedDayIndex > todayIndex;
                  const statusLabel = hasSessions
                    ? `Practiced on ${selectedDayLabel}`
                    : isFutureSelectedDay
                    ? "Future day"
                    : "No sessions yet";
                  const showLoggedPrefix =
                    !isViewingCurrentWeek || selectedDayIndex !== todayIndex;
                  return (
                    <div key={skill.id} className="practice-today-skill">
                      <div className="practice-skill-header">
                        <div className="practice-skill-label">
                          <span className="practice-icon">{skill.icon}</span>
                          <span>{skill.name}</span>
                        </div>
                        <button
                          className="link"
                          onClick={() => openSkill(view.personId, skill.id)}
                        >
                          Details
                        </button>
                      </div>
                      <div className="practice-tiny-win">
                        Tiny win: {skill.tinyWin}
                      </div>
                      {skill.plan && (
                        <div className="practice-plan">
                          Plan: {skill.plan}
                        </div>
                      )}
                      <div className="practice-action-row">
                        <Button
                          onClick={() =>
                            addLogEntry(
                              view.personId,
                              skill.id,
                              activeWeekId,
                              selectedDayIndex
                            )
                          }
                          disabled={readOnly || isFutureSelectedDay}
                        >
                          Log
                        </Button>
                        <div className="practice-today-meta">
                          <span
                            className={`practice-today-status${
                              hasSessions ? " is-done" : ""
                            }`}
                          >
                            {statusLabel}
                          </span>
                          <span className="practice-today-count">
                            {dayLogs.length} session
                            {dayLogs.length === 1 ? "" : "s"} on{" "}
                            {selectedDayLabel}
                          </span>
                        </div>
                      </div>
                      {dayLogs.length > 0 && (
                        <div className="practice-log-list">
                          {dayLogs.map((entry) => {
                            const detailsOpen = openDetails.has(entry.id);
                            const hasDetails =
                              Boolean(entry.durationMinutes) ||
                              Boolean(entry.note);
                            const timeLabel = formatSessionTime(entry.createdAt);
                            const sessionLabel = showLoggedPrefix
                              ? `Logged ${timeLabel}`
                              : timeLabel;
                            return (
                              <React.Fragment key={entry.id}>
                                <div className="practice-log-entry">
                                  <span className="practice-log-label">
                                    {sessionLabel}
                                  </span>
                                  {entry.durationMinutes && (
                                    <span className="practice-log-pill">
                                      {entry.durationMinutes} min
                                    </span>
                                  )}
                                  {entry.note && (
                                    <span className="practice-log-note">
                                      {entry.note}
                                    </span>
                                  )}
                                  <button
                                    className="link"
                                    onClick={() =>
                                      setSessionDetailsOpen(entry.id, !detailsOpen)
                                    }
                                    disabled={readOnly}
                                  >
                                    {detailsOpen
                                      ? "Done"
                                      : hasDetails
                                      ? "Edit details"
                                      : "Add details"}
                                  </button>
                                  <button
                                    className="link"
                                    onClick={() => removeLogEntry(entry.id)}
                                    disabled={readOnly}
                                    title="Remove this session"
                                  >
                                    Undo
                                  </button>
                                </div>
                                {detailsOpen && (
                                  <div className="practice-log-details">
                                    <div className="practice-detail-field">
                                      <label className="practice-field-label">
                                        Duration (min)
                                      </label>
                                      <input
                                        type="number"
                                        className="practice-input practice-input-sm"
                                        min={1}
                                        max={MAX_PRACTICE_MINUTES}
                                        value={entry.durationMinutes ?? ""}
                                        disabled={readOnly}
                                        onChange={(event) => {
                                          const raw = event.target.value;
                                          if (!raw) {
                                            updateLogEntry(entry.id, (target) => {
                                              target.durationMinutes = undefined;
                                            });
                                            return;
                                          }
                                          const nextValue = Number(raw);
                                          if (
                                            !Number.isInteger(nextValue) ||
                                            nextValue < 1 ||
                                            nextValue > MAX_PRACTICE_MINUTES
                                          ) {
                                            return;
                                          }
                                          updateLogEntry(entry.id, (target) => {
                                            target.durationMinutes = nextValue;
                                          });
                                        }}
                                      />
                                    </div>
                                    <div className="practice-detail-field">
                                      <label className="practice-field-label">
                                        Note
                                      </label>
                                      <input
                                        type="text"
                                        className="practice-input"
                                        value={entry.note ?? ""}
                                        maxLength={MAX_PRACTICE_NOTE}
                                        disabled={readOnly}
                                        onChange={(event) => {
                                          const nextValue = event.target.value;
                                          updateLogEntry(entry.id, (target) => {
                                            target.note = nextValue.trim()
                                              ? nextValue
                                              : undefined;
                                          });
                                        }}
                                      />
                                    </div>
                                  </div>
                                )}
                              </React.Fragment>
                            );
                          })}
                          <div className="practice-log-actions">
                            <button
                              className="link"
                              onClick={() =>
                                resetDayLogs(
                                  view.personId,
                                  skill.id,
                                  activeWeekId,
                                  selectedDayIndex
                                )
                              }
                              disabled={readOnly}
                            >
                              Clear {selectedDayLabel}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="card">
            <h3>This week</h3>
            <div className="practice-week-list">
              {activePersonSkills.length === 0 ? (
                <div className="muted">No active skills.</div>
              ) : (
                activePersonSkills.map((skill) => {
                  const counts = buildSkillDayCounts(
                    weekLogs,
                    view.personId,
                    skill.id
                  );
                  return (
                    <div key={skill.id} className="practice-skill-row">
                      <div className="practice-skill-label">
                        <span className="practice-icon">{skill.icon}</span>
                        <span>{skill.name}</span>
                      </div>
                      <PracticeDots counts={counts} size="lg" />
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="card">
            <h3>Summary</h3>
            <div className="summary-row">
              <div>
                <div className="summary-label">Days practiced this week</div>
                <div className="summary-value">
                  {countDaysPracticedForPersonWeek(weekLogs, view.personId)}
                </div>
              </div>
              <div>
                <div className="summary-label">Best week</div>
                <div className="summary-value">
                  {getBestWeekForPerson(doc.logs, view.personId)} days
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {view.key === "skill" && (() => {
        const skills = doc.skillsByPerson[view.personId] ?? [];
        const skill = skills.find((item) => item.id === view.skillId);
        if (!skill) {
          return null;
        }
        const isArchived = Boolean(skill.archivedAt);
        const weekCounts = buildSkillDayCounts(
          weekLogs,
          view.personId,
          skill.id
        );
        const weekDaysPracticed = countDaysPracticedForSkillWeek(
          weekLogs,
          view.personId,
          skill.id
        );
        const consistency = getConsistencyWeeksForSkill(
          doc.logs,
          view.personId,
          skill.id
        );
        const bestWeek = getBestWeekForSkill(doc.logs, view.personId, skill.id);
        const recentSessions = doc.logs
          .filter(
            (entry) =>
              entry.personId === view.personId && entry.skillId === skill.id
          )
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, MAX_RECENT_SESSIONS);
        const envItems = skill.environment ?? [];

        return (
          <>
            <div className="practice-subnav">
              <button
                className="link"
                onClick={() =>
                  setView({ key: "person", personId: view.personId })
                }
              >
                Back to {view.personId}
              </button>
              <div className="practice-subnav-title">
                <span className="practice-icon">{skill.icon}</span>
                <span>{skill.name}</span>
              </div>
              <button className="link" onClick={openManage}>
                Manage skills
              </button>
            </div>

            <div className="card">
              <h3>Skill basics</h3>
              <div className="practice-manage-fields">
                <div className="practice-field">
                  <label className="practice-field-label" htmlFor="skill-icon">
                    Icon
                  </label>
                  <input
                    id="skill-icon"
                    type="text"
                    className="practice-input practice-input-sm"
                    value={skill.icon}
                    maxLength={8}
                    disabled={readOnly}
                    onChange={(event) =>
                      updateSkill(view.personId, skill.id, (target) => {
                        target.icon = event.target.value;
                      })
                    }
                  />
                </div>
                <div className="practice-field">
                  <label className="practice-field-label" htmlFor="skill-name">
                    Name
                  </label>
                  <input
                    id="skill-name"
                    type="text"
                    className="practice-input"
                    value={skill.name}
                    maxLength={40}
                    disabled={readOnly}
                    onChange={(event) =>
                      updateSkill(view.personId, skill.id, (target) => {
                        target.name = event.target.value;
                      })
                    }
                  />
                </div>
              </div>
              <div className="practice-manage-actions">
                <Button
                  variant="ghost"
                  onClick={() =>
                    setSkillArchived(view.personId, skill.id, !isArchived)
                  }
                  disabled={readOnly}
                >
                  {isArchived ? "Restore skill" : "Archive skill"}
                </Button>
              </div>
            </div>

            <div className="card">
              <h3>Identity</h3>
              <input
                type="text"
                className="practice-input"
                value={skill.identity ?? ""}
                placeholder="Describe who you are as you practice"
                maxLength={120}
                disabled={readOnly}
                onChange={(event) =>
                  updateSkill(view.personId, skill.id, (target) => {
                    target.identity = event.target.value;
                  })
                }
              />
            </div>

            <div className="card">
              <h3>This week</h3>
              <PracticeDots counts={weekCounts} size="lg" />
              <div className="summary-row practice-skill-summary">
                <div>
                  <div className="summary-label">Days practiced this week</div>
                  <div className="summary-value">{weekDaysPracticed}</div>
                </div>
                <div>
                  <div className="summary-label">Consistent weeks (3+ days)</div>
                  <div className="summary-value">{consistency}</div>
                </div>
                <div>
                  <div className="summary-label">Best week</div>
                  <div className="summary-value">{bestWeek} days</div>
                </div>
              </div>
            </div>

            <div className="card">
              <h3>Recent sessions</h3>
              {recentSessions.length === 0 ? (
                <div className="muted">No sessions yet.</div>
              ) : (
                <div className="practice-recent-list">
                  {recentSessions.map((entry) => (
                    <div key={entry.id} className="practice-recent-entry">
                      <span className="practice-recent-time">
                        {formatSessionDateTime(entry.createdAt)}
                      </span>
                      {entry.durationMinutes && (
                        <span className="practice-log-pill">
                          {entry.durationMinutes} min
                        </span>
                      )}
                      {entry.note && (
                        <span className="practice-log-note">
                          {entry.note}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <h3>Tiny Win</h3>
              <textarea
                className="textarea textarea-inline"
                value={skill.tinyWin}
                maxLength={80}
                disabled={readOnly}
                onChange={(event) =>
                  updateSkill(view.personId, skill.id, (target) => {
                    target.tinyWin = event.target.value;
                  })
                }
              />
            </div>

            <div className="card">
              <h3>Plan</h3>
              <textarea
                className="textarea textarea-inline"
                value={skill.plan ?? ""}
                placeholder="Optional plan to make this easier"
                maxLength={120}
                disabled={readOnly}
                onChange={(event) =>
                  updateSkill(view.personId, skill.id, (target) => {
                    target.plan = event.target.value;
                  })
                }
              />
            </div>

            <div className="card">
              <h3>Environment</h3>
              <div className="practice-env-list">
                {envItems.length === 0 && (
                  <div className="muted">No checklist items yet.</div>
                )}
                {envItems.map((item) => (
                  <div key={item.id} className="practice-env-item">
                    <input
                      type="checkbox"
                      checked={item.done}
                      disabled={readOnly}
                      onChange={(event) =>
                        updateSkill(view.personId, skill.id, (target) => {
                          const env = target.environment ?? [];
                          const entry = env.find((envItem) => envItem.id === item.id);
                          if (entry) {
                            entry.done = event.target.checked;
                          }
                        })
                      }
                    />
                    <input
                      type="text"
                      className="practice-input"
                      value={item.label}
                      maxLength={80}
                      disabled={readOnly}
                      onChange={(event) =>
                        updateSkill(view.personId, skill.id, (target) => {
                          const env = target.environment ?? [];
                          const entry = env.find((envItem) => envItem.id === item.id);
                          if (entry) {
                            entry.label = event.target.value;
                          }
                        })
                      }
                    />
                    <button
                      className="icon-btn"
                      onClick={() =>
                        updateSkill(view.personId, skill.id, (target) => {
                          target.environment = (target.environment ?? []).filter(
                            (envItem) => envItem.id !== item.id
                          );
                        })
                      }
                      disabled={readOnly}
                      aria-label="Remove"
                      title="Remove"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
              <div className="practice-env-actions">
                <Button
                  variant="ghost"
                  onClick={() =>
                    updateSkill(view.personId, skill.id, (target) => {
                      const env = target.environment ?? [];
                      if (env.length >= 10) {
                        return;
                      }
                      env.push({ id: createId(), label: "", done: false });
                      target.environment = env;
                    })
                  }
                  disabled={readOnly || envItems.length >= 10}
                >
                  Add checklist item
                </Button>
              </div>
            </div>
          </>
        );
      })()}

      {view.key === "manage" && (
        <>
          <div className="practice-subnav">
            <button className="link" onClick={() => setView({ key: "family" })}>
              Back to family
            </button>
            <div className="practice-subnav-title">Manage skills</div>
          </div>

          <div className="card">
            <div className="summary-label">Practice reminders</div>
            <div className="muted">
              Sent when no practice is logged today. Push notifications must be
              enabled on each device.
            </div>
            <div className="practice-label">Weekdays</div>
            <div>{formatReminderTimes(doc.reminders.weekdayTimes)}</div>
            <div className="practice-label">Weekends</div>
            <div>{formatReminderTimes(doc.reminders.weekendTimes)}</div>
            <div className="practice-label">Send reminders to</div>
            {doc.people.map((personId) => (
              <label key={`reminder-${personId}`} className="checkbox-row">
                <input
                  type="checkbox"
                  checked={Boolean(doc.reminders.enabledByPerson[personId])}
                  disabled={readOnly}
                  onChange={(event) =>
                    setReminderEnabled(personId, event.target.checked)
                  }
                />
                {personId}
              </label>
            ))}
          </div>

          {doc.people.map((personId) => {
            const skills = sortSkills(doc.skillsByPerson[personId] ?? []);
            const activeSkills = skills.filter((skill) => !skill.archivedAt);
            const archivedSkills = skills.filter((skill) => skill.archivedAt);
            const maxed = skills.length >= MAX_PRACTICE_SKILLS;
            return (
              <div key={`manage-${personId}`} className="card">
                <div className="practice-manage-header">
                  <div className="practice-person-name">{personId}</div>
                  <Button
                    variant="ghost"
                    onClick={() => addSkill(personId)}
                    disabled={readOnly || maxed}
                    title={maxed ? "Max 30 skills per person" : undefined}
                  >
                    Add skill
                  </Button>
                </div>

                {skills.length === 0 && (
                  <div className="muted">No skills yet.</div>
                )}

                {activeSkills.length > 0 && (
                  <div className="practice-manage-list">
                    {activeSkills.map((skill) => (
                      <div key={skill.id} className="practice-manage-item">
                        <div className="practice-manage-fields">
                          <div className="practice-field">
                            <span className="practice-field-label">Icon</span>
                            <input
                              type="text"
                              className="practice-input practice-input-sm"
                              value={skill.icon}
                              maxLength={8}
                              disabled={readOnly}
                              onChange={(event) =>
                                updateSkill(personId, skill.id, (target) => {
                                  target.icon = event.target.value;
                                })
                              }
                            />
                          </div>
                          <div className="practice-field">
                            <span className="practice-field-label">Name</span>
                            <input
                              type="text"
                              className="practice-input"
                              value={skill.name}
                              maxLength={40}
                              disabled={readOnly}
                              onChange={(event) =>
                                updateSkill(personId, skill.id, (target) => {
                                  target.name = event.target.value;
                                })
                              }
                            />
                          </div>
                        </div>
                        <div className="practice-manage-actions">
                          <button
                            className="link"
                            onClick={() => openSkill(personId, skill.id)}
                          >
                            Details
                          </button>
                          <button
                            className="link"
                            onClick={() => setSkillArchived(personId, skill.id, true)}
                            disabled={readOnly}
                          >
                            Archive
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {archivedSkills.length > 0 && (
                  <>
                    <div className="practice-archived-title">Archived</div>
                    <div className="practice-manage-list">
                      {archivedSkills.map((skill) => (
                        <div
                          key={skill.id}
                          className="practice-manage-item is-archived"
                        >
                          <div className="practice-manage-fields">
                            <div className="practice-field">
                              <span className="practice-field-label">Icon</span>
                              <input
                                type="text"
                                className="practice-input practice-input-sm"
                                value={skill.icon}
                                maxLength={8}
                                disabled={readOnly}
                                onChange={(event) =>
                                  updateSkill(personId, skill.id, (target) => {
                                    target.icon = event.target.value;
                                  })
                                }
                              />
                            </div>
                            <div className="practice-field">
                              <span className="practice-field-label">Name</span>
                              <input
                                type="text"
                                className="practice-input"
                                value={skill.name}
                                maxLength={40}
                                disabled={readOnly}
                                onChange={(event) =>
                                  updateSkill(personId, skill.id, (target) => {
                                    target.name = event.target.value;
                                  })
                                }
                              />
                            </div>
                          </div>
                          <div className="practice-manage-actions">
                            <button
                              className="link"
                              onClick={() => openSkill(personId, skill.id)}
                            >
                              Details
                            </button>
                            <button
                              className="link"
                              onClick={() =>
                                setSkillArchived(personId, skill.id, false)
                              }
                              disabled={readOnly}
                            >
                              Restore
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </>
      )}

      {view.key === "review" && (
        <>
          <div className="practice-subnav">
            <button className="link" onClick={() => setView({ key: "family" })}>
              Back to family
            </button>
            <div className="practice-subnav-title">Weekly Review</div>
          </div>

          <div className="card">
            <div className="summary-row">
              <div>
                <div className="summary-label">Family days practiced this week</div>
                <div className="summary-value">{familyDaysPracticed}</div>
              </div>
            </div>
            {familyBadge && (
              <div className="practice-badge">
                Everyone practiced at least once this week.
              </div>
            )}
          </div>

          {doc.people.map((personId) => {
            const review =
              doc.reviewsByWeekId[activeWeekId]?.[personId] ?? null;
            return (
              <div key={`review-${personId}`} className="card">
                <h3>{personId}</h3>
                <label className="practice-label">
                  What helped practice happen this week?
                </label>
                <textarea
                  className="textarea"
                  value={review?.helped ?? ""}
                  maxLength={500}
                  disabled={readOnly}
                  onChange={(event) =>
                    updateReview(personId, "helped", event.target.value)
                  }
                />
                <label className="practice-label">
                  What's one small tweak for next week?
                </label>
                <textarea
                  className="textarea"
                  value={review?.tweak ?? ""}
                  maxLength={500}
                  disabled={readOnly}
                  onChange={(event) =>
                    updateReview(personId, "tweak", event.target.value)
                  }
                />
              </div>
            );
          })}
        </>
      )}

      <Modal
        title="Practice updated elsewhere"
        open={conflict}
        onClose={onReload}
      >
        <p>Reload the latest version to continue.</p>
        <div className="modal-actions">
          <Button variant="ghost" onClick={onReload}>
            Reload latest
          </Button>
          <Button onClick={onRetrySave}>Try saving again</Button>
        </div>
      </Modal>
    </div>
  );
}
