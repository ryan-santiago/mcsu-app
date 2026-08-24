import "server-only";

import { addDays, format, startOfDay, subDays, subMonths } from "date-fns";
import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  oneLotProjectBoardColumn,
  oneLotProjectSprint,
  oneLotProjectWorkItem,
  oneLotProjectWorkItemComment,
  user,
} from "@/db/schema";
import { authorize, type CurrentUser } from "@/lib/session";

import { assertOneLotProjectContentAccess, listOneLotProjectMembers } from "./queries";
import type {
  BacklogBoardData,
  BoardColumnRow,
  BreakdownRow,
  CommentRow,
  KanbanBoardData,
  PeriodValue,
  SprintRow,
  StatCardsData,
  WorkItemDetailRow,
  WorkItemRow,
  WorkItemSubtaskRow,
  WorkloadRow,
} from "./backlog-types";

const ASSIGNEE_SELECTION = {
  id: user.id,
  name: user.name,
  image: user.image,
};

function toAssignee(row: { id: string; name: string; image: string | null } | null) {
  return row ? { id: row.id, name: row.name, image: row.image } : null;
}

/** Ordering shown on the board: active first, then planned by start date, then completed most-recent-first. */
function sortSprints(sprints: (typeof oneLotProjectSprint.$inferSelect)[]) {
  const rank = { active: 0, planned: 1, completed: 2 } as const;
  return [...sprints].sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    if (a.status === "completed") {
      return (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0);
    }
    return a.startDate.localeCompare(b.startDate);
  });
}

export async function getOneLotProjectBoardColumns(projectId: string): Promise<BoardColumnRow[]> {
  await authorize("one_lot_projects:read");

  return db
    .select({
      id: oneLotProjectBoardColumn.id,
      name: oneLotProjectBoardColumn.name,
      sortOrder: oneLotProjectBoardColumn.sortOrder,
      isDefault: oneLotProjectBoardColumn.isDefault,
      isDone: oneLotProjectBoardColumn.isDone,
    })
    .from(oneLotProjectBoardColumn)
    .where(eq(oneLotProjectBoardColumn.projectId, projectId))
    .orderBy(asc(oneLotProjectBoardColumn.sortOrder));
}

export async function getOneLotProjectBacklogBoard(projectId: string, actor: CurrentUser): Promise<BacklogBoardData> {
  await assertOneLotProjectContentAccess(projectId, actor);

  const [members, columns, sprints, subtaskCounts, commentCounts, topLevelItems] = await Promise.all([
    listOneLotProjectMembers(projectId),
    getOneLotProjectBoardColumns(projectId),
    db.select().from(oneLotProjectSprint).where(eq(oneLotProjectSprint.projectId, projectId)),
    db
      .select({
        parentId: oneLotProjectWorkItem.parentId,
        count: sql<number>`count(*)::int`,
        doneCount: sql<number>`count(*) filter (where ${oneLotProjectBoardColumn.isDone} = true)::int`,
      })
      .from(oneLotProjectWorkItem)
      .innerJoin(oneLotProjectBoardColumn, eq(oneLotProjectBoardColumn.id, oneLotProjectWorkItem.columnId))
      .where(and(eq(oneLotProjectWorkItem.projectId, projectId), sql`${oneLotProjectWorkItem.parentId} is not null`))
      .groupBy(oneLotProjectWorkItem.parentId),
    db
      .select({ workItemId: oneLotProjectWorkItemComment.workItemId, count: sql<number>`count(*)::int` })
      .from(oneLotProjectWorkItemComment)
      .innerJoin(oneLotProjectWorkItem, eq(oneLotProjectWorkItem.id, oneLotProjectWorkItemComment.workItemId))
      .where(eq(oneLotProjectWorkItem.projectId, projectId))
      .groupBy(oneLotProjectWorkItemComment.workItemId),
    db
      .select({
        id: oneLotProjectWorkItem.id,
        sprintId: oneLotProjectWorkItem.sprintId,
        code: oneLotProjectWorkItem.code,
        type: oneLotProjectWorkItem.type,
        title: oneLotProjectWorkItem.title,
        columnId: oneLotProjectWorkItem.columnId,
        priority: oneLotProjectWorkItem.priority,
        dueDate: oneLotProjectWorkItem.dueDate,
        storyPoints: oneLotProjectWorkItem.storyPoints,
        sortOrder: oneLotProjectWorkItem.sortOrder,
        boardSortOrder: oneLotProjectWorkItem.boardSortOrder,
        assignee: ASSIGNEE_SELECTION,
      })
      .from(oneLotProjectWorkItem)
      .leftJoin(user, eq(user.id, oneLotProjectWorkItem.assigneeId))
      .where(and(eq(oneLotProjectWorkItem.projectId, projectId), isNull(oneLotProjectWorkItem.parentId)))
      .orderBy(asc(oneLotProjectWorkItem.sortOrder)),
  ]);

  const subtaskCountByParent = new Map(subtaskCounts.map((r) => [r.parentId, r]));
  const commentCountByItem = new Map(commentCounts.map((r) => [r.workItemId, r.count]));

  const items: WorkItemRow[] = topLevelItems.map((row) => {
    const subtasks = subtaskCountByParent.get(row.id);
    return {
      id: row.id,
      code: row.code,
      type: row.type,
      title: row.title,
      columnId: row.columnId,
      priority: row.priority,
      assignee: toAssignee(row.assignee),
      dueDate: row.dueDate,
      storyPoints: row.storyPoints,
      sortOrder: row.sortOrder,
      boardSortOrder: row.boardSortOrder,
      subtaskCount: subtasks?.count ?? 0,
      doneSubtaskCount: subtasks?.doneCount ?? 0,
      commentCount: commentCountByItem.get(row.id) ?? 0,
    };
  });

  const backlogItems = items.filter((item) => topLevelItems.find((r) => r.id === item.id)?.sprintId === null);
  const itemsBySprint = new Map<string, WorkItemRow[]>();
  for (const row of topLevelItems) {
    if (!row.sprintId) continue;
    const item = items.find((i) => i.id === row.id)!;
    const bucket = itemsBySprint.get(row.sprintId) ?? [];
    bucket.push(item);
    itemsBySprint.set(row.sprintId, bucket);
  }

  const sprintRows: SprintRow[] = sortSprints(sprints).map((sprint) => ({
    id: sprint.id,
    name: sprint.name,
    itemCode: sprint.itemCode,
    startDate: sprint.startDate,
    endDate: sprint.endDate,
    goal: sprint.goal,
    status: sprint.status,
    startedAt: sprint.startedAt,
    completedAt: sprint.completedAt,
    items: itemsBySprint.get(sprint.id) ?? [],
  }));

  return { backlogItems, sprints: sprintRows, members, columns };
}

export async function getOneLotProjectKanbanBoard(projectId: string, actor: CurrentUser): Promise<KanbanBoardData> {
  await assertOneLotProjectContentAccess(projectId, actor);

  const [members, columns, activeSprintRows] = await Promise.all([
    listOneLotProjectMembers(projectId),
    getOneLotProjectBoardColumns(projectId),
    db
      .select({ id: oneLotProjectSprint.id, name: oneLotProjectSprint.name })
      .from(oneLotProjectSprint)
      .where(and(eq(oneLotProjectSprint.projectId, projectId), eq(oneLotProjectSprint.status, "active")))
      .limit(1),
  ]);

  const activeSprint = activeSprintRows[0] ?? null;
  const itemsByColumn: Record<string, WorkItemRow[]> = {};
  for (const column of columns) itemsByColumn[column.id] = [];

  if (activeSprint) {
    const [subtaskCounts, commentCounts, items] = await Promise.all([
      db
        .select({
          parentId: oneLotProjectWorkItem.parentId,
          count: sql<number>`count(*)::int`,
          doneCount: sql<number>`count(*) filter (where ${oneLotProjectBoardColumn.isDone} = true)::int`,
        })
        .from(oneLotProjectWorkItem)
        .innerJoin(oneLotProjectBoardColumn, eq(oneLotProjectBoardColumn.id, oneLotProjectWorkItem.columnId))
        .where(and(eq(oneLotProjectWorkItem.sprintId, activeSprint.id), sql`${oneLotProjectWorkItem.parentId} is not null`))
        .groupBy(oneLotProjectWorkItem.parentId),
      db
        .select({ workItemId: oneLotProjectWorkItemComment.workItemId, count: sql<number>`count(*)::int` })
        .from(oneLotProjectWorkItemComment)
        .innerJoin(oneLotProjectWorkItem, eq(oneLotProjectWorkItem.id, oneLotProjectWorkItemComment.workItemId))
        .where(eq(oneLotProjectWorkItem.sprintId, activeSprint.id))
        .groupBy(oneLotProjectWorkItemComment.workItemId),
      db
        .select({
          id: oneLotProjectWorkItem.id,
          code: oneLotProjectWorkItem.code,
          type: oneLotProjectWorkItem.type,
          title: oneLotProjectWorkItem.title,
          columnId: oneLotProjectWorkItem.columnId,
          priority: oneLotProjectWorkItem.priority,
          dueDate: oneLotProjectWorkItem.dueDate,
          storyPoints: oneLotProjectWorkItem.storyPoints,
          sortOrder: oneLotProjectWorkItem.sortOrder,
          boardSortOrder: oneLotProjectWorkItem.boardSortOrder,
          assignee: ASSIGNEE_SELECTION,
        })
        .from(oneLotProjectWorkItem)
        .leftJoin(user, eq(user.id, oneLotProjectWorkItem.assigneeId))
        .where(and(eq(oneLotProjectWorkItem.sprintId, activeSprint.id), isNull(oneLotProjectWorkItem.parentId)))
        .orderBy(asc(oneLotProjectWorkItem.boardSortOrder)),
    ]);

    const subtaskCountByParent = new Map(subtaskCounts.map((r) => [r.parentId, r]));
    const commentCountByItem = new Map(commentCounts.map((r) => [r.workItemId, r.count]));

    for (const row of items) {
      const subtasks = subtaskCountByParent.get(row.id);
      const item: WorkItemRow = {
        id: row.id,
        code: row.code,
        type: row.type,
        title: row.title,
        columnId: row.columnId,
        priority: row.priority,
        assignee: toAssignee(row.assignee),
        dueDate: row.dueDate,
        storyPoints: row.storyPoints,
        sortOrder: row.sortOrder,
        boardSortOrder: row.boardSortOrder,
        subtaskCount: subtasks?.count ?? 0,
        doneSubtaskCount: subtasks?.doneCount ?? 0,
        commentCount: commentCountByItem.get(row.id) ?? 0,
      };
      (itemsByColumn[row.columnId] ??= []).push(item);
    }
  }

  return { columns, activeSprint, itemsByColumn, members };
}

export async function getOneLotProjectWorkItemDetail(
  id: string,
  projectId: string,
  actor: CurrentUser,
): Promise<WorkItemDetailRow | null> {
  await assertOneLotProjectContentAccess(projectId, actor);

  const [row] = await db
    .select({
      id: oneLotProjectWorkItem.id,
      code: oneLotProjectWorkItem.code,
      type: oneLotProjectWorkItem.type,
      title: oneLotProjectWorkItem.title,
      description: oneLotProjectWorkItem.description,
      columnId: oneLotProjectWorkItem.columnId,
      priority: oneLotProjectWorkItem.priority,
      dueDate: oneLotProjectWorkItem.dueDate,
      storyPoints: oneLotProjectWorkItem.storyPoints,
      sortOrder: oneLotProjectWorkItem.sortOrder,
      boardSortOrder: oneLotProjectWorkItem.boardSortOrder,
      parentId: oneLotProjectWorkItem.parentId,
      sprintId: oneLotProjectWorkItem.sprintId,
      createdAt: oneLotProjectWorkItem.createdAt,
      updatedAt: oneLotProjectWorkItem.updatedAt,
      assignee: ASSIGNEE_SELECTION,
      sprintName: oneLotProjectSprint.name,
    })
    .from(oneLotProjectWorkItem)
    .leftJoin(user, eq(user.id, oneLotProjectWorkItem.assigneeId))
    .leftJoin(oneLotProjectSprint, eq(oneLotProjectSprint.id, oneLotProjectWorkItem.sprintId))
    .where(and(eq(oneLotProjectWorkItem.id, id), eq(oneLotProjectWorkItem.projectId, projectId)))
    .limit(1);

  if (!row) return null;

  let parentCode: string | null = null;
  if (row.parentId) {
    const [parent] = await db
      .select({ code: oneLotProjectWorkItem.code })
      .from(oneLotProjectWorkItem)
      .where(eq(oneLotProjectWorkItem.id, row.parentId))
      .limit(1);
    parentCode = parent?.code ?? null;
  }

  const [subtaskRows, commentRows, subtaskAgg] = await Promise.all([
    db
      .select({
        id: oneLotProjectWorkItem.id,
        code: oneLotProjectWorkItem.code,
        title: oneLotProjectWorkItem.title,
        columnId: oneLotProjectWorkItem.columnId,
        assignee: ASSIGNEE_SELECTION,
      })
      .from(oneLotProjectWorkItem)
      .leftJoin(user, eq(user.id, oneLotProjectWorkItem.assigneeId))
      .where(eq(oneLotProjectWorkItem.parentId, id))
      .orderBy(asc(oneLotProjectWorkItem.createdAt)),
    db
      .select({
        id: oneLotProjectWorkItemComment.id,
        body: oneLotProjectWorkItemComment.body,
        createdAt: oneLotProjectWorkItemComment.createdAt,
        author: ASSIGNEE_SELECTION,
      })
      .from(oneLotProjectWorkItemComment)
      .leftJoin(user, eq(user.id, oneLotProjectWorkItemComment.authorId))
      .where(eq(oneLotProjectWorkItemComment.workItemId, id))
      .orderBy(asc(oneLotProjectWorkItemComment.createdAt)),
    db
      .select({
        count: sql<number>`count(*)::int`,
        doneCount: sql<number>`count(*) filter (where ${oneLotProjectBoardColumn.isDone} = true)::int`,
      })
      .from(oneLotProjectWorkItem)
      .innerJoin(oneLotProjectBoardColumn, eq(oneLotProjectBoardColumn.id, oneLotProjectWorkItem.columnId))
      .where(eq(oneLotProjectWorkItem.parentId, id)),
  ]);

  const subtasks: WorkItemSubtaskRow[] = subtaskRows.map((s) => ({
    id: s.id,
    code: s.code,
    title: s.title,
    columnId: s.columnId,
    assignee: toAssignee(s.assignee),
  }));

  const comments: CommentRow[] = commentRows.map((c) => ({
    id: c.id,
    body: c.body,
    createdAt: c.createdAt,
    author: toAssignee(c.author),
  }));

  return {
    id: row.id,
    code: row.code,
    type: row.type,
    title: row.title,
    description: row.description,
    columnId: row.columnId,
    priority: row.priority,
    assignee: toAssignee(row.assignee),
    dueDate: row.dueDate,
    storyPoints: row.storyPoints,
    sortOrder: row.sortOrder,
    boardSortOrder: row.boardSortOrder,
    parentId: row.parentId,
    parentCode,
    sprintId: row.sprintId,
    sprintName: row.sprintName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    subtaskCount: subtaskAgg[0]?.count ?? 0,
    doneSubtaskCount: subtaskAgg[0]?.doneCount ?? 0,
    commentCount: comments.length,
    subtasks,
    comments,
  };
}

const PRIORITY_ORDER = [
  { value: "highest", label: "Highest" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "lowest", label: "Lowest" },
] as const;

const TYPE_ORDER = [
  { value: "task", label: "Task" },
  { value: "bug", label: "Bug" },
] as const;

async function breakdownBy(
  projectId: string,
  column: typeof oneLotProjectWorkItem.priority | typeof oneLotProjectWorkItem.type,
  order: readonly { value: string; label: string }[],
): Promise<BreakdownRow[]> {
  await authorize("one_lot_projects:read");

  const rows = await db
    .select({ value: column, count: sql<number>`count(*)::int` })
    .from(oneLotProjectWorkItem)
    .where(and(eq(oneLotProjectWorkItem.projectId, projectId), isNull(oneLotProjectWorkItem.parentId)))
    .groupBy(column);

  const counts = new Map<string, number>(rows.map((r) => [r.value as string, r.count]));
  return order.map((o) => ({ label: o.label, value: counts.get(o.value) ?? 0 }));
}

/** Unlike Priority/Types of Work, this reflects the project's *actual* columns (including custom ones), ordered by `sortOrder`, 0-filled for columns with no items. */
export async function getOneLotProjectStatusOverview(projectId: string): Promise<BreakdownRow[]> {
  await authorize("one_lot_projects:read");

  const [columns, rows] = await Promise.all([
    getOneLotProjectBoardColumns(projectId),
    db
      .select({ columnId: oneLotProjectWorkItem.columnId, count: sql<number>`count(*)::int` })
      .from(oneLotProjectWorkItem)
      .where(and(eq(oneLotProjectWorkItem.projectId, projectId), isNull(oneLotProjectWorkItem.parentId)))
      .groupBy(oneLotProjectWorkItem.columnId),
  ]);

  const counts = new Map(rows.map((r) => [r.columnId, r.count]));
  return columns.map((c) => ({ label: c.name, value: counts.get(c.id) ?? 0 }));
}

export async function getOneLotProjectPriorityBreakdown(projectId: string): Promise<BreakdownRow[]> {
  return breakdownBy(projectId, oneLotProjectWorkItem.priority, PRIORITY_ORDER);
}

export async function getOneLotProjectTypesOfWork(projectId: string): Promise<BreakdownRow[]> {
  return breakdownBy(projectId, oneLotProjectWorkItem.type, TYPE_ORDER);
}

export async function getOneLotProjectStatCards(projectId: string): Promise<StatCardsData> {
  await authorize("one_lot_projects:read");

  const now = new Date();
  const todayStart = startOfDay(now);
  const sevenDaysAgo = subDays(now, 7);
  const oneMonthAgo = subMonths(now, 1);
  const todayDate = format(now, "yyyy-MM-dd");
  const sevenDaysFromNowDate = format(addDays(now, 7), "yyyy-MM-dd");

  const [row] = await db
    .select({
      completed: sql<number>`count(*) filter (where ${oneLotProjectBoardColumn.isDone} = true)::int`,
      dueSoon: sql<number>`count(*) filter (where ${oneLotProjectWorkItem.dueDate} is not null and ${oneLotProjectWorkItem.dueDate} >= ${todayDate} and ${oneLotProjectWorkItem.dueDate} <= ${sevenDaysFromNowDate} and ${oneLotProjectBoardColumn.isDone} = false)::int`,
      updatedToday: sql<number>`count(*) filter (where ${oneLotProjectWorkItem.updatedAt} >= ${todayStart})::int`,
      updated7d: sql<number>`count(*) filter (where ${oneLotProjectWorkItem.updatedAt} >= ${sevenDaysAgo})::int`,
      updated1m: sql<number>`count(*) filter (where ${oneLotProjectWorkItem.updatedAt} >= ${oneMonthAgo})::int`,
      updatedAll: sql<number>`count(*)::int`,
      createdToday: sql<number>`count(*) filter (where ${oneLotProjectWorkItem.createdAt} >= ${todayStart})::int`,
      created7d: sql<number>`count(*) filter (where ${oneLotProjectWorkItem.createdAt} >= ${sevenDaysAgo})::int`,
      created1m: sql<number>`count(*) filter (where ${oneLotProjectWorkItem.createdAt} >= ${oneMonthAgo})::int`,
      createdAll: sql<number>`count(*)::int`,
    })
    .from(oneLotProjectWorkItem)
    .innerJoin(oneLotProjectBoardColumn, eq(oneLotProjectBoardColumn.id, oneLotProjectWorkItem.columnId))
    .where(and(eq(oneLotProjectWorkItem.projectId, projectId), isNull(oneLotProjectWorkItem.parentId)));

  return {
    completed: row?.completed ?? 0,
    dueSoon: row?.dueSoon ?? 0,
    updated: {
      today: row?.updatedToday ?? 0,
      "7d": row?.updated7d ?? 0,
      "1m": row?.updated1m ?? 0,
      all: row?.updatedAll ?? 0,
    } satisfies Record<PeriodValue, number>,
    created: {
      today: row?.createdToday ?? 0,
      "7d": row?.created7d ?? 0,
      "1m": row?.created1m ?? 0,
      all: row?.createdAll ?? 0,
    } satisfies Record<PeriodValue, number>,
  };
}

export async function getOneLotProjectWorkload(projectId: string): Promise<WorkloadRow[]> {
  await authorize("one_lot_projects:read");

  const rows = await db
    .select({
      assigneeId: oneLotProjectWorkItem.assigneeId,
      name: user.name,
      image: user.image,
      count: sql<number>`count(*)::int`,
    })
    .from(oneLotProjectWorkItem)
    .leftJoin(user, eq(user.id, oneLotProjectWorkItem.assigneeId))
    .where(and(eq(oneLotProjectWorkItem.projectId, projectId), isNull(oneLotProjectWorkItem.parentId)))
    .groupBy(oneLotProjectWorkItem.assigneeId, user.name, user.image);

  return rows
    .map((row) => ({
      assigneeId: row.assigneeId,
      name: row.assigneeId ? (row.name ?? "") : "Unassigned",
      image: row.image,
      count: row.count,
    }))
    .sort((a, b) => b.count - a.count);
}
