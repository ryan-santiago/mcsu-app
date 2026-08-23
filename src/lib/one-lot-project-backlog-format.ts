import type { SprintStatus, WorkItemPriority, WorkItemStatus, WorkItemType } from "@/db/schema";

export const WORK_ITEM_TYPE_LABELS: Record<WorkItemType, string> = {
  task: "Task",
  bug: "Bug",
};

export const WORK_ITEM_STATUS_LABELS: Record<WorkItemStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
};

/** Shared with the Summary page's Status Overview donut so the two never drift. */
export const WORK_ITEM_STATUS_COLORS: Record<WorkItemStatus, string> = {
  todo: "var(--chart-1)",
  in_progress: "var(--chart-2)",
  done: "var(--chart-3)",
};

export const WORK_ITEM_PRIORITY_LABELS: Record<WorkItemPriority, string> = {
  highest: "Highest",
  high: "High",
  medium: "Medium",
  low: "Low",
  lowest: "Lowest",
};

export const SPRINT_STATUS_LABELS: Record<SprintStatus, string> = {
  planned: "Planned",
  active: "Active",
  completed: "Completed",
};

export type PeriodValue = "today" | "7d" | "1m" | "all";

export const PERIOD_OPTIONS: { value: PeriodValue; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "1m", label: "1 month" },
  { value: "all", label: "All time" },
];
