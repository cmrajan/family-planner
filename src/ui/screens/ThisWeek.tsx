import React from "react";
import {
  WeekDoc,
  PlannerEvent,
  TodoItem,
  PersonId,
  SchoolDatesDocument,
  BinCollectionsDoc,
  MealIdeasDoc,
} from "../../domain/types";
import { DAY_LABELS, TIMEZONE, getCurrentDayIndex, getCurrentWeekId } from "../../domain/week";
import {
  SCHOOL_TYPE_LABELS,
  flattenSchoolItems,
  formatWeekRangeLabel,
  getWeekDateRange,
  intersectsRange,
  sortByStartDate,
} from "../../utils/schoolDates";
import {
  formatBinDayLabel,
  formatServiceLabel,
  getServiceIcon,
  getGroupsInRange,
} from "../../utils/binCollections";

interface ThisWeekProps {
  week: WeekDoc;
  todos: TodoItem[];
  me: PersonId;
  onUpdate: (mutator: (draft: WeekDoc) => void) => void;
  readOnly: boolean;
  schoolDates: SchoolDatesDocument | null;
  onOpenSchoolDates: () => void;
  binCollections: BinCollectionsDoc | null;
  onOpenBinCollections: () => void;
  mealIdeas: MealIdeasDoc | null;
  onOpenMealIdeas: () => void;
}

function sortEvents(a: PlannerEvent, b: PlannerEvent) {
  if (a.day !== b.day) {
    return a.day - b.day;
  }
  const at = a.time ?? "";
  const bt = b.time ?? "";
  if (at !== bt) {
    return at.localeCompare(bt);
  }
  if (a.order !== undefined || b.order !== undefined) {
    const ao = a.order ?? Number.MAX_SAFE_INTEGER;
    const bo = b.order ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) {
      return ao - bo;
    }
  }
  return a.title.localeCompare(b.title);
}

function isOpenTodo(todo: TodoItem) {
  return todo.status !== "done";
}

function sortTodosByOrder(a: TodoItem, b: TodoItem) {
  if (a.order !== undefined || b.order !== undefined) {
    const ao = a.order ?? Number.MAX_SAFE_INTEGER;
    const bo = b.order ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) {
      return ao - bo;
    }
  }
  return a.title.localeCompare(b.title);
}

function pickRandomIdeas(ideas: string[], count: number): string[] {
  const pool = ideas.filter((idea) => idea.trim());
  if (pool.length <= count) {
    return pool;
  }
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

export default function ThisWeek({
  week,
  todos,
  me,
  onUpdate,
  readOnly,
  schoolDates,
  onOpenSchoolDates,
  binCollections,
  onOpenBinCollections,
  mealIdeas,
  onOpenMealIdeas,
}: ThisWeekProps) {
  const notesRef = React.useRef<HTMLTextAreaElement | null>(null);
  const openTodos = todos.filter(isOpenTodo).sort(sortTodosByOrder);
  const todayIndex = getCurrentDayIndex();
  const isCurrentWeek = week.weekId === getCurrentWeekId();
  const sortedEvents = [...week.events].sort(sortEvents);
  const pastEvents = isCurrentWeek
    ? sortedEvents.filter((event) => event.day < todayIndex)
    : [];
  const upcomingEvents = isCurrentWeek
    ? sortedEvents.filter((event) => event.day >= todayIndex)
    : sortedEvents;
  const myOpenTodos = openTodos.filter((todo) => todo.owner === me);
  const relevantTodos = myOpenTodos.length > 0 ? myOpenTodos : openTodos;
  const completedTodos = todos
    .filter((todo) => todo.status === "done")
    .sort(sortTodosByOrder);
  const myCompletedTodos = completedTodos.filter((todo) => todo.owner === me);
  const relevantCompleted = myCompletedTodos.length > 0 ? myCompletedTodos : completedTodos;
  const showCompletedOwners = myCompletedTodos.length === 0;
  const completedList = [...relevantCompleted].sort(sortTodosByOrder);
  const upcoming = [
    ...upcomingEvents.map((event) => ({
      id: event.id,
      day: event.day,
      time: event.time ?? "",
      title: event.title,
      location: event.location,
    })),
  ]
    .sort((a, b) => {
      if (a.day !== b.day) {
        return a.day - b.day;
      }
      if (a.time !== b.time) {
        return a.time.localeCompare(b.time);
      }
      return a.title.localeCompare(b.title);
    })
    .slice(0, 5);
  const openPreview = relevantTodos.slice(0, 3);
  const openRemaining = relevantTodos.length - openPreview.length;
  const showOwners = myOpenTodos.length === 0;
  const schoolWeekRange = React.useMemo(
    () => (schoolDates ? getWeekDateRange(week.weekId, schoolDates.timezone) : null),
    [schoolDates, week.weekId]
  );
  const schoolWeekItems = React.useMemo(() => {
    if (!schoolDates || !schoolWeekRange) {
      return [];
    }
    return flattenSchoolItems(schoolDates)
      .filter((item) =>
        intersectsRange(item, schoolWeekRange.startDate, schoolWeekRange.endDate)
      )
      .sort(sortByStartDate);
  }, [schoolDates, schoolWeekRange]);
  const schoolPreview = schoolWeekItems.slice(0, 3);
  const schoolRemaining = schoolWeekItems.length - schoolPreview.length;
  const binWeekRange = React.useMemo(
    () => getWeekDateRange(week.weekId, TIMEZONE),
    [week.weekId]
  );
  const binWeekGroups = React.useMemo(() => {
    if (!binCollections || !binWeekRange) {
      return [];
    }
    return getGroupsInRange(binCollections, binWeekRange.startDate, binWeekRange.endDate);
  }, [binCollections, binWeekRange]);
  const binPreview = binWeekGroups.slice(0, 3);
  const binRemaining = binWeekGroups.length - binPreview.length;
  const mealsEmpty = DAY_LABELS.every(
    (_, idx) => !(week.meals[String(idx)] ?? "").trim()
  );
  const [mealIdeasSeed, setMealIdeasSeed] = React.useState(0);
  const mealIdeasPreview = React.useMemo(() => {
    if (!mealIdeas || !mealsEmpty) {
      return [];
    }
    return pickRandomIdeas(mealIdeas.ideas, 3);
  }, [mealIdeas?.updatedAt, mealIdeas?.ideas, mealsEmpty, mealIdeasSeed]);

  const resizeNotes = React.useCallback(() => {
    const textarea = notesRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "auto";
    const nextHeight = Math.max(textarea.scrollHeight, 44);
    textarea.style.height = `${nextHeight}px`;
  }, []);

  React.useEffect(() => {
    resizeNotes();
  }, [week.notes, resizeNotes]);

  const handleNotesChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    onUpdate((draft) => {
      draft.notes = value;
    });
    requestAnimationFrame(resizeNotes);
  };

  return (
    <div className="screen">
      <div className="card">
        <div className="summary-row">
          <div>
            <div className="summary-label">Events</div>
            <div className="summary-value">{week.events.length}</div>
          </div>
          <div>
            <div className="summary-label">Open to-dos</div>
            <div className="summary-value">{openTodos.length}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Notes</h3>
        <textarea
          ref={notesRef}
          className="textarea textarea-inline"
          value={week.notes}
          onChange={handleNotesChange}
          disabled={readOnly}
          rows={1}
          placeholder="Add quick notes or reminders for the week."
        />
      </div>

      {pastEvents.length > 0 && (
        <div className="card">
          <h3>What happened so far this week</h3>
          <ul className="list">
            {pastEvents.map((event) => (
              <li key={event.id} className="list-row">
                <span className="item-day">{DAY_LABELS[event.day]}</span>
                <span className="row-time">{event.time ? event.time : "All day"}</span>
                <span className="meta-text">—</span>
                <span className="row-title-text">{event.title}</span>
                {event.location && (
                  <span className="meta-text">@ {event.location}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {schoolWeekItems.length > 0 && schoolWeekRange && (
        <div className="card">
          <h3>School this week</h3>
          <ul className="list">
            {schoolPreview.map((item) => (
              <li key={item.id} className="list-row">
                <span className="item-day">
                  {formatWeekRangeLabel(
                    item,
                    schoolWeekRange.startDate,
                    schoolWeekRange.endDate,
                    schoolDates?.timezone ?? "Europe/London"
                  )}
                </span>
                <span className="meta-text">—</span>
                <span className="row-title-text">{item.label}</span>
                <span className="badge badge-compact">
                  {SCHOOL_TYPE_LABELS[item.type]}
                </span>
              </li>
            ))}
          </ul>
          {schoolRemaining > 0 && (
            <button className="link" onClick={onOpenSchoolDates}>
              + {schoolRemaining} more
            </button>
          )}
        </div>
      )}

      {binWeekGroups.length > 0 && (
        <div className="card">
          <h3>Bins this week</h3>
          <ul className="list">
            {binPreview.map((group) => (
              <li key={group.date} className="list-row">
                <span className="item-day">{formatBinDayLabel(group.date)}</span>
                <span className="meta-text">—</span>
                <span className="row-title-text bin-inline-list">
                  {group.events.map((event, index) => {
                    const icon = getServiceIcon(event);
                    return (
                      <span key={`${event.serviceId}-${index}`} className="bin-inline-item">
                        <span>{formatServiceLabel(event)}</span>
                        {icon ? (
                          <img className="bin-icon" src={icon.src} alt={icon.alt} />
                        ) : null}
                      </span>
                    );
                  })}
                </span>
              </li>
            ))}
          </ul>
          {binRemaining > 0 && (
            <button className="link" onClick={onOpenBinCollections}>
              + {binRemaining} more
            </button>
          )}
        </div>
      )}

      <div className="card">
        <h3>Next up</h3>
        {upcoming.length === 0 ? (
          <div className="muted">Nothing scheduled yet.</div>
        ) : (
          <ul className="list">
            {upcoming.map((item) => (
              <li key={item.id} className="list-row">
                <span className="item-day">{DAY_LABELS[item.day]}</span>
                {isCurrentWeek && item.day === todayIndex && (
                  <span className="today-chip">Today</span>
                )}
                <span className="row-time">
                  {item.time ? item.time : "All day"}
                </span>
                <span className="meta-text">—</span>
                <span className="row-title-text">{item.title}</span>
                {item.location && (
                  <span className="meta-text">@ {item.location}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {openPreview.length > 0 && (
          <div className="next-up-anytime">
            <div className="summary-label">Open to-dos</div>
            <ul className="list">
              {openPreview.map((todo) => (
                <li key={todo.id}>
                  <span className="row-title-text">{todo.title}</span>
                  {showOwners && <span className="meta-text">({todo.owner})</span>}
                </li>
              ))}
            </ul>
            {openRemaining > 0 && (
              <div className="muted">+{openRemaining} more open to-dos.</div>
            )}
          </div>
        )}
      </div>

      {mealsEmpty && mealIdeasPreview.length > 0 && (
        <div className="card">
          <div className="meal-ideas-header">
            <h3>Meal ideas</h3>
            <button
              className="link"
              onClick={() => setMealIdeasSeed((prev) => prev + 1)}
            >
              Shuffle ideas
            </button>
      </div>
      <div className="muted">We have no plan — pick one.</div>
      <div className="meal-ideas-preview">
        {mealIdeasPreview.map((idea, index) => (
          <span key={`meal-idea-preview-${index}`} className="meal-idea-chip">
                {idea}
              </span>
            ))}
          </div>
          <button className="link" onClick={onOpenMealIdeas}>
            Open the meal ideas bucket
          </button>
        </div>
      )}

      {completedList.length > 0 && (
        <div className="card">
          <h3>Completed to-dos</h3>
          <ul className="list">
            {completedList.map((todo) => (
              <li key={todo.id} className="list-row">
                <span className="badge badge-compact">Done</span>
                <span className="row-title-text row-title-text-done">{todo.title}</span>
                {showCompletedOwners && <span className="meta-text">({todo.owner})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
