import type { SprintStatus, WorkItemPriority, WorkItemType } from "@/db/schema";
import type { WorkItemCoverColorValue } from "@/lib/validation/one-lot-project-backlog";

export const WORK_ITEM_TYPE_LABELS: Record<WorkItemType, string> = {
  task: "Task",
  bug: "Bug",
  subtask: "Subtask",
};

/** Fixed palette for the card cover strip — content color swatches, not brand chrome, so raw hex is deliberate here (same convention as `columnColor` below). */
export const WORK_ITEM_COVER_COLORS: Record<WorkItemCoverColorValue, { label: string; value: string }> = {
  gray: { label: "Gray", value: "#6B7280" },
  blue: { label: "Blue", value: "#2563EB" },
  teal: { label: "Teal", value: "#0D9488" },
  green: { label: "Green", value: "#16A34A" },
  olive: { label: "Olive", value: "#65A30D" },
  brown: { label: "Brown", value: "#92400E" },
  orange: { label: "Orange", value: "#EA580C" },
  red: { label: "Red", value: "#DC2626" },
  magenta: { label: "Magenta", value: "#DB2777" },
  purple: { label: "Purple", value: "#7C3AED" },
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
