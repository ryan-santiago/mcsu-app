/**
 * Placeholder datasets for the Summary page's Backlog/Kanban/Calendar-fed
 * panels — none of those modules exist yet, so these are stand-ins to keep
 * the layout intentional rather than empty. Delete/replace piece by piece as
 * each real module lands; nothing outside this file should need to change.
 */

export type PeriodValue = "today" | "7d" | "1m" | "all";

export const PERIOD_OPTIONS: { value: PeriodValue; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "1m", label: "1 month" },
  { value: "all", label: "All time" },
];

export const STAT_CARDS_DUMMY = {
  completed: 0,
  dueSoon: 1,
  updated: { today: 1, "7d": 3, "1m": 5, all: 8 } satisfies Record<PeriodValue, number>,
  created: { today: 1, "7d": 3, "1m": 4, all: 6 } satisfies Record<PeriodValue, number>,
};

export const STATUS_OVERVIEW_DUMMY: { label: string; value: number }[] = [
  { label: "To Do", value: 3 },
  { label: "In Progress", value: 0 },
  { label: "Done", value: 0 },
];

export const PRIORITY_BREAKDOWN_DUMMY: { label: string; value: number }[] = [
  { label: "Highest", value: 0 },
  { label: "High", value: 0 },
  { label: "Medium", value: 2 },
  { label: "Low", value: 0 },
  { label: "Lowest", value: 0 },
];

export const TYPES_OF_WORK_DUMMY: { label: string; value: number }[] = [
  { label: "Task", value: 1 },
  { label: "Subtask", value: 1 },
  { label: "Bug", value: 0 },
];
