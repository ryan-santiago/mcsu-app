"use server";

import { and, eq, ilike, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import {
  oneLotProject,
  oneLotProjectBoardColumn,
  oneLotProjectSprint,
  oneLotProjectWorkItem,
  oneLotProjectWorkItemComment,
  user,
  type AuditChange,
} from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { diffFields, recordAudit } from "@/lib/audit";
import { sanitizeDescriptionHtml } from "@/lib/sanitize-html";
import { AuthorizationError, authorizeActiveUser } from "@/lib/session";
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

/**
 * Prepends a synthetic "which record" field ahead of a real field-level diff.
 * `entityId`/`entityLabel` on every one-lot-projects audit entry point at the
 * *project* (see `RBAC.md`'s note on `entityLabel` — it labels the entity
 * `entityId` refers to), so without this an edit like "Priority: Medium →
 * High" would carry no indication of which sprint/work item it happened to.
 */
function withIdentity(label: string, value: string, fieldChanges: AuditChange[]): AuditChange[] {
  return [{ field: "identity", label, oldValue: null, newValue: value }, ...fieldChanges];
}

// ---------------------------------------------------------------------------
// Fetch wrappers — queries.ts/backlog-queries.ts are server-only, so client
// components (useQuery) call these thin action wrappers instead.
// ---------------------------------------------------------------------------

export async function fetchOneLotProjectBacklogBoard(projectId: string): Promise<BacklogBoardData> {
  const actor = await authorizeActiveUser();
  return getOneLotProjectBacklogBoard(projectId, actor);
}

export async function fetchOneLotProjectWorkItemDetail(
  id: string,
  projectId: string,
): Promise<WorkItemDetailRow | null> {
  const actor = await authorizeActiveUser();
  return getOneLotProjectWorkItemDetail(id, projectId, actor);
}

export async function fetchOneLotProjectKanbanBoard(projectId: string): Promise<KanbanBoardData> {
  const actor = await authorizeActiveUser();
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
    const actor = await authorizeActiveUser();
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
      startDate: data.startDate || null,
      endDate: data.endDate || null,
      goal: data.goal || null,
      createdBy: actor.id,
    });

    await recordAudit({
      module: "one_lot_projects",
      action: "sprint_created",
      entityId: input.projectId,
      entityLabel: project.name,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(null, { sprint: `${data.itemCode} — ${data.name}` }, { sprint: "Sprint" }),
    });

    revalidateBoard(input.projectId);
    return { ok: true, data: { id }, message: `"${data.name}" created in ${project.name}.` };
  });
}

export async function updateOneLotProjectSprint(
  input: SprintFormInput & { id: string; projectId: string },
): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorizeActiveUser();
    const project = await assertOneLotProjectContentAccess(input.projectId, actor);
    const data = sprintFormSchema.parse(input);

    const [before] = await db
      .select({
        name: oneLotProjectSprint.name,
        itemCode: oneLotProjectSprint.itemCode,
        startDate: oneLotProjectSprint.startDate,
        endDate: oneLotProjectSprint.endDate,
        goal: oneLotProjectSprint.goal,
      })
      .from(oneLotProjectSprint)
      .where(and(eq(oneLotProjectSprint.id, input.id), eq(oneLotProjectSprint.projectId, input.projectId)))
      .limit(1);
    if (!before) return { ok: false, error: "That sprint no longer exists." };

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
        startDate: data.startDate || null,
        endDate: data.endDate || null,
        goal: data.goal || null,
      })
      .where(and(eq(oneLotProjectSprint.id, input.id), eq(oneLotProjectSprint.projectId, input.projectId)))
      .returning({ id: oneLotProjectSprint.id });

    if (result.length === 0) return { ok: false, error: "That sprint no longer exists." };

    const fieldChanges = diffFields(
      before,
      { name: data.name, itemCode: data.itemCode, startDate: data.startDate || null, endDate: data.endDate || null, goal: data.goal || null },
      { name: "Sprint name", itemCode: "Item code", startDate: "Start date", endDate: "End date", goal: "Goal" },
    );
    if (fieldChanges.length > 0) {
      await recordAudit({
        module: "one_lot_projects",
        action: "sprint_updated",
        entityId: input.projectId,
        entityLabel: project.name,
        actorId: actor.id,
        actorEmail: actor.email,
        changes: withIdentity("Sprint", before.name, fieldChanges),
      });
    }

    revalidateBoard(input.projectId);
    return { ok: true, data: undefined, message: `"${data.name}" updated.` };
  });
}

export async function startOneLotProjectSprint(input: { id: string; projectId: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorizeActiveUser();
    const project = await assertOneLotProjectContentAccess(input.projectId, actor);

    const [sprint] = await db
      .select({
        id: oneLotProjectSprint.id,
        status: oneLotProjectSprint.status,
        name: oneLotProjectSprint.name,
        startDate: oneLotProjectSprint.startDate,
        endDate: oneLotProjectSprint.endDate,
      })
      .from(oneLotProjectSprint)
      .where(and(eq(oneLotProjectSprint.id, input.id), eq(oneLotProjectSprint.projectId, input.projectId)))
      .limit(1);
    if (!sprint) return { ok: false, error: "That sprint no longer exists." };
    if (sprint.status !== "planned") return { ok: false, error: "Only a planned sprint can be started." };
    if (!sprint.startDate || !sprint.endDate) {
      return { ok: false, error: "Set a start and end date before starting this sprint." };
    }

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

    await recordAudit({
      module: "one_lot_projects",
      action: "sprint_started",
      entityId: input.projectId,
      entityLabel: project.name,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(null, { sprint: sprint.name }, { sprint: "Sprint" }),
    });

    revalidateBoard(input.projectId);
    return { ok: true, data: undefined, message: `"${sprint.name}" started.` };
  });
}

export async function completeOneLotProjectSprint(input: { id: string; projectId: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorizeActiveUser();
    const project = await assertOneLotProjectContentAccess(input.projectId, actor);

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

    await recordAudit({
      module: "one_lot_projects",
      action: "sprint_completed",
      entityId: input.projectId,
      entityLabel: project.name,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(null, { sprint: sprint.name }, { sprint: "Sprint" }),
    });

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
    const actor = await authorizeActiveUser();
    const project = await assertOneLotProjectContentAccess(input.projectId, actor);

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
    let columnIsDone: boolean;
    if (!columnId) {
      const [defaultColumn] = await db
        .select({ id: oneLotProjectBoardColumn.id, isDone: oneLotProjectBoardColumn.isDone })
        .from(oneLotProjectBoardColumn)
        .where(and(eq(oneLotProjectBoardColumn.projectId, input.projectId), eq(oneLotProjectBoardColumn.isDefault, true)))
        .limit(1);
      if (!defaultColumn) return { ok: false, error: "This project has no default column configured." };
      columnId = defaultColumn.id;
      columnIsDone = defaultColumn.isDone;
    } else {
      // The Kanban board's "+ Create" passes a specific column explicitly —
      // including, sometimes, the Done column itself.
      const [column] = await db
        .select({ isDone: oneLotProjectBoardColumn.isDone })
        .from(oneLotProjectBoardColumn)
        .where(eq(oneLotProjectBoardColumn.id, columnId))
        .limit(1);
      columnIsDone = column?.isDone ?? false;
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
      description: input.description ? sanitizeDescriptionHtml(input.description) || null : null,
      priority: input.priority ?? "medium",
      assigneeId: input.assigneeId || null,
      dueDate: input.dueDate || null,
      storyPoints: input.storyPoints || null,
      sortOrder,
      boardSortOrder,
      doneAt: columnIsDone ? new Date() : null,
      createdBy: actor.id,
    });

    await recordAudit({
      module: "one_lot_projects",
      action: "work_item_created",
      entityId: input.projectId,
      entityLabel: project.name,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(
        null,
        { item: `${code} — ${title}` },
        { item: input.parentId ? "Subtask" : "Work item" },
      ),
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

    // Subtasks are only ever created under a Task — the form hides the field
    // for a Bug, this is the defense-in-depth backstop. Always stored as
    // their own "subtask" type, never inheriting the parent's.
    if (data.type === "task") {
      for (const subtask of data.subtasks ?? []) {
        if (!subtask.title.trim()) continue;
        await createOneLotProjectWorkItem({
          projectId: input.projectId,
          sprintId: input.sprintId,
          parentId: parentResult.data.id,
          type: "subtask",
          title: subtask.title,
          assigneeId: subtask.assigneeId || null,
        });
      }
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
    const actor = await authorizeActiveUser();
    const project = await assertOneLotProjectContentAccess(input.projectId, actor);
    const patch = workItemPatchSchema.parse(input.patch);

    const [before] = await db
      .select({
        code: oneLotProjectWorkItem.code,
        title: oneLotProjectWorkItem.title,
        description: oneLotProjectWorkItem.description,
        columnId: oneLotProjectWorkItem.columnId,
        priority: oneLotProjectWorkItem.priority,
        assigneeId: oneLotProjectWorkItem.assigneeId,
        dueDate: oneLotProjectWorkItem.dueDate,
        storyPoints: oneLotProjectWorkItem.storyPoints,
        coverColor: oneLotProjectWorkItem.coverColor,
      })
      .from(oneLotProjectWorkItem)
      .where(and(eq(oneLotProjectWorkItem.id, input.id), eq(oneLotProjectWorkItem.projectId, input.projectId)))
      .limit(1);
    if (!before) return { ok: false, error: "That item no longer exists." };

    const values: Record<string, unknown> = {};
    if (patch.title !== undefined) values.title = patch.title;
    if (patch.description !== undefined) {
      values.description = patch.description ? sanitizeDescriptionHtml(patch.description) || null : null;
    }
    if (patch.columnId !== undefined) values.columnId = patch.columnId;
    if (patch.priority !== undefined) values.priority = patch.priority;
    if (patch.assigneeId !== undefined) values.assigneeId = patch.assigneeId || null;
    if (patch.dueDate !== undefined) values.dueDate = patch.dueDate || null;
    if (patch.storyPoints !== undefined) values.storyPoints = patch.storyPoints || null;
    if (patch.coverColor !== undefined) values.coverColor = patch.coverColor;

    // Crossing into or out of the Done column sets/clears `doneAt` — the
    // precise timestamp the burndown chart reads, instead of `updatedAt`
    // (which any unrelated field edit above would also bump).
    if (patch.columnId !== undefined && patch.columnId !== before.columnId) {
      const columnFlags = await db
        .select({ id: oneLotProjectBoardColumn.id, isDone: oneLotProjectBoardColumn.isDone })
        .from(oneLotProjectBoardColumn)
        .where(inArray(oneLotProjectBoardColumn.id, [before.columnId, patch.columnId]));
      const isDone = (id: string) => columnFlags.find((c) => c.id === id)?.isDone ?? false;
      if (isDone(patch.columnId) && !isDone(before.columnId)) values.doneAt = new Date();
      else if (!isDone(patch.columnId) && isDone(before.columnId)) values.doneAt = null;
    }

    if (Object.keys(values).length === 0) return { ok: true, data: undefined, message: "" };

    const result = await db
      .update(oneLotProjectWorkItem)
      .set(values)
      .where(and(eq(oneLotProjectWorkItem.id, input.id), eq(oneLotProjectWorkItem.projectId, input.projectId)))
      .returning({ id: oneLotProjectWorkItem.id });

    if (result.length === 0) return { ok: false, error: "That item no longer exists." };

    // Resolve columnId/assigneeId to display names so the trail reads "Status:
    // To Do → In Progress" rather than raw ids — only queried when touched.
    const [columnRows, userRows] = await Promise.all([
      "columnId" in values
        ? db
            .select({ id: oneLotProjectBoardColumn.id, name: oneLotProjectBoardColumn.name })
            .from(oneLotProjectBoardColumn)
            .where(inArray(oneLotProjectBoardColumn.id, [before.columnId, values.columnId as string]))
        : Promise.resolve([]),
      "assigneeId" in values
        ? db
            .select({ id: user.id, name: user.name })
            .from(user)
            .where(
              inArray(
                user.id,
                [before.assigneeId, values.assigneeId as string | null].filter((v): v is string => Boolean(v)),
              ),
            )
        : Promise.resolve([]),
    ]);
    const columnName = (id: string) => columnRows.find((c) => c.id === id)?.name ?? id;
    const assigneeName = (id: string | null) => (id ? (userRows.find((u) => u.id === id)?.name ?? id) : "Unassigned");

    const beforeDisplay: Record<string, unknown> = { ...before };
    const afterDisplay: Record<string, unknown> = { ...values };
    if ("columnId" in values) {
      beforeDisplay.columnId = columnName(before.columnId);
      afterDisplay.columnId = columnName(values.columnId as string);
    }
    if ("assigneeId" in values) {
      beforeDisplay.assigneeId = assigneeName(before.assigneeId);
      afterDisplay.assigneeId = assigneeName(values.assigneeId as string | null);
    }
    if ("description" in values) {
      // The field holds rich text HTML now — spelling out the raw markup in
      // the audit trail would be unreadable, so this just marks that it
      // changed rather than diffing the actual before/after content.
      beforeDisplay.description = before.description ? "(set)" : null;
      afterDisplay.description = values.description ? "(set)" : null;
    }

    // `doneAt` is a derived side effect of the column change already
    // reflected by the "Status" diff below, not a field the user directly
    // edited — omit it so the audit trail doesn't show a redundant entry.
    const touchedKeys = Object.keys(values).filter((key) => key !== "doneAt");
    const beforeSubset: Record<string, unknown> = {};
    const afterSubset: Record<string, unknown> = {};
    for (const key of touchedKeys) {
      beforeSubset[key] = beforeDisplay[key];
      afterSubset[key] = afterDisplay[key];
    }

    const fieldChanges = diffFields(beforeSubset, afterSubset, {
      title: "Title",
      description: "Description",
      columnId: "Status",
      priority: "Priority",
      assigneeId: "Assignee",
      dueDate: "Due date",
      storyPoints: "Story points",
      coverColor: "Cover",
    });

    if (fieldChanges.length > 0) {
      await recordAudit({
        module: "one_lot_projects",
        action: "work_item_updated",
        entityId: input.projectId,
        entityLabel: project.name,
        actorId: actor.id,
        actorEmail: actor.email,
        changes: withIdentity("Work item", `${before.code} — ${before.title}`, fieldChanges),
      });
    }

    revalidateBoard(input.projectId);
    return { ok: true, data: undefined, message: "Saved." };
  });
}

export async function reorderOneLotProjectWorkItems(input: {
  projectId: string;
  moves: { id: string; sprintId: string | null; sortOrder: number }[];
}): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorizeActiveUser();
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
    const actor = await authorizeActiveUser();
    await assertOneLotProjectContentAccess(input.projectId, actor);

    if (input.moves.length === 0) return { ok: true, data: undefined, message: "" };

    const rows = sql.join(
      input.moves.map((m) => sql`(${m.id}::text, ${m.columnId}::text, ${m.boardSortOrder}::int)`),
      sql`, `,
    );

    // Same done-column reference `completeOneLotProjectSprint` uses. A drag
    // that lands a card in it sets `done_at`; a drag that pulls it back out
    // clears it — `w.column_id` here is the pre-update value, so both
    // comparisons see the move's actual before/after, not the new state.
    const doneColumnIdSql = sql`(SELECT id FROM one_lot_project_board_column WHERE project_id = ${input.projectId} AND is_done = true LIMIT 1)`;

    await db.execute(sql`
      UPDATE one_lot_project_work_item AS w
      SET column_id = c.column_id,
          board_sort_order = c.board_sort_order,
          done_at = CASE
            WHEN c.column_id = ${doneColumnIdSql} AND w.column_id IS DISTINCT FROM ${doneColumnIdSql} THEN now()
            WHEN c.column_id IS DISTINCT FROM ${doneColumnIdSql} AND w.column_id = ${doneColumnIdSql} THEN NULL
            ELSE w.done_at
          END,
          updated_at = now()
      FROM (VALUES ${rows}) AS c(id, column_id, board_sort_order)
      WHERE w.id = c.id AND w.project_id = ${input.projectId}
    `);

    return { ok: true, data: undefined, message: "" };
  });
}

// ---------------------------------------------------------------------------
// Board columns
// ---------------------------------------------------------------------------

export async function reorderOneLotProjectBoardColumns(input: {
  projectId: string;
  moves: { id: string; sortOrder: number }[];
}): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorizeActiveUser();
    await assertOneLotProjectContentAccess(input.projectId, actor);

    if (input.moves.length === 0) return { ok: true, data: undefined, message: "" };

    const rows = sql.join(
      input.moves.map((m) => sql`(${m.id}::text, ${m.sortOrder}::int)`),
      sql`, `,
    );

    await db.execute(sql`
      UPDATE one_lot_project_board_column AS c
      SET sort_order = v.sort_order
      FROM (VALUES ${rows}) AS v(id, sort_order)
      WHERE c.id = v.id AND c.project_id = ${input.projectId}
    `);

    revalidateBoard(input.projectId);
    return { ok: true, data: undefined, message: "" };
  });
}

export async function createOneLotProjectBoardColumn(
  input: BoardColumnFormInput & { projectId: string },
): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const actor = await authorizeActiveUser();
    const project = await assertOneLotProjectContentAccess(input.projectId, actor);
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

    await recordAudit({
      module: "one_lot_projects",
      action: "board_column_created",
      entityId: input.projectId,
      entityLabel: project.name,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(null, { column: data.name }, { column: "Board column" }),
    });

    revalidateBoard(input.projectId);
    return { ok: true, data: { id }, message: `"${data.name}" column added.` };
  });
}

export async function renameOneLotProjectBoardColumn(
  input: BoardColumnFormInput & { id: string; projectId: string },
): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorizeActiveUser();
    const project = await assertOneLotProjectContentAccess(input.projectId, actor);
    const data = boardColumnFormSchema.parse(input);

    const [before] = await db
      .select({ name: oneLotProjectBoardColumn.name })
      .from(oneLotProjectBoardColumn)
      .where(and(eq(oneLotProjectBoardColumn.id, input.id), eq(oneLotProjectBoardColumn.projectId, input.projectId)))
      .limit(1);
    if (!before) return { ok: false, error: "That column no longer exists." };

    const result = await db
      .update(oneLotProjectBoardColumn)
      .set({ name: data.name })
      .where(and(eq(oneLotProjectBoardColumn.id, input.id), eq(oneLotProjectBoardColumn.projectId, input.projectId)))
      .returning({ id: oneLotProjectBoardColumn.id });

    if (result.length === 0) return { ok: false, error: "That column no longer exists." };

    const fieldChanges = diffFields(before, { name: data.name }, { name: "Board column" });
    if (fieldChanges.length > 0) {
      await recordAudit({
        module: "one_lot_projects",
        action: "board_column_renamed",
        entityId: input.projectId,
        entityLabel: project.name,
        actorId: actor.id,
        actorEmail: actor.email,
        changes: fieldChanges,
      });
    }

    revalidateBoard(input.projectId);
    return { ok: true, data: undefined, message: `Renamed to "${data.name}".` };
  });
}

export async function deleteOneLotProjectBoardColumn(input: { id: string; projectId: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorizeActiveUser();
    const project = await assertOneLotProjectContentAccess(input.projectId, actor);

    const [column] = await db
      .select({ id: oneLotProjectBoardColumn.id, name: oneLotProjectBoardColumn.name, isDone: oneLotProjectBoardColumn.isDone })
      .from(oneLotProjectBoardColumn)
      .where(and(eq(oneLotProjectBoardColumn.id, input.id), eq(oneLotProjectBoardColumn.projectId, input.projectId)))
      .limit(1);
    if (!column) return { ok: false, error: "That column no longer exists." };

    // The done column is the only reference `completeOneLotProjectSprint`,
    // the burndown chart, velocity, and the "Completed" stat card have for
    // what counts as finished — losing it silently breaks all four (see the
    // doc comment on `oneLotProjectBoardColumn` in schema.ts). It can be
    // renamed freely; it just can never be deleted.
    if (column.isDone) {
      return { ok: false, error: `"${column.name}" is this project's Done column and can't be deleted — rename it instead if you want a different label.` };
    }

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(oneLotProjectWorkItem)
      .where(eq(oneLotProjectWorkItem.columnId, input.id));
    if (count > 0) {
      return { ok: false, error: `Move ${count} card${count === 1 ? "" : "s"} to another column first.` };
    }

    await db.delete(oneLotProjectBoardColumn).where(eq(oneLotProjectBoardColumn.id, input.id));

    await recordAudit({
      module: "one_lot_projects",
      action: "board_column_deleted",
      entityId: input.projectId,
      entityLabel: project.name,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields({ column: column.name }, null, { column: "Board column" }),
    });

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
    const actor = await authorizeActiveUser();
    const project = await assertOneLotProjectContentAccess(input.projectId, actor);
    const data = commentFormSchema.parse(input);

    const id = crypto.randomUUID();
    await db.insert(oneLotProjectWorkItemComment).values({
      id,
      workItemId: input.workItemId,
      body: data.body,
      authorId: actor.id,
    });

    const [item] = await db
      .select({ code: oneLotProjectWorkItem.code, title: oneLotProjectWorkItem.title })
      .from(oneLotProjectWorkItem)
      .where(eq(oneLotProjectWorkItem.id, input.workItemId))
      .limit(1);

    await recordAudit({
      module: "one_lot_projects",
      action: "comment_added",
      entityId: input.projectId,
      entityLabel: project.name,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: withIdentity(
        "Work item",
        item ? `${item.code} — ${item.title}` : "Unknown item",
        diffFields(null, { comment: data.body.length > 140 ? `${data.body.slice(0, 140)}…` : data.body }, { comment: "Comment" }),
      ),
    });

    revalidateBoard(input.projectId);
    return { ok: true, data: { id }, message: "Comment added." };
  });
}
