import React from "react";
import {
  fetchCurrentWeek,
  fetchBinCollections,
  fetchMealIdeas,
  fetchPractice,
  fetchSchoolDates,
  fetchTodos,
  fetchWeek,
  putPractice,
  putTodos,
  putWeek,
  putMealIdeas,
  refreshBinCollections as refreshBinCollectionsApi,
  refreshSchoolDates as refreshSchoolDatesApi,
  rolloverWeekWithOptions,
} from "../api/client";
import {
  WeekDoc,
  PersonId,
  PlannerEvent,
  ViewerInfo,
  SchoolDatesDocument,
  BinCollectionsDoc,
  MealIdeasDoc,
  PracticeDoc,
  TodosDoc,
} from "../domain/types";
import {
  getCurrentDayIndex,
  getCurrentWeekId,
  nextWeekId,
  parseWeekId,
  shiftWeekId,
} from "../domain/week";
import { cloneDeep } from "../utils/clone";
import { debounce } from "../utils/debounce";
import { createId } from "../utils/id";
import Button from "../ui/components/Button";
import Modal from "../ui/components/Modal";
import NotificationsModal from "../ui/components/NotificationsModal";
import Tabs, { TabKey } from "../ui/components/Tabs";
import UniversalAddFab from "../ui/components/UniversalAddFab";
import ThisWeek from "../ui/screens/ThisWeek";
import Calendar from "../ui/screens/Calendar";
import Events from "../ui/screens/Events";
import Todos from "../ui/screens/Todos";
import MealsFocus from "../ui/screens/MealsFocus";
import SchoolDates, { SchoolDatesRefreshNotice } from "../ui/screens/SchoolDates";
import BinCollections, { BinCollectionsRefreshNotice } from "../ui/screens/BinCollections";
import Digest from "../ui/screens/Digest";
import Backup from "../ui/screens/Backup";
import Practice from "../ui/practice/Practice";

const ME_KEY = "family-planner:me";
const SCHOOL_OVERLAY_KEY = "family-planner:school-overlay";
const BIN_OVERLAY_KEY = "family-planner:bin-overlay";
const DEFAULT_SCHOOL = "example-school";
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function loadMe(): PersonId {
  const stored = localStorage.getItem(ME_KEY) as PersonId | null;
  return stored ?? "mum";
}

function saveMe(me: PersonId) {
  localStorage.setItem(ME_KEY, me);
}

function loadSchoolOverlay(): boolean {
  return localStorage.getItem(SCHOOL_OVERLAY_KEY) === "1";
}

function saveSchoolOverlay(value: boolean) {
  localStorage.setItem(SCHOOL_OVERLAY_KEY, value ? "1" : "0");
}

function loadBinOverlay(): boolean {
  return localStorage.getItem(BIN_OVERLAY_KEY) === "1";
}

function saveBinOverlay(value: boolean) {
  localStorage.setItem(BIN_OVERLAY_KEY, value ? "1" : "0");
}

export default function App() {
  const [week, setWeek] = React.useState<WeekDoc | null>(null);
  const [tab, setTab] = React.useState<TabKey>("this-week");
  const [me, setMe] = React.useState<PersonId>(() => loadMe());
  const [viewer, setViewer] = React.useState<ViewerInfo | null>(null);
  const [conflict, setConflict] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [schoolLoading, setSchoolLoading] = React.useState(true);
  const [schoolError, setSchoolError] = React.useState<string | null>(null);
  const [schoolDates, setSchoolDates] = React.useState<SchoolDatesDocument | null>(
    null
  );
  const [schoolRefreshing, setSchoolRefreshing] = React.useState(false);
  const [schoolRefreshNotice, setSchoolRefreshNotice] =
    React.useState<SchoolDatesRefreshNotice | null>(null);
  const [binLoading, setBinLoading] = React.useState(true);
  const [binError, setBinError] = React.useState<string | null>(null);
  const [binCollections, setBinCollections] =
    React.useState<BinCollectionsDoc | null>(null);
  const [binRefreshing, setBinRefreshing] = React.useState(false);
  const [binRefreshNotice, setBinRefreshNotice] =
    React.useState<BinCollectionsRefreshNotice | null>(null);
  const [mealIdeas, setMealIdeas] = React.useState<MealIdeasDoc | null>(null);
  const [mealIdeasLoading, setMealIdeasLoading] = React.useState(true);
  const [mealIdeasSaving, setMealIdeasSaving] = React.useState(false);
  const [mealIdeasError, setMealIdeasError] = React.useState<string | null>(null);
  const [mealIdeasConflict, setMealIdeasConflict] = React.useState(false);
  const [todosDoc, setTodosDoc] = React.useState<TodosDoc | null>(null);
  const [todosLoading, setTodosLoading] = React.useState(true);
  const [todosSaving, setTodosSaving] = React.useState(false);
  const [todosError, setTodosError] = React.useState<string | null>(null);
  const [todosConflict, setTodosConflict] = React.useState(false);
  const [practiceDoc, setPracticeDoc] = React.useState<PracticeDoc | null>(null);
  const [practiceLoading, setPracticeLoading] = React.useState(false);
  const [practiceError, setPracticeError] = React.useState<string | null>(null);
  const [practiceSaving, setPracticeSaving] = React.useState(false);
  const [practiceConflict, setPracticeConflict] = React.useState(false);
  const [practiceSaveError, setPracticeSaveError] = React.useState<string | null>(
    null
  );
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [readOnly, setReadOnly] = React.useState(false);
  const [shareView, setShareView] = React.useState(false);
  const [digestWeek, setDigestWeek] = React.useState<WeekDoc | null>(null);
  const [digestNextWeek, setDigestNextWeek] = React.useState<WeekDoc | null>(null);
  const [digestLoading, setDigestLoading] = React.useState(false);
  const [digestError, setDigestError] = React.useState<string | null>(null);
  const [digestNextLoading, setDigestNextLoading] = React.useState(false);
  const [digestNextError, setDigestNextError] = React.useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [carryOptions, setCarryOptions] = React.useState({
    carryFocus: false,
    carryRecurring: false,
  });
  const [repeatNotice, setRepeatNotice] = React.useState<string | null>(null);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [notificationsOpen, setNotificationsOpen] = React.useState(false);
  const [quickWeeksOpen, setQuickWeeksOpen] = React.useState(false);
  const [backupPrevTab, setBackupPrevTab] = React.useState<TabKey>("this-week");
  const [schoolOverlay, setSchoolOverlay] = React.useState<boolean>(() =>
    loadSchoolOverlay()
  );
  const [binOverlay, setBinOverlay] = React.useState<boolean>(() => loadBinOverlay());
  const [scrollTarget, setScrollTarget] = React.useState<{
    tab: TabKey;
    day: number;
  } | null>(null);
  const moreMenuRef = React.useRef<HTMLDivElement | null>(null);
  const lastSaveAttempt = React.useRef<WeekDoc | null>(null);
  const lastMealIdeasSaveAttempt = React.useRef<MealIdeasDoc | null>(null);
  const lastTodosSaveAttempt = React.useRef<TodosDoc | null>(null);
  const lastPracticeSaveAttempt = React.useRef<PracticeDoc | null>(null);
  const scrollPositions = React.useRef<Record<TabKey, number>>({
    "this-week": 0,
    practice: 0,
    digest: 0,
    calendar: 0,
    events: 0,
    todos: 0,
    meals: 0,
    "bin-collections": 0,
    "school-dates": 0,
    backup: 0,
  });

  React.useEffect(() => {
    let active = true;
    fetchCurrentWeek()
      .then((data) => {
        if (!active) {
          return;
        }
        setWeek(data.week);
        setReadOnly(data.readOnly);
        setViewer(data.viewer ?? null);
        if (data.viewer?.personId && data.week.people.includes(data.viewer.personId)) {
          setMe(data.viewer.personId);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    let active = true;
    setSchoolLoading(true);
    fetchSchoolDates(DEFAULT_SCHOOL)
      .then((data) => {
        if (!active) {
          return;
        }
        setSchoolDates(data);
        setSchoolError(null);
        setSchoolLoading(false);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setSchoolError("Unable to load school dates.");
        setSchoolLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    let active = true;
    setBinLoading(true);
    fetchBinCollections()
      .then((data) => {
        if (!active) {
          return;
        }
        setBinCollections(data);
        setBinError(null);
        setBinLoading(false);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setBinError("Unable to load bin collections.");
        setBinLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    let active = true;
    setMealIdeasLoading(true);
    fetchMealIdeas()
      .then((data) => {
        if (!active) {
          return;
        }
        setMealIdeas(data);
        setMealIdeasError(null);
        setMealIdeasLoading(false);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setMealIdeasError("Unable to load meal ideas.");
        setMealIdeasLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    let active = true;
    setTodosLoading(true);
    fetchTodos()
      .then((data) => {
        if (!active) {
          return;
        }
        setTodosDoc(data.doc);
        setTodosError(null);
        setTodosConflict(false);
        setTodosLoading(false);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setTodosError("Unable to load to-dos.");
        setTodosLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    if (tab !== "practice" || practiceDoc || practiceError) {
      return;
    }
    let active = true;
    setPracticeLoading(true);
    fetchPractice()
      .then((doc) => {
        if (!active) {
          return;
        }
        setPracticeDoc(doc);
        setPracticeError(null);
        setPracticeConflict(false);
        setPracticeSaveError(null);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setPracticeError("Unable to load practice.");
      })
      .finally(() => {
        if (!active) {
          return;
        }
        setPracticeLoading(false);
      });
    return () => {
      active = false;
    };
  }, [practiceDoc, practiceError, tab]);

  const refreshSchoolDatesNow = React.useCallback(async () => {
    if (schoolRefreshing) {
      return;
    }
    setSchoolRefreshNotice(null);
    setSchoolRefreshing(true);
    try {
      const result = await refreshSchoolDatesApi(DEFAULT_SCHOOL);
      const latest = await fetchSchoolDates(DEFAULT_SCHOOL);
      setSchoolDates(latest);
      setSchoolError(null);
      const timestamp =
        result.fetchedAt && !Number.isNaN(new Date(result.fetchedAt).getTime())
          ? new Intl.DateTimeFormat("en-GB", {
              timeZone: "Europe/London",
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(result.fetchedAt))
          : null;
      const message = result.updated
        ? `Refreshed${timestamp ? ` at ${timestamp}` : ""}.`
        : "No changes found.";
      setSchoolRefreshNotice({ message, tone: "info" });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to refresh school dates.";
      setSchoolRefreshNotice({ message, tone: "error" });
    } finally {
      setSchoolRefreshing(false);
    }
  }, [schoolRefreshing]);

  const refreshBinCollectionsNow = React.useCallback(async () => {
    if (binRefreshing) {
      return;
    }
    setBinRefreshNotice(null);
    setBinRefreshing(true);
    try {
      const result = await refreshBinCollectionsApi();
      if (result.doc) {
        setBinCollections(result.doc);
      } else {
        const latest = await fetchBinCollections();
        setBinCollections(latest);
      }
      setBinError(null);
      const message = result.changed ? "Refreshed." : "No changes found.";
      setBinRefreshNotice({ message, tone: "info" });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to refresh bin collections.";
      setBinRefreshNotice({ message, tone: "error" });
    } finally {
      setBinRefreshing(false);
    }
  }, [binRefreshing]);

  React.useEffect(() => {
    if (!week) {
      return;
    }
    if (!week.people.includes(me)) {
      setMe(week.people[0]);
    }
  }, [week, me]);

  React.useEffect(() => {
    let active = true;
    const currentWeekId = getCurrentWeekId();
    if (!week) {
      setDigestWeek(null);
      setDigestLoading(true);
      return () => {
        active = false;
      };
    }
    if (week && week.weekId === currentWeekId) {
      setDigestWeek(week);
      setDigestLoading(false);
      setDigestError(null);
      return () => {
        active = false;
      };
    }
    setDigestLoading(true);
    setDigestError(null);
    fetchCurrentWeek()
      .then((data) => {
        if (!active) {
          return;
        }
        setDigestWeek(data.week);
        setDigestLoading(false);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setDigestError("Unable to load digest week.");
        setDigestLoading(false);
      });
    return () => {
      active = false;
    };
  }, [week]);

  React.useEffect(() => {
    let active = true;
    const todayIndex = getCurrentDayIndex();
    if (!digestWeek || todayIndex === 0) {
      setDigestNextWeek(null);
      setDigestNextLoading(false);
      setDigestNextError(null);
      return () => {
        active = false;
      };
    }
    const targetWeekId = nextWeekId(digestWeek.weekId);
    if (digestNextWeek?.weekId === targetWeekId) {
      return () => {
        active = false;
      };
    }
    setDigestNextLoading(true);
    setDigestNextError(null);
    fetchWeek(targetWeekId)
      .then((data) => {
        if (!active) {
          return;
        }
        setDigestNextWeek(data.week);
        setDigestNextLoading(false);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setDigestNextWeek(null);
        setDigestNextError("Unable to load next week.");
        setDigestNextLoading(false);
      });
    return () => {
      active = false;
    };
  }, [digestWeek, digestNextWeek?.weekId]);

  React.useEffect(() => {
    saveMe(me);
  }, [me]);

  React.useEffect(() => {
    saveSchoolOverlay(schoolOverlay);
  }, [schoolOverlay]);

  React.useEffect(() => {
    saveBinOverlay(binOverlay);
  }, [binOverlay]);

  React.useEffect(() => {
    if (!moreOpen) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      if (!moreMenuRef.current) {
        return;
      }
      if (!moreMenuRef.current.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
    };
  }, [moreOpen]);

  React.useEffect(() => {
    if (!repeatNotice) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setRepeatNotice(null);
    }, 4000);
    return () => window.clearTimeout(timeout);
  }, [repeatNotice]);

  React.useEffect(() => {
    if (!archiveOpen) {
      return;
    }
    setCarryOptions({
      carryFocus: false,
      carryRecurring: false,
    });
  }, [archiveOpen]);

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
      lastSaveAttempt.current = doc;
      setSaving(true);
      putWeek(doc)
        .then((updated) => {
          setWeek((prev) => {
            if (!prev || prev.version !== doc.version) {
              return prev;
            }
            return {
              ...prev,
              version: updated.version,
              updatedAt: updated.updatedAt,
            };
          });
          setConflict(false);
          setSaveError(null);
          setSaving(false);
        })
        .catch((error: { status?: number; code?: string; message?: string }) => {
          if (error.status === 409 || error.code === "VERSION_CONFLICT") {
            setConflict(true);
          } else if (error.status === 403 || error.code === "ARCHIVED_READONLY") {
            setReadOnly(true);
          } else {
            setSaveError(formatSaveError(error));
          }
          setSaving(false);
        });
    },
    [formatSaveError]
  );

  const saveMealIdeas = React.useCallback(
    (doc: MealIdeasDoc) => {
      lastMealIdeasSaveAttempt.current = doc;
      setMealIdeasSaving(true);
      putMealIdeas(doc)
        .then((updated) => {
          setMealIdeas((prev) => {
            if (!prev || prev.version !== doc.version) {
              return prev;
            }
            return {
              ...prev,
              version: updated.version,
              updatedAt: updated.updatedAt,
            };
          });
          setMealIdeasConflict(false);
          setMealIdeasError(null);
          setMealIdeasSaving(false);
        })
        .catch((error: { status?: number; code?: string; message?: string }) => {
          if (error.status === 409 || error.code === "VERSION_CONFLICT") {
            setMealIdeasConflict(true);
          } else {
            setMealIdeasError(formatSaveError(error));
          }
          setMealIdeasSaving(false);
      });
    },
    [formatSaveError]
  );

  const saveTodos = React.useCallback(
    (doc: TodosDoc) => {
      lastTodosSaveAttempt.current = doc;
      setTodosSaving(true);
      putTodos(doc)
        .then((updated) => {
          setTodosDoc((prev) => {
            if (!prev || prev.version !== doc.version) {
              return prev;
            }
            return {
              ...prev,
              version: updated.version,
              updatedAt: updated.updatedAt,
            };
          });
          setTodosConflict(false);
          setTodosError(null);
          setTodosSaving(false);
        })
        .catch((error: { status?: number; code?: string; message?: string }) => {
          if (error.status === 409 || error.code === "VERSION_CONFLICT") {
            setTodosConflict(true);
          } else {
            setTodosError(formatSaveError(error));
          }
          setTodosSaving(false);
        });
    },
    [formatSaveError]
  );

  const savePractice = React.useCallback(
    (doc: PracticeDoc) => {
      lastPracticeSaveAttempt.current = doc;
      setPracticeSaving(true);
      putPractice(doc)
        .then((updated) => {
          setPracticeDoc((prev) => {
            if (!prev || prev.version !== doc.version) {
              return prev;
            }
            return {
              ...prev,
              version: updated.version,
              updatedAt: updated.updatedAt,
            };
          });
          setPracticeConflict(false);
          setPracticeSaveError(null);
          setPracticeSaving(false);
        })
        .catch((error: { status?: number; code?: string; message?: string }) => {
          if (error.status === 409 || error.code === "VERSION_CONFLICT") {
            setPracticeConflict(true);
            setPracticeSaveError(null);
          } else {
            setPracticeSaveError(formatSaveError(error));
          }
          setPracticeSaving(false);
        });
    },
    [formatSaveError]
  );

  const retrySave = React.useCallback(() => {
    if (!lastSaveAttempt.current) {
      return;
    }
    saveWeek(lastSaveAttempt.current);
  }, [saveWeek]);

  const retryMealIdeasSave = React.useCallback(() => {
    if (!lastMealIdeasSaveAttempt.current) {
      return;
    }
    saveMealIdeas(lastMealIdeasSaveAttempt.current);
  }, [saveMealIdeas]);

  const retryTodosSave = React.useCallback(() => {
    if (!lastTodosSaveAttempt.current) {
      return;
    }
    saveTodos(lastTodosSaveAttempt.current);
  }, [saveTodos]);

  const retryPracticeSave = React.useCallback(() => {
    if (!lastPracticeSaveAttempt.current) {
      return;
    }
    savePractice(lastPracticeSaveAttempt.current);
  }, [savePractice]);

  const debouncedSave = React.useMemo(
    () =>
      debounce((doc: WeekDoc) => {
        saveWeek(doc);
      }, 800),
    [saveWeek]
  );

  const debouncedMealIdeasSave = React.useMemo(
    () =>
      debounce((doc: MealIdeasDoc) => {
        saveMealIdeas(doc);
      }, 800),
    [saveMealIdeas]
  );

  const debouncedTodosSave = React.useMemo(
    () =>
      debounce((doc: TodosDoc) => {
        saveTodos(doc);
      }, 800),
    [saveTodos]
  );

  const debouncedPracticeSave = React.useMemo(
    () =>
      debounce((doc: PracticeDoc) => {
        savePractice(doc);
      }, 800),
    [savePractice]
  );

  const viewOnlyWeek = readOnly || shareView;
  const practiceWeekId = week?.weekId ?? getCurrentWeekId();
  const viewOnlyTodos = shareView;

  const onUpdate = React.useCallback(
    (mutator: (draft: WeekDoc) => void) => {
      if (viewOnlyWeek) {
        return;
      }
      setWeek((prev) => {
        if (!prev) {
          return prev;
        }
        const next = cloneDeep(prev);
        mutator(next);
        debouncedSave(next);
        return next;
      });
    },
    [debouncedSave, viewOnlyWeek]
  );

  const onUpdateMealIdeas = React.useCallback(
    (mutator: (draft: MealIdeasDoc) => void) => {
      if (viewOnlyWeek) {
        return;
      }
      setMealIdeas((prev) => {
        if (!prev) {
          return prev;
        }
        const next: MealIdeasDoc = {
          ...prev,
          ideas: [...prev.ideas],
        };
        mutator(next);
        const hasInvalidIdea = next.ideas.some((idea) => !idea.trim());
        if (!hasInvalidIdea) {
          debouncedMealIdeasSave(next);
        }
        return next;
      });
    },
    [debouncedMealIdeasSave, viewOnlyWeek]
  );

  const onUpdateTodos = React.useCallback(
    (mutator: (draft: TodosDoc) => void) => {
      if (viewOnlyTodos) {
        return;
      }
      setTodosDoc((prev) => {
        if (!prev) {
          return prev;
        }
        const next: TodosDoc = {
          ...prev,
          todos: prev.todos.map((todo) => ({ ...todo })),
        };
        mutator(next);
        debouncedTodosSave(next);
        return next;
      });
    },
    [debouncedTodosSave, viewOnlyTodos]
  );

  const hasInvalidPracticeDraft = React.useCallback((doc: PracticeDoc) => {
    for (const person of doc.people) {
      const skills = doc.skillsByPerson[person] ?? [];
      for (const skill of skills) {
        if (!skill.name || !skill.name.trim()) {
          return true;
        }
        if (!skill.icon || !skill.icon.trim()) {
          return true;
        }
        if (!skill.tinyWin || !skill.tinyWin.trim()) {
          return true;
        }
        if (skill.environment) {
          for (const item of skill.environment) {
            if (!item.label || !item.label.trim()) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }, []);

  const onUpdatePractice = React.useCallback(
    (mutator: (draft: PracticeDoc) => void) => {
      if (viewOnlyWeek) {
        return;
      }
      setPracticeDoc((prev) => {
        if (!prev) {
          return prev;
        }
        const next = cloneDeep(prev);
        mutator(next);
        if (!hasInvalidPracticeDraft(next)) {
          debouncedPracticeSave(next);
        }
        return next;
      });
    },
    [debouncedPracticeSave, hasInvalidPracticeDraft, viewOnlyWeek]
  );

  const reloadWeek = React.useCallback(() => {
    if (!week) {
      return;
    }
    fetchWeek(week.weekId)
      .then((data) => {
        setWeek(data.week);
        setConflict(false);
        setReadOnly(data.readOnly);
        setViewer(data.viewer ?? null);
        if (data.viewer?.personId && data.week.people.includes(data.viewer.personId)) {
          setMe(data.viewer.personId);
        }
      })
      .catch(() => null);
  }, [week]);

  const reloadMealIdeas = React.useCallback(() => {
    setMealIdeasLoading(true);
    fetchMealIdeas()
      .then((data) => {
        setMealIdeas(data);
        setMealIdeasConflict(false);
        setMealIdeasError(null);
        setMealIdeasLoading(false);
      })
      .catch(() => {
        setMealIdeasError("Unable to load meal ideas.");
        setMealIdeasLoading(false);
      });
  }, []);

  const reloadTodos = React.useCallback(() => {
    setTodosLoading(true);
    fetchTodos()
      .then((data) => {
        setTodosDoc(data.doc);
        setTodosConflict(false);
        setTodosError(null);
        setTodosLoading(false);
      })
      .catch(() => {
        setTodosError("Unable to load to-dos.");
        setTodosLoading(false);
      });
  }, []);

  const reloadPractice = React.useCallback(() => {
    setPracticeLoading(true);
    fetchPractice()
      .then((doc) => {
        setPracticeDoc(doc);
        setPracticeConflict(false);
        setPracticeError(null);
        setPracticeSaveError(null);
        setPracticeLoading(false);
      })
      .catch(() => {
        setPracticeError("Unable to load practice.");
        setPracticeLoading(false);
      });
  }, []);

  const scrollToDay = React.useCallback((targetTab: TabKey, day: number) => {
    if (
      targetTab === "calendar" ||
      targetTab === "practice" ||
      targetTab === "digest" ||
      targetTab === "backup"
    ) {
      return;
    }
    const targetId = `${targetTab}-day-${day}`;
    const element = document.getElementById(targetId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  React.useEffect(() => {
    if (scrollTarget && scrollTarget.tab === tab) {
      scrollToDay(scrollTarget.tab, scrollTarget.day);
      setScrollTarget(null);
      return;
    }
    const saved = scrollPositions.current[tab];
    window.scrollTo(0, saved ?? 0);
  }, [scrollTarget, scrollToDay, tab]);

  const handleTabChange = (nextTab: TabKey) => {
    scrollPositions.current[tab] = window.scrollY;
    setTab(nextTab);
  };

  const openSchoolDates = React.useCallback(() => {
    scrollPositions.current[tab] = window.scrollY;
    setTab("school-dates");
  }, [tab]);

  const openBinCollections = React.useCallback(() => {
    scrollPositions.current[tab] = window.scrollY;
    setTab("bin-collections");
  }, [tab]);

  const openBackup = React.useCallback(() => {
    scrollPositions.current[tab] = window.scrollY;
    setBackupPrevTab(tab === "backup" ? "this-week" : tab);
    setTab("backup");
  }, [tab]);

  const handleThisWeek = () => {
    const currentWeekId = getCurrentWeekId();
    const currentDay = getCurrentDayIndex();
    const nextTab = tab === "this-week" ? "events" : tab;
    if (week && week.weekId === currentWeekId) {
      setConflict(false);
      if (nextTab !== tab) {
        scrollPositions.current[tab] = window.scrollY;
        setTab(nextTab);
      }
      setScrollTarget({ tab: nextTab, day: currentDay });
      return;
    }
    fetchCurrentWeek()
      .then((data) => {
        setWeek(data.week);
        setReadOnly(data.readOnly);
        setViewer(data.viewer ?? null);
        if (data.viewer?.personId && data.week.people.includes(data.viewer.personId)) {
          setMe(data.viewer.personId);
        }
        setConflict(false);
        if (nextTab !== tab) {
          scrollPositions.current[tab] = window.scrollY;
          setTab(nextTab);
        }
        setScrollTarget({ tab: nextTab, day: currentDay });
      })
      .catch(() => null);
  };

  const getNextEventOrder = React.useCallback((doc: WeekDoc, day: number) => {
    const orders = doc.events
      .filter((event) => event.day === day && Number.isInteger(event.order))
      .map((event) => event.order as number);
    return orders.length > 0 ? Math.max(...orders) + 1 : 0;
  }, []);

  const repeatEvent = React.useCallback(
    async (event: PlannerEvent, count: number) => {
      if (!week || count <= 0) {
        return;
      }
      let targetWeekId = week.weekId;
      const failures: string[] = [];
      for (let i = 0; i < count; i += 1) {
        targetWeekId = nextWeekId(targetWeekId);
        try {
          const payload = await fetchWeek(targetWeekId);
          if (payload.readOnly) {
            failures.push(`${targetWeekId} (archived)`);
            continue;
          }
          const nextDoc = payload.week;
          nextDoc.events.push({
            ...event,
            id: createId(),
            order:
              event.order !== undefined ? getNextEventOrder(nextDoc, event.day) : undefined,
          });
          await putWeek(nextDoc);
        } catch {
          failures.push(targetWeekId);
        }
      }
      if (failures.length > 0) {
        setRepeatNotice(`Repeat skipped for ${failures.join(", ")}.`);
      }
    },
    [getNextEventOrder, week]
  );

  const handleImportWeekTodos = React.useCallback(() => {
    if (!week || !todosDoc) {
      return;
    }
    if (week.todos.length === 0) {
      return;
    }
    if (
      !window.confirm(
        `Import ${week.todos.length} to-do${week.todos.length === 1 ? "" : "s"} from this week?`
      )
    ) {
      return;
    }
    onUpdateTodos((draft) => {
      const existingOrders = draft.todos
        .filter((todo) => Number.isInteger(todo.order))
        .map((todo) => todo.order as number);
      let nextOrder = existingOrders.length > 0 ? Math.max(...existingOrders) + 1 : 0;
      for (const todo of week.todos) {
        const title = todo.title.trim();
        if (!title) {
          continue;
        }
        draft.todos.push({
          id: createId(),
          title,
          owner: todo.owner,
          status: todo.status,
          effort: todo.effort,
          order: nextOrder,
        });
        nextOrder += 1;
      }
    });
  }, [onUpdateTodos, todosDoc, week]);

  const printEventsByDay = React.useMemo(() => {
    if (!week) {
      return [];
    }
    return DAY_LABELS.map((label, day) => {
      const items = week.events.filter((event) => event.day === day);
      const hasOrder = items.some((event) => Number.isInteger(event.order));
      const sorted = [...items].sort((a, b) => {
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
      return { label, items: sorted };
    });
  }, [week]);

  const printTodosByStatus = React.useMemo(() => {
    if (!todosDoc) {
      return [];
    }
    const sortTodos = (a: { order?: number; title: string }, b: { order?: number; title: string }) => {
      const ao = a.order ?? Number.MAX_SAFE_INTEGER;
      const bo = b.order ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) {
        return ao - bo;
      }
      return a.title.localeCompare(b.title);
    };
    const open = todosDoc.todos
      .filter((todo) => todo.status !== "done")
      .sort(sortTodos);
    const done = todosDoc.todos.filter((todo) => todo.status === "done").sort(sortTodos);
    return [
      { label: "Open", items: open },
      { label: "Done", items: done },
    ];
  }, [todosDoc]);

  const handlePrint = React.useCallback(() => {
    if (!week) {
      return;
    }
    window.print();
  }, [week]);

  const loadWeekById = React.useCallback((targetWeekId: string) => {
    const candidate = targetWeekId.trim().toUpperCase();
    if (!parseWeekId(candidate)) {
      return;
    }
    fetchWeek(candidate)
      .then((data) => {
        setWeek(data.week);
        setReadOnly(data.readOnly);
        setViewer(data.viewer ?? null);
        if (data.viewer?.personId && data.week.people.includes(data.viewer.personId)) {
          setMe(data.viewer.personId);
        }
        setConflict(false);
      })
      .catch(() => null);
  }, []);

  const recentWeekIds = React.useMemo(() => {
    if (!week) {
      return [];
    }
    return Array.from({ length: 3 }, (_, index) =>
      shiftWeekId(week.weekId, -(index + 1))
    );
  }, [week]);

  const upcomingWeekIds = React.useMemo(() => {
    if (!week) {
      return [];
    }
    return Array.from({ length: 3 }, (_, index) =>
      shiftWeekId(week.weekId, index + 1)
    );
  }, [week]);

  const handleArchive = () => {
    if (!week) {
      return;
    }
    rolloverWeekWithOptions(week.weekId, { ...carryOptions, carryMeals: false })
      .then((result) => {
        setWeek(result.nextWeek);
        setTab("this-week");
        setReadOnly(false);
        setArchiveOpen(false);
      })
      .catch(() => {
        setArchiveOpen(false);
      });
  };

  if (loading) {
    return <div className="app">Loading...</div>;
  }

  if (!week) {
    return <div className="app">Unable to load planner.</div>;
  }

  const recurringEvents = week.events
    .filter((event) => event.tag === "recurring")
    .sort((a, b) => {
      if (a.day !== b.day) {
        return a.day - b.day;
      }
      const ao = a.order ?? Number.MAX_SAFE_INTEGER;
      const bo = b.order ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) {
        return ao - bo;
      }
      const at = a.time ?? "";
      const bt = b.time ?? "";
      if (at !== bt) {
        return at.localeCompare(bt);
      }
      return a.title.localeCompare(b.title);
    });
  const focusFilled = week.people.filter((person) => week.focus[person].trim())
    .length;
  const printUpdatedAt = new Date(week.updatedAt).toLocaleString("en-GB", {
    timeZone: "Europe/London",
  });

  const saveLabel = readOnly
    ? "Read-only"
    : conflict
    ? "Not saved"
    : saving
    ? "Saving..."
    : "Saved";
  const saveClass = conflict
    ? " is-alert"
    : readOnly
    ? " is-readonly"
    : saving
    ? " is-saving"
    : " is-saved";
  const meLocked = Boolean(viewer?.personId);

  return (
    <>
      <div className={`app${shareView ? " is-share" : ""}`}>
      <header className="topbar">
        <div>
          <div className="week-heading">
            <Button
              variant="ghost"
              className="week-nav-button"
              onClick={() => loadWeekById(shiftWeekId(week.weekId, -1))}
            >
              Prev
            </Button>
            <div className="week-label">Week {week.weekId}</div>
            <Button
              variant="ghost"
              className="week-nav-button"
              onClick={() => loadWeekById(shiftWeekId(week.weekId, 1))}
            >
              Next
            </Button>
          </div>
        </div>
        <div className="topbar-actions">
          <div className="week-tools share-hidden">
            <button
              className="link collapse-toggle"
              onClick={() => setQuickWeeksOpen((prev) => !prev)}
              disabled={shareView}
            >
              {quickWeeksOpen ? "Hide recent & upcoming weeks" : "Show recent & upcoming weeks"}
            </button>
            {quickWeeksOpen && (
              <div className="week-quick-lists">
                <div className="week-quick-group">
                  <div className="muted">Recent weeks</div>
                  <div className="week-quick-list">
                    {recentWeekIds.map((weekId) => (
                      <button
                        key={`recent-${weekId}`}
                        className="link"
                        onClick={() => loadWeekById(weekId)}
                        disabled={shareView}
                      >
                        {weekId}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="week-quick-group">
                  <div className="muted">Upcoming weeks</div>
                  <div className="week-quick-list">
                    {upcomingWeekIds.map((weekId) => (
                      <button
                        key={`upcoming-${weekId}`}
                        className="link"
                        onClick={() => loadWeekById(weekId)}
                        disabled={shareView}
                      >
                        {weekId}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          <Button variant="ghost" onClick={handleThisWeek}>
            This week
          </Button>
          <div className="topbar-actions-secondary">
            <Button variant="ghost" onClick={handlePrint}>
              Print
            </Button>
            <Button
              variant="ghost"
              onClick={() => setShareView((prev) => !prev)}
            >
              {shareView ? "Exit share view" : "Share view"}
            </Button>
            <Button
              className="share-hidden"
              onClick={() => setArchiveOpen(true)}
              disabled={readOnly}
            >
              Archive & Next Week
            </Button>
          </div>
        </div>
      </header>

      {conflict && (
        <div className="banner">
          Updated elsewhere. <button onClick={reloadWeek}>Tap to reload.</button>
        </div>
      )}
      {saveError && (
        <div className="banner">
          Save failed: {saveError}{" "}
          <button className="link" onClick={retrySave}>
            Retry save
          </button>
          .
        </div>
      )}
      {readOnly && (
        <div className="banner muted">Archived week. Read-only mode.</div>
      )}
      {shareView && (
        <div className="banner muted">Share view enabled. Editing is hidden.</div>
      )}
      {repeatNotice && <div className="banner">{repeatNotice}</div>}

      {tab !== "backup" ? <Tabs active={tab} onChange={handleTabChange} /> : null}

      {tab === "this-week" && (
        <ThisWeek
          week={week}
          todos={todosDoc?.todos ?? []}
          me={me}
          onUpdate={onUpdate}
          readOnly={viewOnlyWeek}
          schoolDates={schoolDates}
          onOpenSchoolDates={openSchoolDates}
          binCollections={binCollections}
          onOpenBinCollections={openBinCollections}
          mealIdeas={mealIdeas}
          onOpenMealIdeas={() => setTab("meals")}
        />
      )}
      {tab === "practice" && (
        <Practice
          doc={practiceDoc}
          loading={practiceLoading}
          error={practiceError}
          saving={practiceSaving}
          conflict={practiceConflict}
          saveError={practiceSaveError}
          weekId={practiceWeekId}
          readOnly={viewOnlyWeek}
          onUpdate={onUpdatePractice}
          onReload={reloadPractice}
          onRetrySave={retryPracticeSave}
        />
      )}
      {tab === "calendar" && (
        <Calendar
          currentWeek={week}
          currentReadOnly={readOnly}
          viewOnly={viewOnlyWeek}
          me={me}
          schoolDates={schoolDates}
          schoolOverlayEnabled={schoolOverlay}
          binCollections={binCollections}
          binOverlayEnabled={binOverlay}
          onWeekOverride={(next) => setWeek(next)}
          onCurrentReadOnly={(next) => setReadOnly(next)}
        />
      )}
      {tab === "digest" && (
        <Digest
          currentWeek={digestWeek}
          nextWeek={digestNextWeek}
          todos={todosDoc?.todos ?? []}
          loading={digestLoading}
          error={digestError}
          nextWeekLoading={digestNextLoading}
          nextWeekError={digestNextError}
          binCollections={binCollections}
        />
      )}
      {tab === "backup" && <Backup onBack={() => setTab(backupPrevTab)} />}

      <UniversalAddFab
        week={week}
        weekReadOnly={readOnly}
        todosDoc={todosDoc}
        todosReadOnly={viewOnlyTodos}
        tab={tab}
        me={me}
        loadWeekById={loadWeekById}
        onUpdate={onUpdate}
        onUpdateTodos={onUpdateTodos}
      />

      <div className="more-menu-footer">
        <div className="more-menu more-menu-bottom" ref={moreMenuRef}>
          <Button
            variant="ghost"
            onClick={() => setMoreOpen((prev) => !prev)}
          >
            More
          </Button>
          {moreOpen && (
            <div className="more-menu-panel">
              <button
                className="link"
                onClick={() => {
                  handlePrint();
                  setMoreOpen(false);
                }}
              >
                Print
              </button>
              <button
                className="link"
                onClick={() => {
                  setShareView((prev) => !prev);
                  setMoreOpen(false);
                }}
              >
                {shareView ? "Exit share view" : "Share view"}
              </button>
              <button
                className="link share-hidden"
                onClick={() => {
                  setArchiveOpen(true);
                  setMoreOpen(false);
                }}
                disabled={readOnly}
              >
                Archive & Next Week
              </button>
              <button
                className="link"
                onClick={() => {
                  openBackup();
                  setMoreOpen(false);
                }}
              >
                Backup / Restore
              </button>
              <button
                className="link"
                onClick={() => {
                  setNotificationsOpen(true);
                  setMoreOpen(false);
                }}
              >
                Notifications
              </button>
            </div>
          )}
        </div>
      </div>
      {tab === "events" && (
        <Events
          week={week}
          me={me}
          onUpdate={onUpdate}
          onRepeat={repeatEvent}
          readOnly={viewOnlyWeek}
        />
      )}
      {tab === "todos" && (
        todosLoading || !todosDoc ? (
          <div className="screen">
            <div className="card">{todosError ?? "Loading to-dos..."}</div>
          </div>
        ) : (
          <Todos
            doc={todosDoc}
            people={week.people}
            me={me}
            onUpdate={onUpdateTodos}
            readOnly={viewOnlyTodos}
            conflict={todosConflict}
            saveError={todosError}
            onReload={reloadTodos}
            onRetrySave={retryTodosSave}
            importableCount={week.todos.length}
            onImportWeekTodos={handleImportWeekTodos}
          />
        )
      )}
      {tab === "meals" && (
        <MealsFocus
          week={week}
          onUpdate={onUpdate}
          readOnly={viewOnlyWeek}
          mealIdeas={mealIdeas}
          mealIdeasLoading={mealIdeasLoading}
          mealIdeasSaving={mealIdeasSaving}
          mealIdeasError={mealIdeasError}
          mealIdeasConflict={mealIdeasConflict}
          onReloadMealIdeas={reloadMealIdeas}
          onRetryMealIdeasSave={retryMealIdeasSave}
          onUpdateMealIdeas={onUpdateMealIdeas}
        />
      )}

      {tab === "bin-collections" && (
        <BinCollections
          data={binCollections}
          loading={binLoading}
          error={binError}
          overlayEnabled={binOverlay}
          onOverlayChange={setBinOverlay}
          refreshing={binRefreshing}
          refreshNotice={binRefreshNotice}
          onRefresh={refreshBinCollectionsNow}
        />
      )}
      {tab === "school-dates" && (
        <SchoolDates
          data={schoolDates}
          loading={schoolLoading}
          error={schoolError}
          refreshing={schoolRefreshing}
          refreshNotice={schoolRefreshNotice}
          onRefresh={refreshSchoolDatesNow}
          overlayEnabled={schoolOverlay}
          onOverlayChange={setSchoolOverlay}
        />
      )}

      <div className="page-footer">
        <div className="page-footer-meta muted">
          Updated {new Date(week.updatedAt).toLocaleString()}
        </div>
        <div className="page-footer-user">
          <div className="me-chip">Me: {me}{meLocked ? " (Access)" : ""}</div>
          <select
            className="me-select"
            value={me}
            onChange={(event) => setMe(event.target.value as PersonId)}
            disabled={shareView || meLocked}
          >
            {week.people.map((person) => (
              <option key={person} value={person}>
                {person}
              </option>
            ))}
          </select>
        </div>
        <div className="page-footer-status">
          <span className={`save-status${saveClass}`}>{saveLabel}</span>
        </div>
      </div>

      <Modal
        title="Archive this week?"
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
      >
        <p>
          This will archive {week.weekId} and create the next week. Choose what
          to carry over.
        </p>
        <div className="card">
          <div className="summary-label">Carry-over options</div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={carryOptions.carryFocus}
              onChange={(event) =>
                setCarryOptions((prev) => ({
                  ...prev,
                  carryFocus: event.target.checked,
                }))
              }
            />
            Weekly focus
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={carryOptions.carryRecurring}
              onChange={(event) =>
                setCarryOptions((prev) => ({
                  ...prev,
                  carryRecurring: event.target.checked,
                }))
              }
            />
            Recurring events (tagged "recurring")
          </label>
        </div>
        <div className="card">
          <div className="summary-label">Carry-over preview</div>
          {carryOptions.carryFocus && (
            <>
              <div className="summary-label">Weekly focus</div>
              {focusFilled === 0 ? (
                <div className="muted">No weekly focus set.</div>
              ) : (
                <ul className="list">
                  {week.people
                    .filter((person) => week.focus[person].trim())
                    .map((person) => (
                      <li key={person}>
                        {person}: {week.focus[person]}
                      </li>
                    ))}
                </ul>
              )}
            </>
          )}
          {carryOptions.carryRecurring && (
            <>
              <div className="summary-label">Recurring events</div>
              {recurringEvents.length === 0 ? (
                <div className="muted">No recurring events tagged this week.</div>
              ) : (
                <ul className="list">
                  {recurringEvents.map((event) => (
                    <li key={event.id}>
                      {event.title}
                      {event.time ? ` (${event.time})` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
        <div className="modal-actions">
          <Button onClick={handleArchive}>Confirm</Button>
        </div>
      </Modal>
      <NotificationsModal
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
      />
    </div>
    <div className="print-view">
      <>
        <h1>Week {week.weekId}</h1>
        <div className="print-meta">Updated {printUpdatedAt}</div>
        <div className="print-section">
          <h2>Events</h2>
          {printEventsByDay.map((group) => (
            <div key={`print-events-${group.label}`} className="print-section">
              <div className="print-label">{group.label}</div>
              {group.items.length === 0 ? (
                <div className="print-muted">No events.</div>
              ) : (
                <ul className="print-list">
                  {group.items.map((event) => {
                    const time = event.time ? `${event.time} ` : "";
                    const location = event.location ? ` @ ${event.location}` : "";
                    const meta = [event.who.join(", ") || "Everyone", event.tag ?? ""]
                      .filter(Boolean)
                      .join(" • ");
                    return (
                      <li key={event.id} className="print-item">
                        {time}
                        {event.title}
                        {location}
                        {meta ? <span className="print-meta"> ({meta})</span> : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
        <div className="print-section">
          <h2>To-dos</h2>
          {printTodosByStatus.length === 0 && (
            <div className="print-muted">No to-dos.</div>
          )}
          {printTodosByStatus.map((group) => (
            <div key={`print-todos-${group.label}`} className="print-section">
              <div className="print-label">{group.label}</div>
              {group.items.length === 0 ? (
                <div className="print-muted">No to-dos.</div>
              ) : (
                <ul className="print-list">
                  {group.items.map((todo) => {
                    const meta = [todo.owner, todo.status, todo.effort ?? ""]
                      .filter(Boolean)
                      .join(" • ");
                    return (
                      <li key={todo.id} className="print-item">
                        {todo.title}
                        {meta ? <span className="print-meta"> ({meta})</span> : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
        <div className="print-section">
          <h2>Focus</h2>
          <ul className="print-list">
            {week.people.map((person) => (
              <li key={`print-focus-${person}`} className="print-item">
                <span className="print-label">{person}:</span>{" "}
                {week.focus[person] || "-"}
              </li>
            ))}
          </ul>
        </div>
        <div className="print-section">
          <h2>Notes</h2>
          <pre className="print-notes">{week.notes || "None"}</pre>
        </div>
      </>
    </div>
    </>
  );
}
