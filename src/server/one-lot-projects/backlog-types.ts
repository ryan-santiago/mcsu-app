import type { SprintStatusValue, WorkItemPriorityValue, WorkItemTypeValue } from "@/lib/validation/one-lot-project-backlog";

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
  sortOrder: number;
  boardSortOrder: number;
  subtaskCount: number;
  doneSubtaskCount: number;
  commentCount: number;
};

export type SprintRow = {
  id: string;
  name: string;
  itemCode: string;
  startDate: string;
  endDate: string;
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
  subtasks: WorkItemSubtaskRow[];
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
