import "server-only";

import { addDays, differenceInCalendarDays, format, parseISO, startOfDay, subDays, subMonths } from "date-fns";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  oneLotProjectBoardColumn,
  oneLotProjectSprint,
  oneLotProjectWorkItem,
  oneLotProjectWorkItemComment,
  user,
} from "@/db/schema";
import { authorizeActiveUser, type CurrentUser } from "@/lib/session";

import { assertOneLotProjectContentAccess, listOneLotProjectMembers } from "./queries";
import type {
  BacklogBoardData,
  BoardColumnRow,
  BreakdownRow,
  BurndownData,
  BurndownPoint,
  CommentRow,
  CompletedSprintRow,
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

function toSubtaskRow(row: {
  id: string;
  code: string;
  title: string;
  columnId: string;
  priority: WorkItemSubtaskRow["priority"];
  assignee: { id: string; name: string; image: string | null } | null;
}): WorkItemSubtaskRow {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    columnId: row.columnId,
    priority: row.priority,
    assignee: toAssignee(row.assignee),
  };
}

/** Ordering shown on the board: active first, then planned by start date (undated last), then completed most-recent-first. */
function sortSprints(sprints: (typeof oneLotProjectSprint.$inferSelect)[]) {
  const rank = { active: 0, planned: 1, completed: 2 } as const;
  return [...sprints].sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    if (a.status === "completed") {
      return (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0);
    }
    return (a.startDate ?? "￿").localeCompare(b.startDate ?? "￿");
  });
}

/** Only reachable after project-level content access is already verified by the caller — see `queries.ts`'s `listOneLotProjectMembers`. */
export async function getOneLotProjectBoardColumns(projectId: string): Promise<BoardColumnRow[]> {
  await authorizeActiveUser();

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

  const [members, columns, sprints, subtaskRows, commentCounts, topLevelItems] = await Promise.all([
    listOneLotProjectMembers(projectId),
    getOneLotProjectBoardColumns(projectId),
    db.select().from(oneLotProjectSprint).where(eq(oneLotProjectSprint.projectId, projectId)),
    db
      .select({
        id: oneLotProjectWorkItem.id,
        parentId: oneLotProjectWorkItem.parentId,
        code: oneLotProjectWorkItem.code,
        title: oneLotProjectWorkItem.title,
        columnId: oneLotProjectWorkItem.columnId,
        priority: oneLotProjectWorkItem.priority,
        isDone: oneLotProjectBoardColumn.isDone,
        assignee: ASSIGNEE_SELECTION,
      })
      .from(oneLotProjectWorkItem)
      .innerJoin(oneLotProjectBoardColumn, eq(oneLotProjectBoardColumn.id, oneLotProjectWorkItem.columnId))
      .leftJoin(user, eq(user.id, oneLotProjectWorkItem.assigneeId))
      .where(and(eq(oneLotProjectWorkItem.projectId, projectId), sql`${oneLotProjectWorkItem.parentId} is not null`))
      .orderBy(asc(oneLotProjectWorkItem.createdAt)),
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
        coverColor: oneLotProjectWorkItem.coverColor,
        sortOrder: oneLotProjectWorkItem.sortOrder,
        boardSortOrder: oneLotProjectWorkItem.boardSortOrder,
        assignee: ASSIGNEE_SELECTION,
      })
      .from(oneLotProjectWorkItem)
      .leftJoin(user, eq(user.id, oneLotProjectWorkItem.assigneeId))
      .where(and(eq(oneLotProjectWorkItem.projectId, projectId), isNull(oneLotProjectWorkItem.parentId)))
      .orderBy(asc(oneLotProjectWorkItem.sortOrder)),
  ]);

  const subtasksByParent = new Map<string, WorkItemSubtaskRow[]>();
  const doneSubtaskCountByParent = new Map<string, number>();
  for (const row of subtaskRows) {
    if (!row.parentId) continue;
    const bucket = subtasksByParent.get(row.parentId) ?? [];
    bucket.push(toSubtaskRow(row));
    subtasksByParent.set(row.parentId, bucket);
    if (row.isDone) doneSubtaskCountByParent.set(row.parentId, (doneSubtaskCountByParent.get(row.parentId) ?? 0) + 1);
  }
  const commentCountByItem = new Map(commentCounts.map((r) => [r.workItemId, r.count]));

  const items: WorkItemRow[] = topLevelItems.map((row) => {
    const subtasks = subtasksByParent.get(row.id) ?? [];
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
      coverColor: row.coverColor as WorkItemRow["coverColor"],
      sortOrder: row.sortOrder,
      boardSortOrder: row.boardSortOrder,
      subtaskCount: subtasks.length,
      doneSubtaskCount: doneSubtaskCountByParent.get(row.id) ?? 0,
      commentCount: commentCountByItem.get(row.id) ?? 0,
      subtasks,
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
    const [subtaskRows, commentCounts, items] = await Promise.all([
      db
        .select({
          id: oneLotProjectWorkItem.id,
          parentId: oneLotProjectWorkItem.parentId,
          code: oneLotProjectWorkItem.code,
          title: oneLotProjectWorkItem.title,
          columnId: oneLotProjectWorkItem.columnId,
          priority: oneLotProjectWorkItem.priority,
          isDone: oneLotProjectBoardColumn.isDone,
          assignee: ASSIGNEE_SELECTION,
        })
        .from(oneLotProjectWorkItem)
        .innerJoin(oneLotProjectBoardColumn, eq(oneLotProjectBoardColumn.id, oneLotProjectWorkItem.columnId))
        .leftJoin(user, eq(user.id, oneLotProjectWorkItem.assigneeId))
        // Scoped by project, not by the subtask's own sprintId — a subtask
        // doesn't follow its parent when the parent moves sprints, so
        // filtering on the subtask's sprintId here undercounted subtasks
        // whose sprintId had gone stale relative to their parent's.
        // `subtasksByParent` below is only ever consulted for parents that
        // are themselves in `items` (the active sprint's top-level rows),
        // so this naturally stays scoped to the visible board.
        .where(and(eq(oneLotProjectWorkItem.projectId, projectId), sql`${oneLotProjectWorkItem.parentId} is not null`))
        .orderBy(asc(oneLotProjectWorkItem.createdAt)),
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
          coverColor: oneLotProjectWorkItem.coverColor,
          sortOrder: oneLotProjectWorkItem.sortOrder,
          boardSortOrder: oneLotProjectWorkItem.boardSortOrder,
          assignee: ASSIGNEE_SELECTION,
        })
        .from(oneLotProjectWorkItem)
        .leftJoin(user, eq(user.id, oneLotProjectWorkItem.assigneeId))
        .where(and(eq(oneLotProjectWorkItem.sprintId, activeSprint.id), isNull(oneLotProjectWorkItem.parentId)))
        .orderBy(asc(oneLotProjectWorkItem.boardSortOrder)),
    ]);

    const subtasksByParent = new Map<string, WorkItemSubtaskRow[]>();
    const doneSubtaskCountByParent = new Map<string, number>();
    for (const row of subtaskRows) {
      if (!row.parentId) continue;
      const bucket = subtasksByParent.get(row.parentId) ?? [];
      bucket.push(toSubtaskRow(row));
      subtasksByParent.set(row.parentId, bucket);
      if (row.isDone) doneSubtaskCountByParent.set(row.parentId, (doneSubtaskCountByParent.get(row.parentId) ?? 0) + 1);
    }
    const commentCountByItem = new Map(commentCounts.map((r) => [r.workItemId, r.count]));

    for (const row of items) {
      const subtasks = subtasksByParent.get(row.id) ?? [];
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
        coverColor: row.coverColor as WorkItemRow["coverColor"],
        sortOrder: row.sortOrder,
        boardSortOrder: row.boardSortOrder,
        subtaskCount: subtasks.length,
        doneSubtaskCount: doneSubtaskCountByParent.get(row.id) ?? 0,
        commentCount: commentCountByItem.get(row.id) ?? 0,
        subtasks,
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
      coverColor: oneLotProjectWorkItem.coverColor,
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
        priority: oneLotProjectWorkItem.priority,
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

  const subtasks: WorkItemSubtaskRow[] = subtaskRows.map(toSubtaskRow);

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
    coverColor: row.coverColor as WorkItemRow["coverColor"],
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
  { value: "subtask", label: "Subtask" },
] as const;

async function breakdownBy(
  projectId: string,
  column: typeof oneLotProjectWorkItem.priority | typeof oneLotProjectWorkItem.type,
  order: readonly { value: string; label: string }[],
  /** Priority is a top-level-backlog-severity view; Types of Work counts subtasks too, now that "subtask" is its own type. */
  topLevelOnly: boolean,
): Promise<BreakdownRow[]> {
  await authorizeActiveUser();

  const rows = await db
    .select({ value: column, count: sql<number>`count(*)::int` })
    .from(oneLotProjectWorkItem)
    .where(
      topLevelOnly
        ? and(eq(oneLotProjectWorkItem.projectId, projectId), isNull(oneLotProjectWorkItem.parentId))
        : eq(oneLotProjectWorkItem.projectId, projectId),
    )
    .groupBy(column);

  const counts = new Map<string, number>(rows.map((r) => [r.value as string, r.count]));
  return order.map((o) => ({ label: o.label, value: counts.get(o.value) ?? 0 }));
}

/** Unlike Priority/Types of Work, this reflects the project's *actual* columns (including custom ones), ordered by `sortOrder`, 0-filled for columns with no items. */
export async function getOneLotProjectStatusOverview(projectId: string): Promise<BreakdownRow[]> {
  await authorizeActiveUser();

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
  return breakdownBy(projectId, oneLotProjectWorkItem.priority, PRIORITY_ORDER, true);
}

export async function getOneLotProjectTypesOfWork(projectId: string): Promise<BreakdownRow[]> {
  return breakdownBy(projectId, oneLotProjectWorkItem.type, TYPE_ORDER, false);
}

export async function getOneLotProjectStatCards(projectId: string): Promise<StatCardsData> {
  await authorizeActiveUser();

  const now = new Date();
  const todayStart = startOfDay(now);
  const sevenDaysAgo = subDays(now, 7);
  const oneMonthAgo = subMonths(now, 1);
  const todayDate = format(now, "yyyy-MM-dd");
  const sevenDaysFromNowDate = format(addDays(now, 7), "yyyy-MM-dd");

  const [row] = await db
    .select({
      // Tracks delivery through a finished sprint, not just the Done column
      // — and counts every work type, subtasks included (no parentId
      // restriction, unlike the counters below). `completeOneLotProjectSprint`
      // migrates any not-yet-done item off a sprint before marking it
      // completed, so everything still attached to a completed sprint is,
      // by construction, work that actually shipped in it.
      completed: sql<number>`count(*) filter (where ${oneLotProjectSprint.status} = 'completed')::int`,
      // Excludes items whose sprint has already completed, so a shipped item
      // never also reads as upcoming — belt-and-suspenders alongside the
      // `isDone = false` check, in case that migration invariant ever changes.
      dueSoon: sql<number>`count(*) filter (where ${oneLotProjectWorkItem.parentId} is null and ${oneLotProjectWorkItem.dueDate} is not null and ${oneLotProjectWorkItem.dueDate} >= ${todayDate} and ${oneLotProjectWorkItem.dueDate} <= ${sevenDaysFromNowDate} and ${oneLotProjectBoardColumn.isDone} = false and (${oneLotProjectSprint.status} is null or ${oneLotProjectSprint.status} <> 'completed'))::int`,
      updatedToday: sql<number>`count(*) filter (where ${oneLotProjectWorkItem.parentId} is null and ${oneLotProjectWorkItem.updatedAt} >= ${todayStart})::int`,
      updated7d: sql<number>`count(*) filter (where ${oneLotProjectWorkItem.parentId} is null and ${oneLotProjectWorkItem.updatedAt} >= ${sevenDaysAgo})::int`,
      updated1m: sql<number>`count(*) filter (where ${oneLotProjectWorkItem.parentId} is null and ${oneLotProjectWorkItem.updatedAt} >= ${oneMonthAgo})::int`,
      updatedAll: sql<number>`count(*) filter (where ${oneLotProjectWorkItem.parentId} is null)::int`,
      createdToday: sql<number>`count(*) filter (where ${oneLotProjectWorkItem.parentId} is null and ${oneLotProjectWorkItem.createdAt} >= ${todayStart})::int`,
      created7d: sql<number>`count(*) filter (where ${oneLotProjectWorkItem.parentId} is null and ${oneLotProjectWorkItem.createdAt} >= ${sevenDaysAgo})::int`,
      created1m: sql<number>`count(*) filter (where ${oneLotProjectWorkItem.parentId} is null and ${oneLotProjectWorkItem.createdAt} >= ${oneMonthAgo})::int`,
      createdAll: sql<number>`count(*) filter (where ${oneLotProjectWorkItem.parentId} is null)::int`,
    })
    .from(oneLotProjectWorkItem)
    .innerJoin(oneLotProjectBoardColumn, eq(oneLotProjectBoardColumn.id, oneLotProjectWorkItem.columnId))
    .leftJoin(oneLotProjectSprint, eq(oneLotProjectSprint.id, oneLotProjectWorkItem.sprintId))
    .where(eq(oneLotProjectWorkItem.projectId, projectId));

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
  await authorizeActiveUser();

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

/** Summary page's Completed Sprints card (and the Sprint Velocity chart, which reuses this same fetch) — most recently completed first. */
export async function getOneLotProjectCompletedSprints(projectId: string): Promise<CompletedSprintRow[]> {
  await authorizeActiveUser();

  const rows = await db
    .select({
      id: oneLotProjectSprint.id,
      name: oneLotProjectSprint.name,
      itemCode: oneLotProjectSprint.itemCode,
      startDate: oneLotProjectSprint.startDate,
      endDate: oneLotProjectSprint.endDate,
      completedAt: oneLotProjectSprint.completedAt,
      itemCount: sql<number>`count(${oneLotProjectWorkItem.id}) filter (where ${oneLotProjectWorkItem.parentId} is null)::int`,
      doneItemCount: sql<number>`count(${oneLotProjectWorkItem.id}) filter (where ${oneLotProjectWorkItem.parentId} is null and ${oneLotProjectBoardColumn.isDone} = true)::int`,
      // Top-level only, same convention as the Backlog sprint header's own points total.
      storyPoints: sql<string>`coalesce(sum(${oneLotProjectWorkItem.storyPoints}) filter (where ${oneLotProjectWorkItem.parentId} is null), 0)`,
    })
    .from(oneLotProjectSprint)
    .leftJoin(oneLotProjectWorkItem, eq(oneLotProjectWorkItem.sprintId, oneLotProjectSprint.id))
    .leftJoin(oneLotProjectBoardColumn, eq(oneLotProjectBoardColumn.id, oneLotProjectWorkItem.columnId))
    .where(and(eq(oneLotProjectSprint.projectId, projectId), eq(oneLotProjectSprint.status, "completed")))
    .groupBy(oneLotProjectSprint.id)
    .orderBy(desc(oneLotProjectSprint.completedAt));

  return rows.map((row) => ({ ...row, storyPoints: Number(row.storyPoints) }));
}

/**
 * Active sprint's burndown — remaining vs. ideal story points per day from
 * the sprint's start through today (capped at its end date). There's no
 * per-item "completed at" timestamp, so each day's "done" total is
 * approximated from `updatedAt` on items already sitting in a Done column —
 * accurate as long as a done item isn't edited again afterward. Returns
 * `points: []` when there's no active sprint, or it has no start/end date
 * yet (dates are optional at creation — see `startOneLotProjectSprint`).
 */
export async function getOneLotProjectActiveSprintBurndown(projectId: string): Promise<BurndownData> {
  await authorizeActiveUser();

  const [sprint] = await db
    .select({
      id: oneLotProjectSprint.id,
      name: oneLotProjectSprint.name,
      startDate: oneLotProjectSprint.startDate,
      endDate: oneLotProjectSprint.endDate,
    })
    .from(oneLotProjectSprint)
    .where(and(eq(oneLotProjectSprint.projectId, projectId), eq(oneLotProjectSprint.status, "active")))
    .limit(1);

  if (!sprint || !sprint.startDate || !sprint.endDate) {
    return { sprint: sprint ? { id: sprint.id, name: sprint.name } : null, totalPoints: 0, points: [] };
  }

  const items = await db
    .select({
      storyPoints: oneLotProjectWorkItem.storyPoints,
      isDone: oneLotProjectBoardColumn.isDone,
      updatedAt: oneLotProjectWorkItem.updatedAt,
    })
    .from(oneLotProjectWorkItem)
    .innerJoin(oneLotProjectBoardColumn, eq(oneLotProjectBoardColumn.id, oneLotProjectWorkItem.columnId))
    .where(and(eq(oneLotProjectWorkItem.sprintId, sprint.id), isNull(oneLotProjectWorkItem.parentId)));

  const totalPoints = items.reduce((sum, item) => sum + Number(item.storyPoints ?? 0), 0);

  const start = startOfDay(parseISO(sprint.startDate));
  const end = startOfDay(parseISO(sprint.endDate));
  const today = startOfDay(new Date());
  const lastDay = today < end ? today : end;
  const totalSprintDays = Math.max(differenceInCalendarDays(end, start), 1);

  const points: BurndownPoint[] = [];
  for (let day = start; day <= lastDay; day = addDays(day, 1)) {
    const dayEnd = addDays(day, 1);
    const doneByDay = items.reduce((sum, item) => {
      if (!item.isDone || item.updatedAt >= dayEnd) return sum;
      return sum + Number(item.storyPoints ?? 0);
    }, 0);
    const elapsedDays = Math.min(differenceInCalendarDays(day, start), totalSprintDays);
    points.push({
      date: format(day, "yyyy-MM-dd"),
      remaining: Math.max(totalPoints - doneByDay, 0),
      ideal: Math.max(totalPoints - (totalPoints / totalSprintDays) * elapsedDays, 0),
    });
  }

  return { sprint: { id: sprint.id, name: sprint.name }, totalPoints, points };
}
