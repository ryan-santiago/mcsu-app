"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { taCandidate, taCandidateStage, type TaCandidate, type TaStage, type TaStageStatus } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { diffFields, recordAudit } from "@/lib/audit";
import { formatEmployeeDisplayName } from "@/lib/employee-format";
import { hasUnrestrictedAccess } from "@/lib/rbac";
import { AuthorizationError, authorize } from "@/lib/session";

import { listTaCandidateStages, listUsersWithPermission } from "./stage-queries";
import { TA_STAGE_LABELS, type TaCandidateStageRow, type UserOption } from "./stage-types";

async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "That request was not valid." };
    }
    console.error("[talent-acquisition/stages] action failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

const notesSchema = z.string().max(2000, "That's too long").optional();

function revalidateCandidate(requestId: string) {
  revalidatePath(`/talent-acquisition/${requestId}`);
}

async function getCandidate(candidateId: string): Promise<TaCandidate | null> {
  const [candidate] = await db.select().from(taCandidate).where(eq(taCandidate.id, candidateId)).limit(1);
  return candidate ?? null;
}

async function getStageRow(candidateId: string, stage: TaStage) {
  const [row] = await db
    .select()
    .from(taCandidateStage)
    .where(and(eq(taCandidateStage.candidateId, candidateId), eq(taCandidateStage.stage, stage)))
    .limit(1);
  return row ?? null;
}

/** Silently opens the next stage once its prerequisite passes — not itself a user action worth its own audit entry, the triggering "complete" call already is one. */
async function openStageIfMissing(candidateId: string, stage: TaStage, assigneeId: string | null = null) {
  const existing = await getStageRow(candidateId, stage);
  if (existing) return;
  await db.insert(taCandidateStage).values({
    id: crypto.randomUUID(),
    candidateId,
    stage,
    status: "in_progress",
    assigneeId,
  });
}

async function recordStageResult({
  candidateId,
  requestId,
  stage,
  stageRowId,
  previousStatus,
  status,
  notes,
  assigneeId,
  actor,
  candidateName,
}: {
  candidateId: string;
  requestId: string;
  stage: TaStage;
  stageRowId: string | null;
  previousStatus: TaStageStatus | "pending";
  status: TaStageStatus;
  notes: string | null;
  assigneeId?: string | null;
  actor: { id: string; email: string };
  candidateName: string;
}) {
  const label = TA_STAGE_LABELS[stage];

  if (stageRowId) {
    await db
      .update(taCandidateStage)
      .set({
        status,
        notes,
        completedAt: new Date(),
        ...(assigneeId !== undefined ? { assigneeId } : {}),
      })
      .where(eq(taCandidateStage.id, stageRowId));
  } else {
    await db.insert(taCandidateStage).values({
      id: crypto.randomUUID(),
      candidateId,
      stage,
      status,
      notes,
      assigneeId: assigneeId ?? null,
      completedAt: new Date(),
    });
  }

  await recordAudit({
    module: "ta_candidates",
    action: "stage_updated",
    entityId: candidateId,
    entityLabel: candidateName,
    actorId: actor.id,
    actorEmail: actor.email,
    changes: diffFields({ [label]: previousStatus }, { [label]: status }, { [label]: label }),
  });

  revalidateCandidate(requestId);
}

export async function fetchTaCandidateStages(candidateId: string): Promise<TaCandidateStageRow[]> {
  return listTaCandidateStages(candidateId);
}

/** Gated on `talent_acquisition:edit` — assigning L2 is a pipeline-management action, not the assessment itself. */
export async function fetchL2AssigneeOptions(): Promise<UserOption[]> {
  await authorize("talent_acquisition:edit");
  return listUsersWithPermission("talent_acquisition:l2_assess");
}

// ---------------------------------------------------------------------------
// L1 Assessment — must be done by Talent Acquisition Staff (or Manager tier).
// No assignee: anyone holding the permission may complete it.
// ---------------------------------------------------------------------------

export async function completeL1Assessment(input: {
  candidateId: string;
  requestId: string;
  passed: boolean;
  notes?: string;
}): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("talent_acquisition:l1_assess");
    const notes = notesSchema.parse(input.notes)?.trim() || null;
    const candidate = await getCandidate(input.candidateId);
    if (!candidate) return { ok: false, error: "That candidate no longer exists." };

    const existing = await getStageRow(input.candidateId, "l1_assessment");
    if (existing?.status === "passed") return { ok: false, error: "L1 Assessment is already marked passed." };

    await recordStageResult({
      candidateId: input.candidateId,
      requestId: input.requestId,
      stage: "l1_assessment",
      stageRowId: existing?.id ?? null,
      previousStatus: existing?.status ?? "pending",
      status: input.passed ? "passed" : "failed",
      notes,
      actor,
      candidateName: formatEmployeeDisplayName(candidate),
    });

    return { ok: true, data: undefined, message: `L1 Assessment marked ${input.passed ? "passed" : "failed"}.` };
  });
}

// ---------------------------------------------------------------------------
// L2 Assessment — assignable to anyone holding the permission; only the
// assigned person (or an admin override) may complete it.
// ---------------------------------------------------------------------------

export async function assignL2Assessment(input: {
  candidateId: string;
  requestId: string;
  assigneeId: string;
}): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("talent_acquisition:edit");
    const candidate = await getCandidate(input.candidateId);
    if (!candidate) return { ok: false, error: "That candidate no longer exists." };

    const l1 = await getStageRow(input.candidateId, "l1_assessment");
    if (l1?.status !== "passed") return { ok: false, error: "Complete L1 Assessment first." };

    const existing = await getStageRow(input.candidateId, "l2_assessment");
    if (existing?.status === "passed" || existing?.status === "failed") {
      return { ok: false, error: "L2 Assessment is already complete." };
    }

    const eligible = await listUsersWithPermission("talent_acquisition:l2_assess");
    if (!eligible.some((person) => person.id === input.assigneeId)) {
      return { ok: false, error: "That person doesn't hold the L2 Assessment permission." };
    }

    if (existing) {
      await db.update(taCandidateStage).set({ assigneeId: input.assigneeId }).where(eq(taCandidateStage.id, existing.id));
    } else {
      await db.insert(taCandidateStage).values({
        id: crypto.randomUUID(),
        candidateId: input.candidateId,
        stage: "l2_assessment",
        status: "in_progress",
        assigneeId: input.assigneeId,
      });
    }

    await recordAudit({
      module: "ta_candidates",
      action: "stage_updated",
      entityId: input.candidateId,
      entityLabel: formatEmployeeDisplayName(candidate),
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(
        { l2Assignee: existing?.assigneeId ?? null },
        { l2Assignee: input.assigneeId },
        { l2Assignee: "L2 Assessment reviewer" },
      ),
    });

    revalidateCandidate(input.requestId);
    return { ok: true, data: undefined, message: "L2 Assessment reviewer assigned." };
  });
}

export async function completeL2Assessment(input: {
  candidateId: string;
  requestId: string;
  passed: boolean;
  clientInterviewRequired: boolean;
  notes?: string;
}): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("talent_acquisition:l2_assess");
    const notes = notesSchema.parse(input.notes)?.trim() || null;
    const candidate = await getCandidate(input.candidateId);
    if (!candidate) return { ok: false, error: "That candidate no longer exists." };

    const stageRow = await getStageRow(input.candidateId, "l2_assessment");
    if (!stageRow || !stageRow.assigneeId) return { ok: false, error: "This candidate has no L2 Assessment reviewer assigned yet." };
    if (stageRow.status === "passed" || stageRow.status === "failed") {
      return { ok: false, error: "L2 Assessment is already complete." };
    }
    if (stageRow.assigneeId !== actor.id && !hasUnrestrictedAccess(actor)) {
      return { ok: false, error: "Only the assigned reviewer can complete this candidate's L2 Assessment." };
    }

    await recordStageResult({
      candidateId: input.candidateId,
      requestId: input.requestId,
      stage: "l2_assessment",
      stageRowId: stageRow.id,
      previousStatus: stageRow.status,
      status: input.passed ? "passed" : "failed",
      notes,
      actor,
      candidateName: formatEmployeeDisplayName(candidate),
    });

    if (input.passed) {
      await db
        .update(taCandidate)
        .set({ clientInterviewRequired: input.clientInterviewRequired })
        .where(eq(taCandidate.id, input.candidateId));

      if (input.clientInterviewRequired) {
        await openStageIfMissing(input.candidateId, "client_interview", stageRow.assigneeId);
      } else {
        await openStageIfMissing(input.candidateId, "final_interview");
      }
    }

    return { ok: true, data: undefined, message: `L2 Assessment marked ${input.passed ? "passed" : "failed"}.` };
  });
}

// ---------------------------------------------------------------------------
// Client Interview — optional, only opened when flagged required. No
// dedicated permission: the gate is purely "you're the assignee inherited
// from L2" (or an admin override), same reviewer who ran L2.
// ---------------------------------------------------------------------------

export async function completeClientInterview(input: {
  candidateId: string;
  requestId: string;
  passed: boolean;
  notes?: string;
}): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("talent_acquisition:read");
    const notes = notesSchema.parse(input.notes)?.trim() || null;
    const candidate = await getCandidate(input.candidateId);
    if (!candidate) return { ok: false, error: "That candidate no longer exists." };

    const stageRow = await getStageRow(input.candidateId, "client_interview");
    if (!stageRow) return { ok: false, error: "Client Interview hasn't been opened for this candidate yet." };
    if (stageRow.status === "passed" || stageRow.status === "failed") {
      return { ok: false, error: "Client Interview is already complete." };
    }
    if (stageRow.assigneeId !== actor.id && !hasUnrestrictedAccess(actor)) {
      return { ok: false, error: "Only the assigned reviewer can complete this candidate's Client Interview." };
    }

    await recordStageResult({
      candidateId: input.candidateId,
      requestId: input.requestId,
      stage: "client_interview",
      stageRowId: stageRow.id,
      previousStatus: stageRow.status,
      status: input.passed ? "passed" : "failed",
      notes,
      actor,
      candidateName: formatEmployeeDisplayName(candidate),
    });

    if (input.passed) await openStageIfMissing(input.candidateId, "final_interview");

    return { ok: true, data: undefined, message: `Client Interview marked ${input.passed ? "passed" : "failed"}.` };
  });
}

// ---------------------------------------------------------------------------
// Final Interview and Job Offer — Unit Manager tier, folded into the same
// `finalize` permission (see the comment in `src/lib/rbac.ts`). Neither has
// an assignee requirement.
// ---------------------------------------------------------------------------

export async function completeFinalInterview(input: {
  candidateId: string;
  requestId: string;
  passed: boolean;
  notes?: string;
}): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("talent_acquisition:finalize");
    const notes = notesSchema.parse(input.notes)?.trim() || null;
    const candidate = await getCandidate(input.candidateId);
    if (!candidate) return { ok: false, error: "That candidate no longer exists." };

    const stageRow = await getStageRow(input.candidateId, "final_interview");
    if (!stageRow) return { ok: false, error: "Complete the prior stage before Final Interview." };
    if (stageRow.status === "passed" || stageRow.status === "failed") {
      return { ok: false, error: "Final Interview is already complete." };
    }

    await recordStageResult({
      candidateId: input.candidateId,
      requestId: input.requestId,
      stage: "final_interview",
      stageRowId: stageRow.id,
      previousStatus: stageRow.status,
      status: input.passed ? "passed" : "failed",
      notes,
      actor,
      candidateName: formatEmployeeDisplayName(candidate),
    });

    if (input.passed) await openStageIfMissing(input.candidateId, "job_offer");

    return { ok: true, data: undefined, message: `Final Interview marked ${input.passed ? "passed" : "failed"}.` };
  });
}

export async function completeJobOffer(input: {
  candidateId: string;
  requestId: string;
  passed: boolean;
  notes?: string;
  targetOnboardDate?: string;
}): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("talent_acquisition:finalize");
    const notes = notesSchema.parse(input.notes)?.trim() || null;
    const candidate = await getCandidate(input.candidateId);
    if (!candidate) return { ok: false, error: "That candidate no longer exists." };

    const stageRow = await getStageRow(input.candidateId, "job_offer");
    if (!stageRow) return { ok: false, error: "Complete Final Interview before Job Offer." };
    if (stageRow.status === "passed" || stageRow.status === "failed") {
      return { ok: false, error: "Job Offer is already complete." };
    }

    await recordStageResult({
      candidateId: input.candidateId,
      requestId: input.requestId,
      stage: "job_offer",
      stageRowId: stageRow.id,
      previousStatus: stageRow.status,
      status: input.passed ? "passed" : "failed",
      notes,
      actor,
      candidateName: formatEmployeeDisplayName(candidate),
    });

    if (input.passed && input.targetOnboardDate) {
      await db
        .update(taCandidate)
        .set({ targetOnboardDate: input.targetOnboardDate })
        .where(eq(taCandidate.id, input.candidateId));
    }

    return { ok: true, data: undefined, message: `Job Offer marked ${input.passed ? "passed" : "failed"}.` };
  });
}
