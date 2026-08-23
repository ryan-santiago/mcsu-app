"use server";

import { and, eq, ilike, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import {
  oneLotProject,
  oneLotProjectSprint,
  oneLotProjectWorkItem,
  oneLotProjectWorkItemComment,
} from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { AuthorizationError, authorize } from "@/lib/session";
import {
  commentFormSchema,
  sprintFormSchema,
  workItemFormSchema,
  workItemPatchSchema,
  type CommentFormInput,
  type SprintFormInput,
  type WorkItemFormInput,
  type WorkItemPatchInput,
  type WorkItemPriorityValue,
  type WorkItemTypeValue,
} from "@/lib/validation/one-lot-project-backlog";
import { assertOneLotProjectContentAccess } from "./queries";
import { getOneLotProjectBacklogBoard, getOneLotProjectWorkItemDetail } from "./backlog-queries";
import type { BacklogBoardData, WorkItemDetailRow } from "./backlog-types";

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
        WHERE w.sprint_id = ${input.id} AND w.status <> 'done' AND w.parent_id IS NULL
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
      WHERE sprint_id = ${input.id} AND status <> 'done' AND parent_id IS NOT NULL
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

    let sortOrder = 0;
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
    }

    const id = crypto.randomUUID();
    await db.insert(oneLotProjectWorkItem).values({
      id,
      projectId: input.projectId,
      sprintId: input.sprintId,
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
      createdBy: actor.id,
    });

    revalidateBoard(input.projectId);
    return { ok: true, data: { id, code }, message: `${code} created.` };
  });
}

export async function createOneLotProjectWorkItemWithSubtasks(
  input: WorkItemFormInput & { projectId: string; sprintId: string | null },
): Promise<ActionResult<{ id: string; code: string }>> {
  return run(async () => {
    const data = workItemFormSchema.parse(input);

    const parentResult = await createOneLotProjectWorkItem({
      projectId: input.projectId,
      sprintId: input.sprintId,
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
    if (patch.status !== undefined) values.status = patch.status;
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
