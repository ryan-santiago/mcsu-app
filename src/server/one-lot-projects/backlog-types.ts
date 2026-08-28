import type {
  SprintStatusValue,
  WorkItemCoverColorValue,
  WorkItemPriorityValue,
  WorkItemTypeValue,
} from "@/lib/validation/one-lot-project-backlog";

import type { OneLotProjectMemberRow } from "./types";

export type WorkItemAssignee = { id: string; name: string; image: string | null } | null;

export type WorkItemRow = {
  id: string;
  code: string;
  type: WorkItemTypeValue;
  title: string;
  columnId: string;
  priority: WorkItemPriorityValue;
  assignee: WorkItemAssignee;
  dueDate: string | null;
  storyPoints: string | null;
  coverColor: WorkItemCoverColorValue | null;
  sortOrder: number;
  boardSortOrder: number;
  subtaskCount: number;
  doneSubtaskCount: number;
  commentCount: number;
  /** Preloaded so the Backlog row / Kanban card can expand inline with no extra fetch — empty for a subtask itself (subtasks don't nest). */
  subtasks: WorkItemSubtaskRow[];
};

export type SprintRow = {
  id: string;
  name: string;
  itemCode: string;
  /** Null until set — a sprint can exist before its dates are pinned down; both are required before it can start. */
  startDate: string | null;
  endDate: string | null;
  goal: string | null;
  status: SprintStatusValue;
  startedAt: Date | null;
  completedAt: Date | null;
  items: WorkItemRow[];
};

export type BoardColumnRow = {
  id: string;
  name: string;
  sortOrder: number;
  isDefault: boolean;
  isDone: boolean;
};

export type BacklogBoardData = {
  backlogItems: WorkItemRow[];
  sprints: SprintRow[];
  members: OneLotProjectMemberRow[];
  columns: BoardColumnRow[];
};

export type KanbanBoardData = {
  columns: BoardColumnRow[];
  activeSprint: { id: string; name: string } | null;
  itemsByColumn: Record<string, WorkItemRow[]>;
  members: OneLotProjectMemberRow[];
};

export type WorkItemSubtaskRow = {
  id: string;
  code: string;
  title: string;
  columnId: string;
  priority: WorkItemPriorityValue;
  assignee: WorkItemAssignee;
};

export type CommentRow = {
  id: string;
  body: string;
  createdAt: Date;
  author: WorkItemAssignee;
};

export type WorkItemDetailRow = WorkItemRow & {
  description: string | null;
  parentId: string | null;
  parentCode: string | null;
  sprintId: string | null;
  sprintName: string | null;
  createdAt: Date;
  updatedAt: Date;
  comments: CommentRow[];
};

export type PeriodValue = "today" | "7d" | "1m" | "all";

export type StatCardsData = {
  completed: number;
  dueSoon: number;
  updated: Record<PeriodValue, number>;
  created: Record<PeriodValue, number>;
};

export type BreakdownRow = { label: string; value: number };

export type WorkloadRow = { assigneeId: string | null; name: string; image: string | null; count: number };

export type CompletedSprintRow = {
  id: string;
  name: string;
  itemCode: string;
  startDate: string | null;
  endDate: string | null;
  completedAt: Date | null;
  itemCount: number;
  doneItemCount: number;
  /** Sum of top-level items' story points — the sprint's delivered velocity. */
  storyPoints: number;
};

export type BurndownPoint = {
  date: string;
  /** Actual remaining points as of this day (from `doneAt` on Done items — see `getOneLotProjectActiveSprintBurndown`). */
  remaining: number;
  /** Where remaining points "should" be on this day under a straight-line burn from the sprint's total. */
  ideal: number;
};

export type BurndownData = {
  sprint: { id: string; name: string } | null;
  totalPoints: number;
  /** Empty when there's no active sprint, or it has no start/end date yet. */
  points: BurndownPoint[];
};
