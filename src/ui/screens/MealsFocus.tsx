import React from "react";
import { WeekDoc, PersonId, MealIdeasDoc } from "../../domain/types";

interface MealsFocusProps {
  week: WeekDoc;
  onUpdate: (mutator: (draft: WeekDoc) => void) => void;
  readOnly: boolean;
  mealIdeas: MealIdeasDoc | null;
  mealIdeasLoading: boolean;
  mealIdeasSaving: boolean;
  mealIdeasError: string | null;
  mealIdeasConflict: boolean;
  onReloadMealIdeas: () => void;
  onRetryMealIdeasSave: () => void;
  onUpdateMealIdeas: (mutator: (draft: MealIdeasDoc) => void) => void;
}

export default function MealsFocus({
  week,
  onUpdate,
  readOnly,
  mealIdeas,
  mealIdeasLoading,
  mealIdeasSaving,
  mealIdeasError,
  mealIdeasConflict,
  onReloadMealIdeas,
  onRetryMealIdeasSave,
  onUpdateMealIdeas,
}: MealsFocusProps) {
  const [newIdea, setNewIdea] = React.useState("");
  const ideaCount = mealIdeas?.ideas.length ?? 0;
  const ideasReady = ideaCount > 0;
  const focusEmpty = week.people.every((person) => !(week.focus[person] ?? "").trim());
  const focusComplete = week.people.every(
    (person) => (week.focus[person] ?? "").trim().length > 0
  );
  const eventsComplete = week.events.length > 0;
  const funComplete = week.events.some((event) => event.tag === "family");

  const ritualItems = [
    {
      key: "meals",
      label: "Meal ideas ready",
      done: ideasReady,
      helper: ideasReady
        ? "The bucket has some inspiration."
        : "Add a few meal ideas to the shared bucket.",
    },
    {
      key: "events",
      label: "Confirm key events",
      done: eventsComplete,
      helper: eventsComplete
        ? "Events are on the calendar."
        : "Add the key events for the week.",
    },
    {
      key: "focus",
      label: "Pick one focus per person",
      done: focusComplete,
      helper: focusComplete
        ? "Everyone has a focus."
        : "Add a short focus for each person.",
    },
    {
      key: "fun",
      label: "Decide one fun thing",
      done: funComplete,
      helper: funComplete
        ? "Family fun is on the calendar."
        : "Tag a family event as the fun thing.",
    },
  ];

  const handleAddIdea = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!mealIdeas || readOnly) {
      return;
    }
    const trimmed = newIdea.trim();
    if (!trimmed) {
      return;
    }
    const lower = trimmed.toLowerCase();
    const exists = mealIdeas.ideas.some(
      (idea) => idea.trim().toLowerCase() === lower
    );
    if (exists) {
      setNewIdea("");
      return;
    }
    onUpdateMealIdeas((draft) => {
      draft.ideas.push(trimmed);
    });
    setNewIdea("");
  };

  return (
    <div className="screen">
      <div className="card ritual-card">
        <div className="summary-label">One-minute weekly ritual</div>
        <div className="muted">Run this checklist on Sunday night.</div>
        <ul className="ritual-list">
          {ritualItems.map((item) => (
            <li
              key={item.key}
              className={`ritual-item${item.done ? " ritual-complete" : ""}`}
            >
              <span className="ritual-icon" aria-hidden="true">
                {item.done ? "✓" : "○"}
              </span>
              <div>
                <div className="ritual-title">{item.label}</div>
                <div className="ritual-helper muted">{item.helper}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h3>Meal ideas bucket</h3>
        {mealIdeasConflict && (
          <div className="banner">
            Meal ideas updated elsewhere.{" "}
            <button className="link" onClick={onReloadMealIdeas}>
              Reload
            </button>
            .
          </div>
        )}
        {mealIdeasError && (
          <div className="banner">
            Meal ideas error: {mealIdeasError}{" "}
            {mealIdeas && !mealIdeasLoading ? (
              <button className="link" onClick={onRetryMealIdeasSave}>
                Retry save
              </button>
            ) : (
              <button className="link" onClick={onReloadMealIdeas}>
                Retry load
              </button>
            )}
            .
          </div>
        )}
        {mealIdeasLoading && <div className="muted">Loading meal ideas...</div>}
        {!mealIdeasLoading && mealIdeas && mealIdeas.ideas.length === 0 && (
          <div className="muted">Add ideas so anyone can grab inspiration fast.</div>
        )}
        {!mealIdeasLoading && mealIdeas && mealIdeas.ideas.length > 0 && (
          <ul className="meal-ideas-list">
            {mealIdeas.ideas.map((idea, index) => (
              <li key={`meal-idea-${index}`} className="meal-ideas-row">
                <input
                  type="text"
                  value={idea}
                  maxLength={80}
                  onChange={(event) =>
                    onUpdateMealIdeas((draft) => {
                      draft.ideas[index] = event.target.value;
                    })
                  }
                  onBlur={(event) => {
                    const trimmed = event.target.value.trim();
                    if (!trimmed) {
                      onUpdateMealIdeas((draft) => {
                        draft.ideas.splice(index, 1);
                      });
                    } else if (trimmed !== event.target.value) {
                      onUpdateMealIdeas((draft) => {
                        draft.ideas[index] = trimmed;
                      });
                    }
                  }}
                  disabled={readOnly}
                />
                {!readOnly && (
                  <button
                    type="button"
                    className="link"
                    onClick={() =>
                      onUpdateMealIdeas((draft) => {
                        draft.ideas.splice(index, 1);
                      })
                    }
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {!readOnly && mealIdeas && (
          <form className="meal-ideas-add" onSubmit={handleAddIdea}>
            <input
              type="text"
              value={newIdea}
              maxLength={80}
              onChange={(event) => setNewIdea(event.target.value)}
              placeholder="Add a meal idea"
            />
            <button type="submit" disabled={!newIdea.trim()}>
              Add
            </button>
          </form>
        )}
        {mealIdeasSaving && <div className="muted">Saving meal ideas...</div>}
      </div>

      <div className="card">
        <h3>Weekly focus</h3>
        {focusEmpty && !readOnly && (
          <div className="muted">Add a short focus for each person.</div>
        )}
        <div className="grid">
          {week.people.map((person) => (
            <label key={person} className="grid-row">
              <span className="grid-label">{person}</span>
              <input
                type="text"
                value={week.focus[person] ?? ""}
                onChange={(event) =>
                  onUpdate((draft) => {
                    draft.focus[person as PersonId] = event.target.value;
                  })
                }
                disabled={readOnly}
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
