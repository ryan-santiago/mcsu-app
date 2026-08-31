"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { taApplication, taApplicationStage, taCandidate, type TaStage, type TaStageStatus } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { diffFields, recordAudit } from "@/lib/audit";
import { formatEmployeeDisplayName } from "@/lib/employee-format";
import { hasUnrestrictedAccess } from "@/lib/rbac";
import { AuthorizationError, authorize } from "@/lib/session";

import { notifyFinalInterviewersNeeded, notifyL2ReviewersNeeded, notifyL3AssessorsNeeded } from "./notifications";
import { listTaApplicationStages, listUsersWithPermission } from "./stage-queries";
import { TA_STAGE_LABELS, type TaApplicationStageRow, type UserOption } from "./stage-types";

const moneySchema = z
  .string()
  .trim()
  .min(1, "Required")
  .refine((value) => Number.isFinite(Number(value)) && Number(value) >= 0, "Enter a valid amount");

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

function revalidateApplication(requestId: string) {
  revalidatePath(`/talent-acquisition/${requestId}`);
}

type ApplicationWithCandidateName = {
  id: string;
  candidateId: string;
  candidateName: string;
};

async function getApplication(applicationId: string): Promise<ApplicationWithCandidateName | null> {
  const [row] = await db
    .select({
      id: taApplication.id,
      candidateId: taApplication.candidateId,
      firstName: taCandidate.firstName,
      middleName: taCandidate.middleName,
      lastName: taCandidate.lastName,
    })
    .from(taApplication)
    .innerJoin(taCandidate, eq(taApplication.candidateId, taCandidate.id))
    .where(eq(taApplication.id, applicationId))
    .limit(1);
  if (!row) return null;

  return { id: row.id, candidateId: row.candidateId, candidateName: formatEmployeeDisplayName(row) };
}

async function getStageRow(applicationId: string, stage: TaStage) {
  const [row] = await db
    .select()
    .from(taApplicationStage)
    .where(and(eq(taApplicationStage.applicationId, applicationId), eq(taApplicationStage.stage, stage)))
    .limit(1);
  return row ?? null;
}

/**
 * Opens `stage`'s row if it doesn't exist yet, and always marks it as the
 * application's current board column — the single chokepoint that keeps the
 * board in sync whether a stage was reached by completing the previous one,
 * assigning a reviewer, or an explicit board move. Not itself a user action
 * worth its own audit entry when called from a "complete" flow (that call
 * already records one); `moveApplicationStage` below records its own.
 */
async function advanceToStage(applicationId: string, stage: TaStage, assigneeId: string | null = null) {
  const existing = await getStageRow(applicationId, stage);
  if (!existing) {
    await db.insert(taApplicationStage).values({
      id: crypto.randomUUID(),
      applicationId,
      stage,
      status: "in_progress",
      assigneeId,
    });
  }
  await db.update(taApplication).set({ currentStage: stage }).where(eq(taApplication.id, applicationId));
}

async function recordStageResult({
  applicationId,
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
  applicationId: string;
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
      .update(taApplicationStage)
      .set({
        status,
        notes,
        completedAt: new Date(),
        ...(assigneeId !== undefined ? { assigneeId } : {}),
      })
      .where(eq(taApplicationStage.id, stageRowId));
  } else {
    await db.insert(taApplicationStage).values({
      id: crypto.randomUUID(),
      applicationId,
      stage,
      status,
      notes,
      assigneeId: assigneeId ?? null,
      completedAt: new Date(),
    });
  }

  await recordAudit({
    module: "ta_applications",
    action: "stage_updated",
    entityId: applicationId,
    entityLabel: candidateName,
    actorId: actor.id,
    actorEmail: actor.email,
    changes: diffFields({ [label]: previousStatus }, { [label]: status }, { [label]: label }),
  });

  revalidateApplication(requestId);
}

export async function fetchTaApplicationStages(applicationId: string): Promise<TaApplicationStageRow[]> {
  return listTaApplicationStages(applicationId);
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
  applicationId: string;
  requestId: string;
  passed: boolean;
  notes?: string;
}): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("talent_acquisition:l1_assess");
    const notes = notesSchema.parse(input.notes)?.trim() || null;
    const application = await getApplication(input.applicationId);
    if (!application) return { ok: false, error: "That candidate no longer exists." };

    const existing = await getStageRow(input.applicationId, "l1_assessment");
    if (existing?.status === "passed") return { ok: false, error: "L1 Assessment is already marked passed." };

    await recordStageResult({
      applicationId: input.applicationId,
      requestId: input.requestId,
      stage: "l1_assessment",
      stageRowId: existing?.id ?? null,
      previousStatus: existing?.status ?? "pending",
      status: input.passed ? "passed" : "failed",
      notes,
      actor,
      candidateName: application.candidateName,
    });

    if (input.passed) {
      await advanceToStage(input.applicationId, "l2_assessment");
      await notifyL2ReviewersNeeded({ requestId: input.requestId, candidateName: application.candidateName });
    }

    return { ok: true, data: undefined, message: `L1 Assessment marked ${input.passed ? "passed" : "failed"}.` };
  });
}

// ---------------------------------------------------------------------------
// L2 Assessment — assignable to anyone holding the permission; only the
// assigned person (or an admin override) may complete it.
// ---------------------------------------------------------------------------

export async function assignL2Assessment(input: {
  applicationId: string;
  requestId: string;
  assigneeId: string;
}): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("talent_acquisition:edit");
    const application = await getApplication(input.applicationId);
    if (!application) return { ok: false, error: "That candidate no longer exists." };

    const existing = await getStageRow(input.applicationId, "l2_assessment");
    if (existing?.status === "passed" || existing?.status === "failed") {
      return { ok: false, error: "L2 Assessment is already complete." };
    }

    const eligible = await listUsersWithPermission("talent_acquisition:l2_assess");
    if (!eligible.some((person) => person.id === input.assigneeId)) {
      return { ok: false, error: "That person doesn't hold the L2 Assessment permission." };
    }

    if (existing) {
      await db.update(taApplicationStage).set({ assigneeId: input.assigneeId }).where(eq(taApplicationStage.id, existing.id));
    } else {
      await db.insert(taApplicationStage).values({
        id: crypto.randomUUID(),
        applicationId: input.applicationId,
        stage: "l2_assessment",
        status: "in_progress",
        assigneeId: input.assigneeId,
      });
    }
    await db.update(taApplication).set({ currentStage: "l2_assessment" }).where(eq(taApplication.id, input.applicationId));

    await recordAudit({
      module: "ta_applications",
      action: "stage_updated",
      entityId: input.applicationId,
      entityLabel: application.candidateName,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(
        { l2Assignee: existing?.assigneeId ?? null },
        { l2Assignee: input.assigneeId },
        { l2Assignee: "L2 Assessment reviewer" },
      ),
    });

    revalidateApplication(input.requestId);
    return { ok: true, data: undefined, message: "L2 Assessment reviewer assigned." };
  });
}

export async function completeL2Assessment(input: {
  applicationId: string;
  requestId: string;
  passed: boolean;
  clientInterviewRequired: boolean;
  notes?: string;
}): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("talent_acquisition:l2_assess");
    const notes = notesSchema.parse(input.notes)?.trim() || null;
    const application = await getApplication(input.applicationId);
    if (!application) return { ok: false, error: "That candidate no longer exists." };

    const stageRow = await getStageRow(input.applicationId, "l2_assessment");
    if (!stageRow || !stageRow.assigneeId) return { ok: false, error: "This candidate has no L2 Assessment reviewer assigned yet." };
    if (stageRow.status === "passed" || stageRow.status === "failed") {
      return { ok: false, error: "L2 Assessment is already complete." };
    }
    if (stageRow.assigneeId !== actor.id && !hasUnrestrictedAccess(actor)) {
      return { ok: false, error: "Only the assigned reviewer can complete this candidate's L2 Assessment." };
    }

    await recordStageResult({
      applicationId: input.applicationId,
      requestId: input.requestId,
      stage: "l2_assessment",
      stageRowId: stageRow.id,
      previousStatus: stageRow.status,
      status: input.passed ? "passed" : "failed",
      notes,
      actor,
      candidateName: application.candidateName,
    });

    if (input.passed) {
      await db
        .update(taApplication)
        .set({ clientInterviewRequired: input.clientInterviewRequired })
        .where(eq(taApplication.id, input.applicationId));

      if (input.clientInterviewRequired) {
        await advanceToStage(input.applicationId, "client_interview", stageRow.assigneeId);
      } else {
        await advanceToStage(input.applicationId, "l3_assessment");
        await notifyL3AssessorsNeeded({ requestId: input.requestId, candidateName: application.candidateName });
      }
    }

    return { ok: true, data: undefined, message: `L2 Assessment marked ${input.passed ? "passed" : "failed"}.` };
  });
}

// ---------------------------------------------------------------------------
// Client Interview — optional, only opened when flagged required. Folded
// into the `l2_assess` permission tier (same reviewer tier the label already
// says — "L2 Assessment / Client Interview"), gated further by "you're the
// assignee inherited from L2" (or an admin override).
// ---------------------------------------------------------------------------

export async function completeClientInterview(input: {
  applicationId: string;
  requestId: string;
  passed: boolean;
  notes?: string;
  clientFeedback?: string;
}): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("talent_acquisition:l2_assess");
    const notes = notesSchema.parse(input.notes)?.trim() || null;
    const clientFeedback = notesSchema.parse(input.clientFeedback)?.trim() || null;
    const application = await getApplication(input.applicationId);
    if (!application) return { ok: false, error: "That candidate no longer exists." };

    const stageRow = await getStageRow(input.applicationId, "client_interview");
    if (!stageRow) return { ok: false, error: "Client Interview hasn't been opened for this candidate yet." };
    if (stageRow.status === "passed" || stageRow.status === "failed") {
      return { ok: false, error: "Client Interview is already complete." };
    }
    if (stageRow.assigneeId !== actor.id && !hasUnrestrictedAccess(actor)) {
      return { ok: false, error: "Only the assigned reviewer can complete this candidate's Client Interview." };
    }

    await db.update(taApplicationStage).set({ clientFeedback }).where(eq(taApplicationStage.id, stageRow.id));

    await recordStageResult({
      applicationId: input.applicationId,
      requestId: input.requestId,
      stage: "client_interview",
      stageRowId: stageRow.id,
      previousStatus: stageRow.status,
      status: input.passed ? "passed" : "failed",
      notes,
      actor,
      candidateName: application.candidateName,
    });

    if (input.passed) {
      await advanceToStage(input.applicationId, "l3_assessment");
      await notifyL3AssessorsNeeded({ requestId: input.requestId, candidateName: application.candidateName });
    }

    return { ok: true, data: undefined, message: `Client Interview marked ${input.passed ? "passed" : "failed"}.` };
  });
}

// ---------------------------------------------------------------------------
// L3 Interview & Assessment — Talent Acquisition Staff/Manager tier (incl.
// background check), same "no assignee" model as L1: anyone holding the
// permission may complete it.
// ---------------------------------------------------------------------------

export async function completeL3Assessment(input: {
  applicationId: string;
  requestId: string;
  passed: boolean;
  notes?: string;
}): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("talent_acquisition:l3_assess");
    const notes = notesSchema.parse(input.notes)?.trim() || null;
    const application = await getApplication(input.applicationId);
    if (!application) return { ok: false, error: "That candidate no longer exists." };

    const stageRow = await getStageRow(input.applicationId, "l3_assessment");
    if (!stageRow) return { ok: false, error: "Complete the prior stage before L3." };
    if (stageRow.status === "passed" || stageRow.status === "failed") {
      return { ok: false, error: "L3 Interview & Assessment is already complete." };
    }

    await recordStageResult({
      applicationId: input.applicationId,
      requestId: input.requestId,
      stage: "l3_assessment",
      stageRowId: stageRow.id,
      previousStatus: stageRow.status,
      status: input.passed ? "passed" : "failed",
      notes,
      actor,
      candidateName: application.candidateName,
    });

    if (input.passed) {
      await advanceToStage(input.applicationId, "final_interview");
      await notifyFinalInterviewersNeeded({ requestId: input.requestId, candidateName: application.candidateName });
    }

    return { ok: true, data: undefined, message: `L3 Interview & Assessment marked ${input.passed ? "passed" : "failed"}.` };
  });
}

// ---------------------------------------------------------------------------
// Final Interview — Unit Manager tier (`finalize`), the pipeline's last
// stage. No assignee requirement. Passing requires the proposed comp
// package (Salary/Communication Allowance/Transportation Allowance).
// ---------------------------------------------------------------------------

const finalInterviewInputSchema = z
  .object({
    applicationId: z.string().min(1),
    requestId: z.string().min(1),
    passed: z.boolean(),
    notes: z.string().max(2000, "That's too long").optional(),
    proposedSalary: z.string().optional(),
    proposedCommunicationAllowance: z.string().optional(),
    proposedTransportationAllowance: z.string().optional(),
  })
  .refine((data) => !data.passed || moneySchema.safeParse(data.proposedSalary).success, {
    message: "Enter the proposed salary",
    path: ["proposedSalary"],
  })
  .refine((data) => !data.passed || moneySchema.safeParse(data.proposedCommunicationAllowance).success, {
    message: "Enter the proposed communication allowance (0 if none)",
    path: ["proposedCommunicationAllowance"],
  })
  .refine((data) => !data.passed || moneySchema.safeParse(data.proposedTransportationAllowance).success, {
    message: "Enter the proposed transportation allowance (0 if none)",
    path: ["proposedTransportationAllowance"],
  });

export async function completeFinalInterview(input: {
  applicationId: string;
  requestId: string;
  passed: boolean;
  notes?: string;
  proposedSalary?: string;
  proposedCommunicationAllowance?: string;
  proposedTransportationAllowance?: string;
}): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("talent_acquisition:finalize");
    const values = finalInterviewInputSchema.parse(input);
    const notes = notesSchema.parse(values.notes)?.trim() || null;
    const application = await getApplication(values.applicationId);
    if (!application) return { ok: false, error: "That candidate no longer exists." };

    const stageRow = await getStageRow(values.applicationId, "final_interview");
    if (!stageRow) return { ok: false, error: "Complete the prior stage before Final Interview." };
    if (stageRow.status === "passed" || stageRow.status === "failed") {
      return { ok: false, error: "Final Interview is already complete." };
    }

    await db
      .update(taApplicationStage)
      .set({
        proposedSalary: values.passed ? (values.proposedSalary ?? null) : null,
        proposedCommunicationAllowance: values.passed ? (values.proposedCommunicationAllowance ?? null) : null,
        proposedTransportationAllowance: values.passed ? (values.proposedTransportationAllowance ?? null) : null,
      })
      .where(eq(taApplicationStage.id, stageRow.id));

    await recordStageResult({
      applicationId: values.applicationId,
      requestId: values.requestId,
      stage: "final_interview",
      stageRowId: stageRow.id,
      previousStatus: stageRow.status,
      status: values.passed ? "passed" : "failed",
      notes,
      actor,
      candidateName: application.candidateName,
    });

    return { ok: true, data: undefined, message: `Final Interview marked ${values.passed ? "passed" : "failed"}.` };
  });
}

// ---------------------------------------------------------------------------
// Board movement — the flexible, non-linear part of the pipeline. Moves an
// application to any stage (forward, backward, or straight to one that's
// never been visited), opening that stage's row if it doesn't exist yet.
// Gated on `talent_acquisition:edit`, same as assigning L2 — this is
// pipeline management, not an assessment result.
// ---------------------------------------------------------------------------

export async function moveApplicationStage(input: {
  applicationId: string;
  requestId: string;
  stage: TaStage;
}): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("talent_acquisition:edit");
    const application = await getApplication(input.applicationId);
    if (!application) return { ok: false, error: "That candidate no longer exists." };

    const [current] = await db.select({ currentStage: taApplication.currentStage }).from(taApplication).where(eq(taApplication.id, input.applicationId)).limit(1);
    if (current?.currentStage === input.stage) return { ok: false, error: "Already in that stage." };

    if (input.stage === "client_interview") {
      // Client Interview inherits the L2 reviewer as its assignee, same as when it's opened by L2 passing,
      // and moving a card here is itself the signal that this application needs one.
      const l2 = await getStageRow(input.applicationId, "l2_assessment");
      await db.update(taApplication).set({ clientInterviewRequired: true }).where(eq(taApplication.id, input.applicationId));
      await advanceToStage(input.applicationId, input.stage, l2?.assigneeId ?? null);
    } else {
      await advanceToStage(input.applicationId, input.stage);
    }

    await recordAudit({
      module: "ta_applications",
      action: "stage_moved",
      entityId: input.applicationId,
      entityLabel: application.candidateName,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(
        { stage: current?.currentStage ?? null },
        { stage: input.stage },
        { stage: "Board stage" },
      ),
    });

    revalidateApplication(input.requestId);
    return { ok: true, data: undefined, message: `Moved to ${TA_STAGE_LABELS[input.stage]}.` };
  });
}
