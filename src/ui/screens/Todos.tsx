import React from "react";
import { TodosDoc, TodoItem, PersonId, TodoStatus, Effort } from "../../domain/types";
import { createId } from "../../utils/id";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { getPersonColor } from "../utils/meta";

interface TodosProps {
  doc: TodosDoc;
  people: PersonId[];
  me: PersonId;
  onUpdate: (mutator: (draft: TodosDoc) => void) => void;
  readOnly: boolean;
  conflict?: boolean;
  saveError?: string | null;
  onReload?: () => void;
  onRetrySave?: () => void;
  importableCount?: number;
  onImportWeekTodos?: () => void;
}

type FilterKey = "all" | "mine" | "open";

type StatusGroup = {
  status: TodoStatus;
  label: string;
  todos: TodoItem[];
};

const STATUSES: TodoStatus[] = ["doing", "todo", "done"];
const STATUS_LABELS: Record<TodoStatus, string> = {
  todo: "To-do",
  doing: "Doing",
  done: "Done",
};
const EFFORTS: Effort[] = ["5m", "15m", "30m", "1h+"];

function sortTodos(a: TodoItem, b: TodoItem) {
  const aOrder = a.order ?? Number.MAX_SAFE_INTEGER;
  const bOrder = b.order ?? Number.MAX_SAFE_INTEGER;
  if (aOrder !== bOrder) {
    return aOrder - bOrder;
  }
  return a.title.localeCompare(b.title);
}

const emptyTodo = (owner: PersonId): TodoItem => ({
  id: "",
  title: "",
  owner,
  status: "todo",
  effort: undefined,
  order: undefined,
});

export default function Todos({
  doc,
  people,
  me,
  onUpdate,
  readOnly,
  conflict,
  saveError,
  onReload,
  onRetrySave,
  importableCount,
  onImportWeekTodos,
}: TodosProps) {
  const [filter, setFilter] = React.useState<FilterKey>("all");
  const [search, setSearch] = React.useState("");
  const [editing, setEditing] = React.useState<TodoItem | null>(null);
  const [quickOwner, setQuickOwner] = React.useState<PersonId>(me);
  const [quickTitle, setQuickTitle] = React.useState("");
  const [effortFilters, setEffortFilters] = React.useState<Effort[]>([]);
  const [collapsed, setCollapsed] = React.useState<Record<TodoStatus, boolean>>({
    todo: false,
    doing: false,
    done: true,
  });
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const touchStart = React.useRef<{ id: string; x: number; y: number } | null>(null);

  const canReorder =
    !readOnly && filter === "all" && !search.trim() && effortFilters.length === 0;

  const filteredTodos = React.useMemo(() => {
    const lowered = search.trim().toLowerCase();
    return doc.todos.filter((todo) => {
      if (filter === "mine" && todo.owner !== me) {
        return false;
      }
      if (filter === "open" && todo.status === "done") {
        return false;
      }
      if (effortFilters.length > 0 && (!todo.effort || !effortFilters.includes(todo.effort))) {
        return false;
      }
      if (lowered && !todo.title.toLowerCase().includes(lowered)) {
        return false;
      }
      return true;
    });
  }, [doc.todos, effortFilters, filter, me, search]);

  const groups = React.useMemo<StatusGroup[]>(() => {
    const statusList =
      filter === "open" ? STATUSES.filter((status) => status !== "done") : STATUSES;
    return statusList.map((status) => ({
      status,
      label: STATUS_LABELS[status],
      todos: filteredTodos.filter((todo) => todo.status === status).sort(sortTodos),
    }));
  }, [filteredTodos, filter]);

  const getNextOrder = (docValue: TodosDoc) => {
    const orders = docValue.todos
      .filter((todo) => Number.isInteger(todo.order))
      .map((todo) => todo.order as number);
    return orders.length > 0 ? Math.max(...orders) + 1 : 0;
  };

  const assignGlobalOrder = (draft: TodosDoc, ordered: TodoItem[]) => {
    ordered.forEach((todo, index) => {
      todo.order = index;
    });
    const remaining = draft.todos.filter((todo) => !ordered.includes(todo));
    if (remaining.length > 0) {
      remaining.forEach((todo, index) => {
        todo.order = ordered.length + index;
      });
    }
  };

  const reorderWithinStatus = (status: TodoStatus, fromId: string, toId: string) => {
    if (!canReorder) {
      return;
    }
    onUpdate((draft) => {
      const grouped = STATUSES.map((groupStatus) => ({
        status: groupStatus,
        todos: draft.todos
          .filter((todo) => todo.status === groupStatus)
          .sort(sortTodos),
      }));
      const target = grouped.find((group) => group.status === status);
      if (!target) {
        return;
      }
      const fromIndex = target.todos.findIndex((todo) => todo.id === fromId);
      const toIndex = target.todos.findIndex((todo) => todo.id === toId);
      if (fromIndex < 0 || toIndex < 0) {
        return;
      }
      const [moved] = target.todos.splice(fromIndex, 1);
      target.todos.splice(toIndex, 0, moved);
      const ordered = grouped.flatMap((group) => group.todos);
      assignGlobalOrder(draft, ordered);
    });
  };

  const updateStatus = (todo: TodoItem, status: TodoStatus) => {
    if (readOnly) {
      return;
    }
    onUpdate((draft) => {
      const target = draft.todos.find((item) => item.id === todo.id);
      if (target) {
        target.status = status;
      }
    });
  };

  const toggleDone = (todo: TodoItem) => {
    updateStatus(todo, todo.status === "done" ? "todo" : "done");
  };

  const markAllDone = () => {
    if (readOnly) {
      return;
    }
    onUpdate((draft) => {
      draft.todos.forEach((todo) => {
        todo.status = "done";
      });
    });
  };

  const clearCompleted = () => {
    if (readOnly) {
      return;
    }
    onUpdate((draft) => {
      draft.todos = draft.todos.filter((todo) => todo.status !== "done");
    });
  };

  const toggleEffortFilter = (effort: Effort) => {
    setEffortFilters((prev) =>
      prev.includes(effort) ? prev.filter((item) => item !== effort) : [...prev, effort]
    );
  };

  const startAdd = () => {
    if (readOnly) {
      return;
    }
    setEditing(emptyTodo(quickOwner));
  };

  const addQuick = () => {
    if (readOnly) {
      return;
    }
    const title = quickTitle.trim();
    if (!title) {
      return;
    }
    onUpdate((draft) => {
      draft.todos.push({
        id: createId(),
        title,
        owner: quickOwner,
        status: "todo",
        order: getNextOrder(draft),
      });
    });
    setQuickTitle("");
  };

  const saveTodo = () => {
    if (!editing) {
      return;
    }
    const trimmedTitle = editing.title.trim();
    if (!trimmedTitle) {
      return;
    }
    const todoToSave: TodoItem = {
      ...editing,
      id: editing.id || createId(),
      title: trimmedTitle,
    };
    onUpdate((draft) => {
      const index = draft.todos.findIndex((item) => item.id === todoToSave.id);
      if (index >= 0) {
        const existing = draft.todos[index];
        draft.todos[index] = {
          ...existing,
          ...todoToSave,
          order: existing.order ?? todoToSave.order,
        };
      } else {
        if (todoToSave.order === undefined) {
          todoToSave.order = getNextOrder(draft);
        }
        draft.todos.push(todoToSave);
      }
    });
    setQuickOwner(todoToSave.owner);
    setEditing(null);
  };

  const deleteTodo = (todoId: string) => {
    if (readOnly) {
      return;
    }
    onUpdate((draft) => {
      draft.todos = draft.todos.filter((todo) => todo.id !== todoId);
    });
  };

  React.useEffect(() => {
    if (!people.includes(quickOwner)) {
      setQuickOwner(me);
    }
  }, [me, people, quickOwner]);

  React.useEffect(() => {
    if (readOnly) {
      setEditing(null);
    }
  }, [readOnly]);

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>To-dos</h2>
        <Button className="share-hidden" onClick={startAdd} disabled={readOnly}>
          Add to-do
        </Button>
      </div>

      {conflict && (
        <div className="banner">
          Updated elsewhere. <button onClick={onReload}>Tap to reload.</button>
        </div>
      )}
      {saveError && (
        <div className="banner">
          Save failed: {saveError}{" "}
          <button className="link" onClick={onRetrySave}>
            Retry save
          </button>
          .
        </div>
      )}

      {!!importableCount && importableCount > 0 && (
        <div className="card">
          <div className="todo-import-row">
            <div>
              <div className="summary-label">Legacy week to-dos</div>
              <div className="muted">
                {importableCount} item{importableCount === 1 ? "" : "s"} available
              </div>
            </div>
            <Button
              className="share-hidden"
              onClick={onImportWeekTodos}
              disabled={readOnly}
            >
              Import week to-dos
            </Button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="filter-row">
          {(["all", "mine", "open"] as FilterKey[]).map((key) => (
            <button
              key={key}
              className={`pill${filter === key ? " pill-active" : ""}`}
              onClick={() => setFilter(key)}
            >
              {key}
            </button>
          ))}
          <button className="pill share-hidden" onClick={markAllDone} disabled={readOnly}>
            Mark all done
          </button>
          <button className="pill share-hidden" onClick={clearCompleted} disabled={readOnly}>
            Clear completed
          </button>
        </div>
        <div className="todo-filter-row">
          <input
            type="text"
            placeholder="Search to-dos"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="todo-effort-filters">
            {EFFORTS.map((effort) => (
              <button
                key={effort}
                className={`pill${effortFilters.includes(effort) ? " pill-active" : ""}`}
                onClick={() => toggleEffortFilter(effort)}
              >
                {effort}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card todo-quick-add">
        <div className="quick-add share-hidden">
          <input
            type="text"
            placeholder="Add a to-do"
            value={quickTitle}
            onChange={(event) => setQuickTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                addQuick();
              }
            }}
            disabled={readOnly}
          />
          <select
            value={quickOwner}
            onChange={(event) => setQuickOwner(event.target.value as PersonId)}
            disabled={readOnly}
          >
            {people.map((person) => (
              <option key={person} value={person}>
                {person}
              </option>
            ))}
          </select>
          <Button onClick={addQuick} disabled={readOnly}>
            Add
          </Button>
        </div>
        {!canReorder && !readOnly && (
          <div className="muted">
            Reorder is disabled while filters are active.
          </div>
        )}
      </div>

      {filteredTodos.length === 0 && (
        <div className="card">
          <div className="muted">
            No to-dos yet. Add something small to get started.
          </div>
        </div>
      )}

      {groups.map((group) => (
        <div key={group.status} className="card">
          <div className="day-header">
            <h3>
              {group.label} <span className="muted">({group.todos.length})</span>
            </h3>
            <button
              className="link collapse-toggle"
              onClick={() =>
                setCollapsed((prev) => ({
                  ...prev,
                  [group.status]: !prev[group.status],
                }))
              }
            >
              {collapsed[group.status] ? "Expand" : "Collapse"}
            </button>
          </div>
          <div className={`day-body${collapsed[group.status] ? " is-collapsed" : ""}`}>
            {group.todos.length === 0 && <div className="muted">No items.</div>}
            {group.todos.length > 0 && (
              <ul className="list">
                {group.todos.map((todo) => (
                  <li
                    key={todo.id}
                    className={`row todo-row${
                      todo.status === "done" ? " todo-row-done" : ""
                    }${draggingId === todo.id ? " row-dragging" : ""}`}
                    draggable={canReorder}
                    onDragStart={(event) => {
                      if (!canReorder) {
                        return;
                      }
                      event.dataTransfer.setData("text/plain", todo.id);
                      setDraggingId(todo.id);
                    }}
                    onDragOver={(event) => {
                      if (canReorder) {
                        event.preventDefault();
                      }
                    }}
                    onDrop={(event) => {
                      if (!canReorder) {
                        return;
                      }
                      event.preventDefault();
                      const fromId = event.dataTransfer.getData("text/plain");
                      if (fromId) {
                        reorderWithinStatus(group.status, fromId, todo.id);
                      }
                      setDraggingId(null);
                    }}
                    onDragEnd={() => setDraggingId(null)}
                    onTouchStart={(event) => {
                      const touch = event.touches[0];
                      touchStart.current = {
                        id: todo.id,
                        x: touch.clientX,
                        y: touch.clientY,
                      };
                    }}
                    onTouchEnd={(event) => {
                      if (readOnly) {
                        return;
                      }
                      const start = touchStart.current;
                      if (!start || start.id !== todo.id) {
                        return;
                      }
                      const touch = event.changedTouches[0];
                      const dx = touch.clientX - start.x;
                      const dy = touch.clientY - start.y;
                      touchStart.current = null;
                      if (Math.abs(dx) > 60 && Math.abs(dy) < 40) {
                        updateStatus(todo, dx > 0 ? "done" : "todo");
                      }
                    }}
                  >
                    <div>
                      <div className="row-title">
                        <span
                          className={`complete-dot${
                            todo.status === "done" ? " complete-dot-on" : ""
                          }`}
                          aria-hidden="true"
                        />
                        <span
                          className={`row-title-text${
                            todo.status === "done" ? " row-title-text-done" : ""
                          }`}
                        >
                          {todo.title}
                        </span>
                      </div>
                      <div className="row-meta">
                        <div className="meta-chips">
                          <span className="meta-chip">
                            <span
                              className="meta-dot"
                              style={{ backgroundColor: getPersonColor(todo.owner) }}
                            />
                            {todo.owner}
                          </span>
                          {todo.effort && (
                            <span className="meta-chip meta-chip-plain">{todo.effort}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="row-actions share-hidden">
                      {todo.status === "todo" && (
                        <button
                          className="link"
                          onClick={() => updateStatus(todo, "doing")}
                          disabled={readOnly}
                        >
                          Start
                        </button>
                      )}
                      <button
                        className="link"
                        onClick={() => toggleDone(todo)}
                        disabled={readOnly}
                      >
                        {todo.status === "done" ? "Undo" : "Complete"}
                      </button>
                      <button
                        className="link"
                        onClick={() => {
                          setEditing({ ...todo });
                        }}
                        disabled={readOnly}
                      >
                        Edit
                      </button>
                      <button
                        className="link danger"
                        onClick={() => deleteTodo(todo.id)}
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
        title={editing?.id ? "Edit to-do" : "Add to-do"}
        open={!!editing}
        onClose={() => {
          setEditing(null);
        }}
      >
        {editing && (
          <form
            className="form"
            onSubmit={(event) => {
              event.preventDefault();
              saveTodo();
            }}
          >
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
              Owner
              <select
                value={editing.owner}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    owner: event.target.value as PersonId,
                  })
                }
              >
                {people.map((person) => (
                  <option key={person} value={person}>
                    {person}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select
                value={editing.status}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    status: event.target.value as TodoStatus,
                  })
                }
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Effort
              <select
                value={editing.effort ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  setEditing({
                    ...editing,
                    effort: value ? (value as Effort) : undefined,
                  });
                }}
              >
                <option value="">Unspecified</option>
                {EFFORTS.map((effort) => (
                  <option key={effort} value={effort}>
                    {effort}
                  </option>
                ))}
              </select>
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
