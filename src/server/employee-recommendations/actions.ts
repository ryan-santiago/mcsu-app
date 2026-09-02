"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { approvalRequest, approvalStep, employee, employeeEmployment, employeeRecommendation, team } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { diffFields, recordAudit } from "@/lib/audit";
import { deleteDocumentFile, isDocumentStorageAvailable, saveDocumentFile } from "@/lib/document-storage";
import { formatEmployeeDisplayName } from "@/lib/employee-format";
import { kpiResultStorageKey } from "@/lib/employee-recommendation-document-format";
import { hasUnrestrictedAccess } from "@/lib/rbac";
import { sanitizeDescriptionHtml } from "@/lib/sanitize-html";
import { AuthorizationError, authorize } from "@/lib/session";
import {
  applyRecommendationSchema,
  createRecommendationSchema,
  KPI_RESULT_MAX_SIZE_BYTES,
  recommendationDraftSchema,
} from "@/lib/validation/employee-recommendations";
import { closeOtherOpenEmployments } from "@/server/employees/actions";
import { loadEmployeeDetail } from "@/server/employees/queries";

import { resolveApprovalChain } from "./approval-chain";
import { notifyApproverAssigned, notifyErfHandlersOfApproval, notifySubmitterOfRejection } from "./notifications";
import {
  getEmployeeRecommendationSnapshot,
  getRecommendationById,
  listPendingApprovalsForActor,
  listRecommendationEligibleEmployees,
  listRecommendationQueue,
  listRecommendations,
} from "./queries";
import type {
  EmployeeRecommendationSnapshot,
  PendingApprovalItem,
  RecommendationDetail,
  RecommendationEmployeeOption,
  RecommendationListItem,
  RecommendationQueueItem,
} from "./types";

const noteSchema = z.string().trim().max(500, "Keep the note under 500 characters").optional().or(z.literal(""));

async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "That request was not valid." };
    }
    console.error("[employee-recommendations] action failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

function refreshViews(id?: string) {
  revalidatePath("/employee-recommendations");
  if (id) revalidatePath(`/employee-recommendations/${id}`);
}

// ---------------------------------------------------------------------------
// Fetch wrappers — queries.ts is server-only, client components call these.
// ---------------------------------------------------------------------------

export async function fetchRecommendationQueue(): Promise<RecommendationQueueItem[]> {
  return listRecommendationQueue();
}

export async function fetchRecommendationEmployeeOptions(): Promise<RecommendationEmployeeOption[]> {
  return listRecommendationEligibleEmployees();
}

export async function fetchEmployeeRecommendationSnapshot(
  employeeId: string,
): Promise<EmployeeRecommendationSnapshot | null> {
  return getEmployeeRecommendationSnapshot(employeeId);
}

export async function fetchRecommendationById(id: string): Promise<RecommendationDetail | null> {
  return getRecommendationById(id);
}

export async function fetchRecommendationsInProgress(): Promise<RecommendationListItem[]> {
  return listRecommendations();
}

export async function fetchPendingApprovals(): Promise<PendingApprovalItem[]> {
  return listPendingApprovalsForActor();
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Starts a draft — either from the monitoring queue (`triggerType` is
 * `ph_contract_expiring`/`probationary_expiring`, `sourceEmploymentId` set)
 * or manually for a Regular employee's annual KPI (`manual_regular`, no
 * `sourceEmploymentId`). General Information is snapshotted here from the
 * employee's *current* data — see docs/EMPLOYEE_RECOMMENDATION.md §4.3.
 */
export async function createRecommendation(
  input: z.infer<typeof createRecommendationSchema>,
): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const data = createRecommendationSchema.parse(input);
    const actor = await authorize("employee_recommendations:edit");

    const snapshot = await getEmployeeRecommendationSnapshot(data.employeeId);
    if (!snapshot) return { ok: false, error: "That employee is not in your scope." };

    if (data.triggerType !== "manual_regular" && !data.sourceEmploymentId) {
      return { ok: false, error: "Missing the employment record this recommendation is for." };
    }

    const id = crypto.randomUUID();

    await db.insert(employeeRecommendation).values({
      id,
      employeeId: data.employeeId,
      triggerType: data.triggerType,
      sourceEmploymentId: data.triggerType === "manual_regular" ? null : (data.sourceEmploymentId ?? null),
      status: "draft",
      submittedBy: actor.id,
      submittedByName: actor.displayName,
      employeeNumberSnapshot: snapshot.employeeCode,
      positionSnapshot: snapshot.levelPositionLabel ?? "—",
      managerNameSnapshot: actor.displayName,
      requestedActions: {},
    });

    await recordAudit({
      module: "employee_recommendations",
      action: "recommendation_created",
      entityId: id,
      entityLabel: snapshot.employeeName,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(null, { employee: snapshot.employeeName, triggerType: data.triggerType }, {
        employee: "Employee",
        triggerType: "Trigger",
      }),
    });

    refreshViews();
    return { ok: true, data: { id }, message: "Draft created." };
  });
}

/** Edits a draft's Action Requested sections and recommendation text — only while `status = 'draft'`. */
export async function updateRecommendationDraft(input: {
  id: string;
  accomplishmentsAndRecommendation: string;
  requestedActions: unknown;
}): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("employee_recommendations:edit");
    const data = recommendationDraftSchema.parse({
      accomplishmentsAndRecommendation: input.accomplishmentsAndRecommendation,
      requestedActions: input.requestedActions,
    });

    const existing = await getRecommendationById(input.id);
    if (!existing) return { ok: false, error: "That recommendation no longer exists." };
    if (existing.status !== "draft") return { ok: false, error: "Only a draft can be edited." };
    if (!existing.canEdit) return { ok: false, error: "You cannot edit this recommendation." };

    const accomplishments = data.accomplishmentsAndRecommendation
      ? sanitizeDescriptionHtml(data.accomplishmentsAndRecommendation)
      : null;

    await db
      .update(employeeRecommendation)
      .set({ accomplishmentsAndRecommendation: accomplishments, requestedActions: data.requestedActions })
      .where(eq(employeeRecommendation.id, input.id));

    await recordAudit({
      module: "employee_recommendations",
      action: "recommendation_updated",
      entityId: input.id,
      entityLabel: existing.employeeName,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(
        { requestedActions: existing.requestedActions },
        { requestedActions: data.requestedActions },
        { requestedActions: "Requested actions" },
      ),
    });

    refreshViews(input.id);
    return { ok: true, data: undefined, message: "Draft saved." };
  });
}

/**
 * Withdraws a draft or a still-pending submission — the underlying
 * employment record falls back into the monitoring queue either way. A
 * `submitted` recommendation can get permanently stuck with no possible
 * approver (e.g. submitted by an account whose rank the whole approval
 * chain fails to outrank — see `assertApproverOutranksRequester`); this is
 * the only way out short of a DB edit, so it isn't `draft`-only like the
 * button label ("Cancel this draft") used to imply. Cancelling a submitted
 * recommendation also closes out its `approvalRequest`/`approvalStep` rows
 * so they stop showing as "pending" anywhere (notifications, nav badge,
 * "Needs your approval").
 */
export async function cancelRecommendation(input: { id: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("employee_recommendations:edit");

    const existing = await getRecommendationById(input.id);
    if (!existing) return { ok: false, error: "That recommendation no longer exists." };
    if (existing.status !== "draft" && existing.status !== "submitted") {
      return { ok: false, error: "Only a draft or a pending submission can be cancelled." };
    }
    if (!existing.canCancel) return { ok: false, error: "You cannot cancel this recommendation." };

    if (existing.hasKpiResult) await deleteDocumentFile(kpiResultStorageKey(input.id));

    await db.update(employeeRecommendation).set({ status: "cancelled" }).where(eq(employeeRecommendation.id, input.id));

    if (existing.approval) {
      await db
        .update(approvalStep)
        .set({ status: "skipped" })
        .where(and(eq(approvalStep.approvalRequestId, existing.approval.approvalRequestId), eq(approvalStep.status, "pending")));
      await db
        .update(approvalRequest)
        .set({ status: "cancelled" })
        .where(eq(approvalRequest.id, existing.approval.approvalRequestId));
    }

    await recordAudit({
      module: "employee_recommendations",
      action: "recommendation_cancelled",
      entityId: input.id,
      entityLabel: existing.employeeName,
      actorId: actor.id,
      actorEmail: actor.email,
    });

    refreshViews(input.id);
    return { ok: true, data: undefined, message: existing.status === "draft" ? "Draft cancelled." : "Recommendation cancelled." };
  });
}

/**
 * Uploads the KPI Result PDF for a draft — local disk today, SharePoint
 * later (see docs/DOCUMENTS.md and docs/EMPLOYEE_RECOMMENDATION.md §7). A
 * fixed one-per-recommendation key, so re-uploading just overwrites it.
 */
export async function uploadKpiResult(formData: FormData): Promise<ActionResult> {
  return run(async () => {
    if (!isDocumentStorageAvailable()) {
      return { ok: false, error: "Document storage isn't available in this environment yet." };
    }

    const id = String(formData.get("recommendationId") ?? "");
    const file = formData.get("file");

    if (!(file instanceof File)) return { ok: false, error: "No file provided." };
    if (file.size === 0) return { ok: false, error: "That file is empty." };
    if (file.size > KPI_RESULT_MAX_SIZE_BYTES) return { ok: false, error: "The file must be 10 MB or smaller." };
    if (file.type !== "application/pdf") return { ok: false, error: "Only PDF files are accepted." };

    const actor = await authorize("employee_recommendations:edit");
    const existing = await getRecommendationById(id);
    if (!existing) return { ok: false, error: "That recommendation no longer exists." };
    if (existing.status !== "draft") return { ok: false, error: "The KPI Result can only be attached while this is a draft." };
    if (!existing.canEdit) return { ok: false, error: "You cannot edit this recommendation." };

    const storageKey = kpiResultStorageKey(id);
    const bytes = new Uint8Array(await file.arrayBuffer());
    await saveDocumentFile(storageKey, bytes);

    await db.update(employeeRecommendation).set({ kpiResultStorageKey: storageKey }).where(eq(employeeRecommendation.id, id));

    await recordAudit({
      module: "employee_recommendations",
      action: "recommendation_updated",
      entityId: id,
      entityLabel: existing.employeeName,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields({ kpiResult: existing.hasKpiResult }, { kpiResult: true }, { kpiResult: "KPI Result attached" }),
    });

    refreshViews(id);
    return { ok: true, data: undefined, message: "KPI Result uploaded." };
  });
}

export async function removeKpiResult(input: { id: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("employee_recommendations:edit");

    const existing = await getRecommendationById(input.id);
    if (!existing) return { ok: false, error: "That recommendation no longer exists." };
    if (existing.status !== "draft") return { ok: false, error: "Only a draft's KPI Result can be removed." };
    if (!existing.canEdit) return { ok: false, error: "You cannot edit this recommendation." };
    if (!existing.hasKpiResult) return { ok: true, data: undefined, message: "Nothing to remove." };

    await deleteDocumentFile(kpiResultStorageKey(input.id));
    await db.update(employeeRecommendation).set({ kpiResultStorageKey: null }).where(eq(employeeRecommendation.id, input.id));

    await recordAudit({
      module: "employee_recommendations",
      action: "recommendation_updated",
      entityId: input.id,
      entityLabel: existing.employeeName,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields({ kpiResult: true }, { kpiResult: false }, { kpiResult: "KPI Result attached" }),
    });

    refreshViews(input.id);
    return { ok: true, data: undefined, message: "KPI Result removed." };
  });
}

// ---------------------------------------------------------------------------
// Approval engine — submit, approve, reject. See
// docs/EMPLOYEE_RECOMMENDATION.md §5 for the workflow this implements.
// ---------------------------------------------------------------------------

/**
 * A reviewer must outrank the original submitter — mirrors
 * `checkReviewerOutranksRequester()` (change-requests) and
 * `assertOutranksRequester()` (Talent Acquisition), the two existing
 * precedents for this exact rule. Compares against `requesterRank`,
 * snapshotted on `approvalRequest` at submission time, so a later role
 * change doesn't retroactively alter what a step's rank-check compared
 * against.
 */
function assertApproverOutranksRequester(actor: { id: string; rank: number }, requestedBy: string | null, requesterRank: number): void {
  if (requestedBy && actor.id === requestedBy) {
    throw new AuthorizationError("You cannot act on your own submission.");
  }
  if (requesterRank > actor.rank) {
    throw new AuthorizationError("You do not have sufficient rank to approve this recommendation.");
  }
}

/**
 * Resolves the approval chain (`resolveApprovalChain()`) against this
 * employee's team — `team.unitManagerUserId`/`departmentHeadUserId`,
 * admin-assigned under Maintenance → Teams. Blocks submission with a clear
 * error rather than creating a step nobody can ever act on.
 */
async function resolveApprovalSteps(
  employeeId: string,
): Promise<{ ok: true; steps: { roleId: "unit_manager" | "department_head"; approverUserId: string }[] } | { ok: false; error: string }> {
  const [employeeRow] = await db.select({ teamId: employee.teamId }).from(employee).where(eq(employee.id, employeeId)).limit(1);
  if (!employeeRow?.teamId) {
    return { ok: false, error: "This employee has no team assigned — set one in the Employees module first." };
  }

  const [teamRow] = await db
    .select({ unitManagerUserId: team.unitManagerUserId, departmentHeadUserId: team.departmentHeadUserId })
    .from(team)
    .where(eq(team.id, employeeRow.teamId))
    .limit(1);
  if (!teamRow) return { ok: false, error: "This employee's team no longer exists." };

  const steps: { roleId: "unit_manager" | "department_head"; approverUserId: string }[] = [];
  for (const step of resolveApprovalChain()) {
    const approverUserId = step.roleId === "unit_manager" ? teamRow.unitManagerUserId : teamRow.departmentHeadUserId;
    if (!approverUserId) {
      return {
        ok: false,
        error: `This team has no ${step.roleLabel} assigned — an administrator can set one under Maintenance → Teams.`,
      };
    }
    steps.push({ roleId: step.roleId, approverUserId });
  }
  return { ok: true, steps };
}

/** Submits a draft — resolves the approval chain, creates the `approvalRequest`/`approvalStep` rows, and moves status to `submitted`. */
export async function submitRecommendation(input: { id: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("employee_recommendations:edit");

    const existing = await getRecommendationById(input.id);
    if (!existing) return { ok: false, error: "That recommendation no longer exists." };
    if (existing.status !== "draft") return { ok: false, error: "Only a draft can be submitted." };
    if (!existing.canSubmit) return { ok: false, error: "You cannot submit this recommendation." };

    const resolved = await resolveApprovalSteps(existing.employeeId);
    if (!resolved.ok) return { ok: false, error: resolved.error };

    const approvalRequestId = crypto.randomUUID();
    await db.insert(approvalRequest).values({
      id: approvalRequestId,
      entityType: "employee_recommendation",
      entityId: input.id,
      requestedBy: actor.id,
      requestedByLabel: actor.displayName,
      requesterRank: actor.rank,
      status: "pending",
      currentStepOrder: 1,
    });

    await db.insert(approvalStep).values(
      resolved.steps.map((step, index) => ({
        id: crypto.randomUUID(),
        approvalRequestId,
        stepOrder: index + 1,
        requiredRoleId: step.roleId,
        approverUserId: step.approverUserId,
        status: "pending" as const,
      })),
    );

    await db
      .update(employeeRecommendation)
      .set({ approvalRequestId, status: "submitted" })
      .where(eq(employeeRecommendation.id, input.id));

    await recordAudit({
      module: "employee_recommendations",
      action: "recommendation_submitted",
      entityId: input.id,
      entityLabel: existing.employeeName,
      actorId: actor.id,
      actorEmail: actor.email,
    });

    const firstStep = resolved.steps[0];
    if (firstStep) {
      await notifyApproverAssigned({
        approverUserId: firstStep.approverUserId,
        recommendationId: input.id,
        employeeName: existing.employeeName,
        roleLabel: resolveApprovalChain()[0]?.roleLabel ?? "approver",
      });
    }

    refreshViews(input.id);
    return { ok: true, data: undefined, message: "Submitted for approval." };
  });
}

type ApprovalContext = {
  request: { id: string; status: "pending" | "approved" | "rejected" | "cancelled"; currentStepOrder: number; requestedBy: string | null; requesterRank: number };
  recommendationId: string;
  employeeName: string;
  steps: (typeof approvalStep.$inferSelect)[];
};

async function loadApprovalContext(approvalRequestId: string): Promise<ApprovalContext | null> {
  const [request] = await db
    .select({
      id: approvalRequest.id,
      status: approvalRequest.status,
      currentStepOrder: approvalRequest.currentStepOrder,
      requestedBy: approvalRequest.requestedBy,
      requesterRank: approvalRequest.requesterRank,
    })
    .from(approvalRequest)
    .where(eq(approvalRequest.id, approvalRequestId))
    .limit(1);
  if (!request) return null;

  const [recommendation] = await db
    .select({ id: employeeRecommendation.id, firstName: employee.firstName, lastName: employee.lastName })
    .from(employeeRecommendation)
    .innerJoin(employee, eq(employee.id, employeeRecommendation.employeeId))
    .where(eq(employeeRecommendation.approvalRequestId, approvalRequestId))
    .limit(1);
  if (!recommendation) return null;

  const steps = await db
    .select()
    .from(approvalStep)
    .where(eq(approvalStep.approvalRequestId, approvalRequestId))
    .orderBy(asc(approvalStep.stepOrder));

  return {
    request,
    recommendationId: recommendation.id,
    employeeName: formatEmployeeDisplayName(recommendation),
    steps,
  };
}

function assertCurrentStepActionable(context: ApprovalContext, actor: { id: string; rank: number; roleId: string }) {
  if (context.request.status !== "pending") throw new AuthorizationError("This request has already been resolved.");

  const currentStep = context.steps.find((step) => step.stepOrder === context.request.currentStepOrder);
  if (!currentStep || currentStep.status !== "pending") {
    throw new AuthorizationError("There is nothing pending your action on this request.");
  }
  if (!hasUnrestrictedAccess(actor) && currentStep.approverUserId !== actor.id) {
    throw new AuthorizationError("This step isn't assigned to you.");
  }
  assertApproverOutranksRequester(actor, context.request.requestedBy, context.request.requesterRank);

  return currentStep;
}

export async function approveRecommendationStep(input: { approvalRequestId: string; note?: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("employee_recommendations:approve");
    const note = noteSchema.parse(input.note ?? "");

    const context = await loadApprovalContext(input.approvalRequestId);
    if (!context) return { ok: false, error: "That approval request no longer exists." };

    const currentStep = assertCurrentStepActionable(context, actor);
    const isLastStep = context.steps.every((step) => step.stepOrder <= currentStep.stepOrder);

    await db
      .update(approvalStep)
      .set({ status: "approved", decidedBy: actor.id, decidedAt: new Date(), note: note || null })
      .where(eq(approvalStep.id, currentStep.id));

    if (isLastStep) {
      await db.update(approvalRequest).set({ status: "approved" }).where(eq(approvalRequest.id, input.approvalRequestId));
      await db.update(employeeRecommendation).set({ status: "approved" }).where(eq(employeeRecommendation.id, context.recommendationId));
    } else {
      await db
        .update(approvalRequest)
        .set({ currentStepOrder: currentStep.stepOrder + 1 })
        .where(eq(approvalRequest.id, input.approvalRequestId));
    }

    await recordAudit({
      module: "employee_recommendations",
      action: "recommendation_step_approved",
      entityId: context.recommendationId,
      entityLabel: context.employeeName,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: note ? diffFields(null, { note }, { note: "Note" }) : undefined,
    });

    if (isLastStep) {
      await notifyErfHandlersOfApproval({ recommendationId: context.recommendationId, employeeName: context.employeeName });
    } else {
      const nextStep = context.steps.find((step) => step.stepOrder === currentStep.stepOrder + 1);
      if (nextStep?.approverUserId) {
        await notifyApproverAssigned({
          approverUserId: nextStep.approverUserId,
          recommendationId: context.recommendationId,
          employeeName: context.employeeName,
          roleLabel: resolveApprovalChain().find((step) => step.roleId === nextStep.requiredRoleId)?.roleLabel ?? "approver",
        });
      }
    }

    refreshViews(context.recommendationId);
    return {
      ok: true,
      data: undefined,
      message: isLastStep ? "Recommendation fully approved." : "Approved — moved to the next approver.",
    };
  });
}

export async function rejectRecommendationStep(input: { approvalRequestId: string; note?: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("employee_recommendations:approve");
    const note = noteSchema.parse(input.note ?? "");

    const context = await loadApprovalContext(input.approvalRequestId);
    if (!context) return { ok: false, error: "That approval request no longer exists." };

    const currentStep = assertCurrentStepActionable(context, actor);

    await db
      .update(approvalStep)
      .set({ status: "rejected", decidedBy: actor.id, decidedAt: new Date(), note: note || null })
      .where(eq(approvalStep.id, currentStep.id));

    await db.update(approvalRequest).set({ status: "rejected" }).where(eq(approvalRequest.id, input.approvalRequestId));
    await db.update(employeeRecommendation).set({ status: "rejected" }).where(eq(employeeRecommendation.id, context.recommendationId));

    await recordAudit({
      module: "employee_recommendations",
      action: "recommendation_step_rejected",
      entityId: context.recommendationId,
      entityLabel: context.employeeName,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: note ? diffFields(null, { note }, { note: "Note" }) : undefined,
    });

    await notifySubmitterOfRejection({
      recommendationId: context.recommendationId,
      employeeName: context.employeeName,
      note: note || null,
    });

    refreshViews(context.recommendationId);
    return { ok: true, data: undefined, message: "Recommendation rejected." };
  });
}

// ---------------------------------------------------------------------------
// ERF generation — see docs/EMPLOYEE_RECOMMENDATION.md §3/§7.
// ---------------------------------------------------------------------------

/**
 * Records that the ERF was (re-)generated — the PDF itself was already
 * rendered and downloaded client-side
 * (`generateEmployeeRecommendationErfPdf`) before this is called; nothing is
 * kept server-side, so this is the only record of it (see
 * docs/EMPLOYEE_RECOMMENDATION.md §7). TAM-only
 * (`employee_recommendations:generate_erf`). Repeatable — regenerating
 * later just re-renders from current data and logs another audit entry;
 * only the *first* call (while still `approved`) advances the status, since
 * that's what unlocks Apply to Employment History.
 */
export async function markErfGenerated(id: string): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("employee_recommendations:generate_erf");
    const existing = await getRecommendationById(id);
    if (!existing) return { ok: false, error: "That recommendation no longer exists." };
    if (existing.status !== "approved" && existing.status !== "erf_generated" && existing.status !== "applied") {
      return { ok: false, error: "The ERF can only be generated once the recommendation is fully approved." };
    }

    await db
      .update(employeeRecommendation)
      .set({
        erfGeneratedAt: new Date(),
        erfGeneratedBy: actor.id,
        ...(existing.status === "approved" ? { status: "erf_generated" as const } : {}),
      })
      .where(eq(employeeRecommendation.id, id));

    await recordAudit({
      module: "employee_recommendations",
      action: "erf_generated",
      entityId: id,
      entityLabel: existing.employeeName,
      actorId: actor.id,
      actorEmail: actor.email,
    });

    refreshViews(id);
    return { ok: true, data: undefined, message: "ERF generated." };
  });
}

// ---------------------------------------------------------------------------
// Apply to employment history — closes the loop, see docs/EMPLOYEE_RECOMMENDATION.md §12 step 6.
// ---------------------------------------------------------------------------

/**
 * Creates the new `employeeEmployment` row a fully-processed recommendation
 * describes, and closes out the employee's currently-open one —
 * `closeOtherOpenEmployments()` (`src/server/employees/actions.ts`), the
 * same primitive the Employees module itself uses, so this can never leave
 * two rows both reading as "current."
 *
 * Only the fields a checked "Action Requested" section actually specifies
 * are overridden; everything else carries forward from the employee's
 * *live* current employment record (`loadEmployeeDetail`), not a snapshot —
 * Apply is a deliberately later, separate step (after HRD has processed the
 * ERF externally per §4.3), so using live data as the base is correct: an
 * unrelated change made in between should still be reflected.
 *
 * `effectiveDate` is supplied here, not read from the recommendation — see
 * `applyRecommendationSchema`'s note on why the per-section `effectiveDate`
 * field was removed.
 */
export async function applyRecommendation(input: { id: string; effectiveDate: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("employee_recommendations:generate_erf");
    const data = applyRecommendationSchema.parse(input);

    const existing = await getRecommendationById(data.id);
    if (!existing) return { ok: false, error: "That recommendation no longer exists." };
    if (existing.status !== "erf_generated") {
      return { ok: false, error: "Generate the ERF before applying this recommendation." };
    }
    if (!existing.canApply) return { ok: false, error: "You cannot apply this recommendation." };

    const detail = await loadEmployeeDetail(existing.employeeId);
    if (!detail) return { ok: false, error: "That employee no longer exists." };
    const current = detail.employments[0] ?? null;
    if (!current) {
      return { ok: false, error: "This employee has no employment record to base the new one on." };
    }

    const { requestedActions } = existing;
    const nextValues = {
      levelId: requestedActions.jobTitleChange?.toLevelId ?? current.levelId,
      positionId: requestedActions.jobTitleChange?.toPositionId ?? current.positionId,
      employmentTypeId: requestedActions.categoryChange?.toEmploymentTypeId ?? current.employmentTypeId,
      salary: requestedActions.salaryChange?.toSalary ?? current.salary,
      communicationAllowance: requestedActions.salaryChange?.toCommunicationAllowance ?? current.communicationAllowance,
      transportationAllowance: requestedActions.salaryChange?.toTransportationAllowance ?? current.transportationAllowance,
    };

    const newEmploymentId = crypto.randomUUID();
    await db.insert(employeeEmployment).values({
      id: newEmploymentId,
      employeeId: existing.employeeId,
      ...nextValues,
      startDate: data.effectiveDate,
      endDate: null,
    });
    await closeOtherOpenEmployments(existing.employeeId, newEmploymentId, data.effectiveDate);

    const nextTeamId = requestedActions.supervisorChange?.toTeamId;
    if (nextTeamId && nextTeamId !== detail.teamId) {
      await db.update(employee).set({ teamId: nextTeamId }).where(eq(employee.id, existing.employeeId));
    }

    await db
      .update(employeeRecommendation)
      .set({
        status: "applied",
        appliedToEmploymentHistoryAt: new Date(),
        appliedBy: actor.id,
        resultingEmploymentId: newEmploymentId,
      })
      .where(eq(employeeRecommendation.id, data.id));

    await recordAudit({
      module: "employee_recommendations",
      action: "recommendation_applied",
      entityId: data.id,
      entityLabel: existing.employeeName,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(
        {
          levelId: current.levelId,
          positionId: current.positionId,
          employmentTypeId: current.employmentTypeId,
          salary: current.salary,
          communicationAllowance: current.communicationAllowance,
          transportationAllowance: current.transportationAllowance,
          team: detail.teamId,
        },
        { ...nextValues, team: nextTeamId ?? detail.teamId },
        {
          levelId: "Level",
          positionId: "Position",
          employmentTypeId: "Employment type",
          salary: "Salary",
          communicationAllowance: "Communication allowance",
          transportationAllowance: "Transportation allowance",
          team: "Team",
        },
      ),
    });

    revalidatePath("/employees");
    revalidatePath(`/employees/${existing.employeeId}`);
    refreshViews(data.id);
    return { ok: true, data: undefined, message: "Applied to employment history." };
  });
}
