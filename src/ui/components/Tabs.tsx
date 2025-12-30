import React from "react";

export type TabKey =
  | "this-week"
  | "practice"
  | "digest"
  | "calendar"
  | "events"
  | "todos"
  | "meals"
  | "bin-collections"
  | "school-dates"
  | "backup";

interface TabsProps {
  active: TabKey;
  onChange: (tab: TabKey) => void;
}

const TABS: { key: TabKey; label: string }[] = [
  { key: "this-week", label: "This Week" },
  { key: "practice", label: "Practice" },
  { key: "digest", label: "Digest" },
  { key: "calendar", label: "Calendar" },
  { key: "events", label: "Events" },
  { key: "todos", label: "To-dos" },
  { key: "meals", label: "Meal Ideas & Focus" },
  { key: "bin-collections", label: "Bin collections" },
  { key: "school-dates", label: "School Dates" },
];

export default function Tabs({ active, onChange }: TabsProps) {
  return (
    <div className="tabs">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          className={`tab${tab.key === active ? " tab-active" : ""}`}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
