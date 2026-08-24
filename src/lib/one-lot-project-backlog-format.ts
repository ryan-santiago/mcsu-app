import type { SprintStatus, WorkItemPriority, WorkItemType } from "@/db/schema";

export const WORK_ITEM_TYPE_LABELS: Record<WorkItemType, string> = {
  task: "Task",
  bug: "Bug",
};

/**
 * Board columns are per-project, user-configurable data now (not a fixed
 * enum) — this cycles through the app's categorical chart tokens by column
 * position, shared by the Summary page's Status Overview donut and the
 * Kanban column headers so the two never drift.
 */
const COLUMN_COLOR_CYCLE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export function columnColor(index: number): string {
  return COLUMN_COLOR_CYCLE[index % COLUMN_COLOR_CYCLE.length];
}

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
