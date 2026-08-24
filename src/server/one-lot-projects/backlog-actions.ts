"use server";

import { and, eq, ilike, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import {
  oneLotProject,
  oneLotProjectBoardColumn,
  oneLotProjectSprint,
  oneLotProjectWorkItem,
  oneLotProjectWorkItemComment,
} from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { AuthorizationError, authorize } from "@/lib/session";
import {
  boardColumnFormSchema,
  commentFormSchema,
  sprintFormSchema,
  workItemFormSchema,
  workItemPatchSchema,
  type BoardColumnFormInput,
  type CommentFormInput,
  type SprintFormInput,
  type WorkItemFormInput,
  type WorkItemPatchInput,
  type WorkItemPriorityValue,
  type WorkItemTypeValue,
} from "@/lib/validation/one-lot-project-backlog";
import { assertOneLotProjectContentAccess } from "./queries";
import {
  getOneLotProjectBacklogBoard,
  getOneLotProjectKanbanBoard,
  getOneLotProjectWorkItemDetail,
} from "./backlog-queries";
import type { BacklogBoardData, KanbanBoardData, WorkItemDetailRow } from "./backlog-types";

async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "That request was not valid." };
    }
    console.error("[one-lot-projects/backlog] action failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

function revalidateBoard(projectId: string) {
  revalidatePath(`/one-lot-projects/${projectId}/list`);
  revalidatePath(`/one-lot-projects/${projectId}/kanban`);
}

// ---------------------------------------------------------------------------
// Fetch wrappers — queries.ts/backlog-queries.ts are server-only, so client
// components (useQuery) call these thin action wrappers instead.
// ---------------------------------------------------------------------------

export async function fetchOneLotProjectBacklogBoard(projectId: string): Promise<BacklogBoardData> {
  const actor = await authorize("one_lot_projects:read");
  return getOneLotProjectBacklogBoard(projectId, actor);
}

export async function fetchOneLotProjectWorkItemDetail(
  id: string,
  projectId: string,
): Promise<WorkItemDetailRow | null> {
  const actor = await authorize("one_lot_projects:read");
  return getOneLotProjectWorkItemDetail(id, projectId, actor);
}

export async function fetchOneLotProjectKanbanBoard(projectId: string): Promise<KanbanBoardData> {
  const actor = await authorize("one_lot_projects:read");
  return getOneLotProjectKanbanBoard(projectId, actor);
}

// ---------------------------------------------------------------------------
// Sprint CRUD + lifecycle
// ---------------------------------------------------------------------------

async function assertItemCodeAvailable(projectId: string, itemCode: string, excludeSprintId?: string) {
  const [existing] = await db
    .select({ id: oneLotProjectSprint.id })
    .from(oneLotProjectSprint)
    .where(
      and(
        eq(oneLotProjectSprint.projectId, projectId),
        ilike(oneLotProjectSprint.itemCode, itemCode),
        ...(excludeSprintId ? [ne(oneLotProjectSprint.id, excludeSprintId)] : []),
      ),
    )
    .limit(1);
  if (existing) throw new Error(`"${itemCode}" is already used by another sprint in this project.`);
}

export async function createOneLotProjectSprint(
  input: SprintFormInput & { projectId: string },
): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const actor = await authorize("one_lot_projects:read");
    const project = await assertOneLotProjectContentAccess(input.projectId, actor);
    const data = sprintFormSchema.parse(input);

    try {
      await assertItemCodeAvailable(input.projectId, data.itemCode);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "That item code is already in use." };
    }

    const id = crypto.randomUUID();
    await db.insert(oneLotProjectSprint).values({
      id,
      projectId: input.projectId,
      name: data.name,
      itemCode: data.itemCode,
      startDate: data.startDate,
      endDate: data.endDate,
      goal: data.goal || null,
      createdBy: actor.id,
    });

    revalidateBoard(input.projectId);
    return { ok: true, data: { id }, message: `"${data.name}" created in ${project.name}.` };
  });
}

export async function updateOneLotProjectSprint(
  input: SprintFormInput & { id: string; projectId: string },
): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("one_lot_projects:read");
    await assertOneLotProjectContentAccess(input.projectId, actor);
    const data = sprintFormSchema.parse(input);

    try {
      await assertItemCodeAvailable(input.projectId, data.itemCode, input.id);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "That item code is already in use." };
    }

    const result = await db
      .update(oneLotProjectSprint)
      .set({
        name: data.name,
        itemCode: data.itemCode,
        startDate: data.startDate,
        endDate: data.endDate,
        goal: data.goal || null,
      })
      .where(and(eq(oneLotProjectSprint.id, input.id), eq(oneLotProjectSprint.projectId, input.projectId)))
      .returning({ id: oneLotProjectSprint.id });

    if (result.length === 0) return { ok: false, error: "That sprint no longer exists." };

    revalidateBoard(input.projectId);
    return { ok: true, data: undefined, message: `"${data.name}" updated.` };
  });
}

export async function startOneLotProjectSprint(input: { id: string; projectId: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("one_lot_projects:read");
    await assertOneLotProjectContentAccess(input.projectId, actor);

    const [sprint] = await db
      .select({ id: oneLotProjectSprint.id, status: oneLotProjectSprint.status, name: oneLotProjectSprint.name })
      .from(oneLotProjectSprint)
      .where(and(eq(oneLotProjectSprint.id, input.id), eq(oneLotProjectSprint.projectId, input.projectId)))
      .limit(1);
    if (!sprint) return { ok: false, error: "That sprint no longer exists." };
    if (sprint.status !== "planned") return { ok: false, error: "Only a planned sprint can be started." };

    const [alreadyActive] = await db
      .select({ id: oneLotProjectSprint.id })
      .from(oneLotProjectSprint)
      .where(and(eq(oneLotProjectSprint.projectId, input.projectId), eq(oneLotProjectSprint.status, "active")))
      .limit(1);
    if (alreadyActive) return { ok: false, error: "Another sprint in this project is already active." };

    try {
      const result = await db
        .update(oneLotProjectSprint)
        .set({ status: "active", startedAt: new Date() })
        .where(and(eq(oneLotProjectSprint.id, input.id), eq(oneLotProjectSprint.status, "planned")))
        .returning({ id: oneLotProjectSprint.id });
      if (result.length === 0) return { ok: false, error: "Only a planned sprint can be started." };
    } catch {
      return { ok: false, error: "Another sprint in this project is already active." };
    }

    revalidateBoard(input.projectId);
    return { ok: true, data: undefined, message: `"${sprint.name}" started.` };
  });
}

export async function completeOneLotProjectSprint(input: { id: string; projectId: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("one_lot_projects:read");
    await assertOneLotProjectContentAccess(input.projectId, actor);

    const [sprint] = await db
      .select({ id: oneLotProjectSprint.id, status: oneLotProjectSprint.status, name: oneLotProjectSprint.name })
      .from(oneLotProjectSprint)
      .where(and(eq(oneLotProjectSprint.id, input.id), eq(oneLotProjectSprint.projectId, input.projectId)))
      .limit(1);
    if (!sprint) return { ok: false, error: "That sprint no longer exists." };
    if (sprint.status !== "active") return { ok: false, error: "Only an active sprint can be completed." };

    await db
      .update(oneLotProjectSprint)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(oneLotProjectSprint.id, input.id));

    // "Finished" = sits in the project's `is_done` column. The `OR ... IS NULL`
    // guard is a safety net (every project should always have exactly one
    // is_done column via seeding) — without it, a missing done-column would
    // make the `<>` comparison NULL and silently migrate nothing.
    const doneColumnIdSql = sql`(SELECT id FROM one_lot_project_board_column WHERE project_id = ${input.projectId} AND is_done = true LIMIT 1)`;

    // Migrate unfinished top-level items back to the Backlog, appended after
    // its current items — codes never change.
    await db.execute(sql`
      WITH base AS (
        SELECT COALESCE(MAX(sort_order), -1) AS max_order
        FROM one_lot_project_work_item
        WHERE project_id = ${input.projectId} AND sprint_id IS NULL AND parent_id IS NULL
      ),
      ranked AS (
        SELECT w.id, base.max_order + ROW_NUMBER() OVER (ORDER BY w.sort_order) AS new_order
        FROM one_lot_project_work_item w, base
        WHERE w.sprint_id = ${input.id} AND w.parent_id IS NULL
          AND (w.column_id <> ${doneColumnIdSql} OR ${doneColumnIdSql} IS NULL)
      )
      UPDATE one_lot_project_work_item AS w
      SET sprint_id = NULL, sort_order = ranked.new_order, updated_at = now()
      FROM ranked
      WHERE w.id = ranked.id
    `);

    // Unfinished subtasks aren't board rows — just clear sprintId, no sortOrder to fix up.
    await db.execute(sql`
      UPDATE one_lot_project_work_item
      SET sprint_id = NULL, updated_at = now()
      WHERE sprint_id = ${input.id} AND parent_id IS NOT NULL
        AND (column_id <> ${doneColumnIdSql} OR ${doneColumnIdSql} IS NULL)
    `);

    revalidateBoard(input.projectId);
    return { ok: true, data: undefined, message: `"${sprint.name}" completed.` };
  });
}

// ---------------------------------------------------------------------------
// Work items
// ---------------------------------------------------------------------------

type CreateWorkItemInput = {
  projectId: string;
  sprintId: string | null;
  parentId?: string;
  /** Omit to land in the project's default column (e.g. "To Do") — the Kanban board's "+ Create" passes a specific column explicitly. */
  columnId?: string;
  type: WorkItemTypeValue;
  title: string;
  description?: string | null;
  assigneeId?: string | null;
  priority?: WorkItemPriorityValue;
  dueDate?: string | null;
  storyPoints?: string | null;
};

/**
 * The one function that does the counter+insert (see `backlog-queries.ts`'s
 * doc comments on the "no db.transaction()" constraint) — used both by the
 * board's "+ Create" flow and the detail Sheet's inline "add subtask" row.
 */
export async function createOneLotProjectWorkItem(
  input: CreateWorkItemInput,
): Promise<ActionResult<{ id: string; code: string }>> {
  return run(async () => {
    const actor = await authorize("one_lot_projects:read");
    await assertOneLotProjectContentAccess(input.projectId, actor);

    const title = input.title.trim();
    if (!title) return { ok: false, error: "Title is required." };

    let code: string;
    if (input.sprintId) {
      const [counter] = await db
        .update(oneLotProjectSprint)
        .set({ nextItemNumber: sql`${oneLotProjectSprint.nextItemNumber} + 1` })
        .where(eq(oneLotProjectSprint.id, input.sprintId))
        .returning({
          assigned: sql<number>`${oneLotProjectSprint.nextItemNumber} - 1`,
          itemCode: oneLotProjectSprint.itemCode,
        });
      if (!counter) return { ok: false, error: "That sprint no longer exists." };
      code = `${counter.itemCode}-${counter.assigned}`;
    } else {
      const [counter] = await db
        .update(oneLotProject)
        .set({ nextBacklogItemNumber: sql`${oneLotProject.nextBacklogItemNumber} + 1` })
        .where(eq(oneLotProject.id, input.projectId))
        .returning({ assigned: sql<number>`${oneLotProject.nextBacklogItemNumber} - 1` });
      if (!counter) return { ok: false, error: "This project no longer exists." };
      code = `Backlog-${String(counter.assigned).padStart(3, "0")}`;
    }

    let columnId = input.columnId;
    if (!columnId) {
      const [defaultColumn] = await db
        .select({ id: oneLotProjectBoardColumn.id })
        .from(oneLotProjectBoardColumn)
        .where(and(eq(oneLotProjectBoardColumn.projectId, input.projectId), eq(oneLotProjectBoardColumn.isDefault, true)))
        .limit(1);
      if (!defaultColumn) return { ok: false, error: "This project has no default column configured." };
      columnId = defaultColumn.id;
    }

    let sortOrder = 0;
    let boardSortOrder = 0;
    if (!input.parentId) {
      const [maxRow] = await db
        .select({ max: sql<number>`coalesce(max(${oneLotProjectWorkItem.sortOrder}), -1)::int` })
        .from(oneLotProjectWorkItem)
        .where(
          and(
            eq(oneLotProjectWorkItem.projectId, input.projectId),
            input.sprintId
              ? eq(oneLotProjectWorkItem.sprintId, input.sprintId)
              : sql`${oneLotProjectWorkItem.sprintId} is null`,
            sql`${oneLotProjectWorkItem.parentId} is null`,
          ),
        );
      sortOrder = (maxRow?.max ?? -1) + 1;

      const [maxBoardRow] = await db
        .select({ max: sql<number>`coalesce(max(${oneLotProjectWorkItem.boardSortOrder}), -1)::int` })
        .from(oneLotProjectWorkItem)
        .where(and(eq(oneLotProjectWorkItem.projectId, input.projectId), eq(oneLotProjectWorkItem.columnId, columnId)));
      boardSortOrder = (maxBoardRow?.max ?? -1) + 1;
    }

    const id = crypto.randomUUID();
    await db.insert(oneLotProjectWorkItem).values({
      id,
      projectId: input.projectId,
      sprintId: input.sprintId,
      columnId,
      parentId: input.parentId ?? null,
      code,
      type: input.type,
      title,
      description: input.description || null,
      priority: input.priority ?? "medium",
      assigneeId: input.assigneeId || null,
      dueDate: input.dueDate || null,
      storyPoints: input.storyPoints || null,
      sortOrder,
      boardSortOrder,
      createdBy: actor.id,
    });

    revalidateBoard(input.projectId);
    return { ok: true, data: { id, code }, message: `${code} created.` };
  });
}

export async function createOneLotProjectWorkItemWithSubtasks(
  input: WorkItemFormInput & { projectId: string; sprintId: string | null; columnId?: string },
): Promise<ActionResult<{ id: string; code: string }>> {
  return run(async () => {
    const data = workItemFormSchema.parse(input);

    const parentResult = await createOneLotProjectWorkItem({
      projectId: input.projectId,
      sprintId: input.sprintId,
      columnId: input.columnId,
      type: data.type,
      title: data.title,
      description: data.description || null,
      assigneeId: data.assigneeId || null,
      priority: data.priority,
      dueDate: data.dueDate || null,
      storyPoints: data.storyPoints || null,
    });
    if (!parentResult.ok) return parentResult;

    for (const subtask of data.subtasks ?? []) {
      if (!subtask.title.trim()) continue;
      await createOneLotProjectWorkItem({
        projectId: input.projectId,
        sprintId: input.sprintId,
        parentId: parentResult.data.id,
        type: data.type,
        title: subtask.title,
        assigneeId: subtask.assigneeId || null,
      });
    }

    return parentResult;
  });
}

export async function updateOneLotProjectWorkItem(input: {
  id: string;
  projectId: string;
  patch: WorkItemPatchInput;
}): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("one_lot_projects:read");
    await assertOneLotProjectContentAccess(input.projectId, actor);
    const patch = workItemPatchSchema.parse(input.patch);

    const values: Record<string, unknown> = {};
    if (patch.title !== undefined) values.title = patch.title;
    if (patch.description !== undefined) values.description = patch.description || null;
    if (patch.columnId !== undefined) values.columnId = patch.columnId;
    if (patch.priority !== undefined) values.priority = patch.priority;
    if (patch.assigneeId !== undefined) values.assigneeId = patch.assigneeId || null;
    if (patch.dueDate !== undefined) values.dueDate = patch.dueDate || null;
    if (patch.storyPoints !== undefined) values.storyPoints = patch.storyPoints || null;

    if (Object.keys(values).length === 0) return { ok: true, data: undefined, message: "" };

    const result = await db
      .update(oneLotProjectWorkItem)
      .set(values)
      .where(and(eq(oneLotProjectWorkItem.id, input.id), eq(oneLotProjectWorkItem.projectId, input.projectId)))
      .returning({ id: oneLotProjectWorkItem.id });

    if (result.length === 0) return { ok: false, error: "That item no longer exists." };

    revalidateBoard(input.projectId);
    return { ok: true, data: undefined, message: "Saved." };
  });
}

export async function reorderOneLotProjectWorkItems(input: {
  projectId: string;
  moves: { id: string; sprintId: string | null; sortOrder: number }[];
}): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("one_lot_projects:read");
    await assertOneLotProjectContentAccess(input.projectId, actor);

    if (input.moves.length === 0) return { ok: true, data: undefined, message: "" };

    const rows = sql.join(
      input.moves.map((m) => sql`(${m.id}::text, ${m.sprintId}::text, ${m.sortOrder}::int)`),
      sql`, `,
    );

    await db.execute(sql`
      UPDATE one_lot_project_work_item AS w
      SET sprint_id = c.sprint_id, sort_order = c.sort_order, updated_at = now()
      FROM (VALUES ${rows}) AS c(id, sprint_id, sort_order)
      WHERE w.id = c.id AND w.project_id = ${input.projectId}
    `);

    return { ok: true, data: undefined, message: "" };
  });
}

export async function reorderOneLotProjectWorkItemsOnBoard(input: {
  projectId: string;
  moves: { id: string; columnId: string; boardSortOrder: number }[];
}): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("one_lot_projects:read");
    await assertOneLotProjectContentAccess(input.projectId, actor);

    if (input.moves.length === 0) return { ok: true, data: undefined, message: "" };

    const rows = sql.join(
      input.moves.map((m) => sql`(${m.id}::text, ${m.columnId}::text, ${m.boardSortOrder}::int)`),
      sql`, `,
    );

    await db.execute(sql`
      UPDATE one_lot_project_work_item AS w
      SET column_id = c.column_id, board_sort_order = c.board_sort_order, updated_at = now()
      FROM (VALUES ${rows}) AS c(id, column_id, board_sort_order)
      WHERE w.id = c.id AND w.project_id = ${input.projectId}
    `);

    return { ok: true, data: undefined, message: "" };
  });
}

// ---------------------------------------------------------------------------
// Board columns
// ---------------------------------------------------------------------------

export async function createOneLotProjectBoardColumn(
  input: BoardColumnFormInput & { projectId: string },
): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const actor = await authorize("one_lot_projects:read");
    await assertOneLotProjectContentAccess(input.projectId, actor);
    const data = boardColumnFormSchema.parse(input);

    const [maxRow] = await db
      .select({ max: sql<number>`coalesce(max(${oneLotProjectBoardColumn.sortOrder}), -1)::int` })
      .from(oneLotProjectBoardColumn)
      .where(eq(oneLotProjectBoardColumn.projectId, input.projectId));

    const id = crypto.randomUUID();
    await db.insert(oneLotProjectBoardColumn).values({
      id,
      projectId: input.projectId,
      name: data.name,
      sortOrder: (maxRow?.max ?? -1) + 1,
    });

    revalidateBoard(input.projectId);
    return { ok: true, data: { id }, message: `"${data.name}" column added.` };
  });
}

export async function renameOneLotProjectBoardColumn(
  input: BoardColumnFormInput & { id: string; projectId: string },
): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("one_lot_projects:read");
    await assertOneLotProjectContentAccess(input.projectId, actor);
    const data = boardColumnFormSchema.parse(input);

    const result = await db
      .update(oneLotProjectBoardColumn)
      .set({ name: data.name })
      .where(and(eq(oneLotProjectBoardColumn.id, input.id), eq(oneLotProjectBoardColumn.projectId, input.projectId)))
      .returning({ id: oneLotProjectBoardColumn.id });

    if (result.length === 0) return { ok: false, error: "That column no longer exists." };

    revalidateBoard(input.projectId);
    return { ok: true, data: undefined, message: `Renamed to "${data.name}".` };
  });
}

export async function deleteOneLotProjectBoardColumn(input: { id: string; projectId: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("one_lot_projects:read");
    await assertOneLotProjectContentAccess(input.projectId, actor);

    const [column] = await db
      .select({ id: oneLotProjectBoardColumn.id, name: oneLotProjectBoardColumn.name })
      .from(oneLotProjectBoardColumn)
      .where(and(eq(oneLotProjectBoardColumn.id, input.id), eq(oneLotProjectBoardColumn.projectId, input.projectId)))
      .limit(1);
    if (!column) return { ok: false, error: "That column no longer exists." };

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(oneLotProjectWorkItem)
      .where(eq(oneLotProjectWorkItem.columnId, input.id));
    if (count > 0) {
      return { ok: false, error: `Move ${count} card${count === 1 ? "" : "s"} to another column first.` };
    }

    await db.delete(oneLotProjectBoardColumn).where(eq(oneLotProjectBoardColumn.id, input.id));

    revalidateBoard(input.projectId);
    return { ok: true, data: undefined, message: `"${column.name}" column deleted.` };
  });
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export async function addOneLotProjectWorkItemComment(
  input: CommentFormInput & { workItemId: string; projectId: string },
): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const actor = await authorize("one_lot_projects:read");
    await assertOneLotProjectContentAccess(input.projectId, actor);
    const data = commentFormSchema.parse(input);

    const id = crypto.randomUUID();
    await db.insert(oneLotProjectWorkItemComment).values({
      id,
      workItemId: input.workItemId,
      body: data.body,
      authorId: actor.id,
    });

    revalidateBoard(input.projectId);
    return { ok: true, data: { id }, message: "Comment added." };
  });
}
