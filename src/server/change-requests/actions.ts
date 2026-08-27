"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { approvalRequest, approvalStep, employee, employeeChangeRequest } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { formatEmployeeName } from "@/lib/employee-format";
import { denyReasonForActingOn, hasUnrestrictedAccess } from "@/lib/rbac";
import { AuthorizationError, authorize, type CurrentUser } from "@/lib/session";
import type { AddressInput } from "@/lib/validation/ph";
import type { SelfServiceProfileInput } from "@/lib/validation/employee";
import { upsertEmployeeAddresses } from "@/server/employees/actions";

import { getChangeRequestById, listChangeRequests } from "./queries";
import type { ActionResult, ChangeRequestFilters, ChangeRequestListResult } from "./types";

const idSchema = z.string().min(1, "A request must be selected");
const noteSchema = z.string().trim().max(500, "Keep the note under 500 characters").optional().or(z.literal(""));

async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "That request was not valid." };
    }
    console.error("[change-requests] action failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

function refreshViews(employeeId: string) {
  revalidatePath("/admin/approvals");
  revalidatePath("/admin/settings");
  revalidatePath(`/employees/${employeeId}`);
}

/**
 * A request whose original requester's account has since been deleted has no
 * one to rank-check against — nothing left protects, so any `employees:edit`
 * holder may resolve it rather than leaving it permanently stuck.
 */
function checkReviewerOutranksRequester(
  actor: { id: string; rank: number },
  requesterId: string | null,
  requesterRank: number | null,
  requesterRoleLabel: string | null,
): void {
  if (requesterId === null || requesterRank === null || requesterRoleLabel === null) return;

  const denial = denyReasonForActingOn(actor, { id: requesterId, rank: requesterRank, roleLabel: requesterRoleLabel });
  if (denial) throw new AuthorizationError(denial);
}

/**
 * Mirrors `assertEmployeeInScope` in `src/server/employees/actions.ts`: a
 * non-admin reviewing a request about an employee outside their own team is
 * treated the same as one lacking the permission at all.
 */
function assertRequestInScope(actor: CurrentUser, employeeTeamId: string | null): void {
  if (hasUnrestrictedAccess(actor)) return;
  if (!actor.teamId || employeeTeamId !== actor.teamId) {
    throw new AuthorizationError("You can only review change requests for your own team.");
  }
}

/** Server-action entry point for the Approvals table's TanStack Query `queryFn`. */
export async function fetchChangeRequests(filters: ChangeRequestFilters): Promise<ChangeRequestListResult> {
  return listChangeRequests(filters);
}

/**
 * Mirrors the decision onto the shared `approvalRequest`/`approvalStep`
 * tables (see `docs/EMPLOYEE_RECOMMENDATION.md` §12 step 7) — purely
 * bookkeeping so a future unified inbox/notification/badge can enumerate
 * change requests the same way it enumerates recommendation steps.
 * `employeeChangeRequest.status` stays the actual source of truth this
 * module reads; this never gates anything. `approvalRequestId` is nullable
 * only for defensiveness — every request submitted after this migration
 * always has one (`submitProfileChangeRequest`).
 */
async function decideApprovalStep(
  approvalRequestId: string | null,
  status: "approved" | "rejected",
  actorId: string,
  note: string | null,
): Promise<void> {
  if (!approvalRequestId) return;

  await db
    .update(approvalStep)
    .set({ status, decidedBy: actorId, decidedAt: new Date(), note })
    .where(and(eq(approvalStep.approvalRequestId, approvalRequestId), eq(approvalStep.status, "pending")));
  await db.update(approvalRequest).set({ status }).where(eq(approvalRequest.id, approvalRequestId));
}

export async function approveChangeRequest(input: { id: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("employees:edit");
    const id = idSchema.parse(input.id);

    const request = await getChangeRequestById(id);
    if (!request) return { ok: false, error: "That request no longer exists." };
    if (request.status !== "pending") return { ok: false, error: "This request has already been reviewed." };

    assertRequestInScope(actor, request.employeeTeamId);
    checkReviewerOutranksRequester(actor, request.requesterId, request.requesterRank, request.requesterRoleLabel);

    const profile = request.proposedProfile as SelfServiceProfileInput;
    const currentAddress = request.proposedCurrentAddress as AddressInput;
    const permanentAddress = request.proposedPermanentAddress as AddressInput;

    const [existing] = await db.select().from(employee).where(eq(employee.id, request.employeeId)).limit(1);
    if (!existing) return { ok: false, error: "That employee no longer exists." };

    const [duplicateEmail] = await db
      .select({ id: employee.id })
      .from(employee)
      .where(and(eq(employee.workEmail, profile.workEmail), ne(employee.id, request.employeeId)))
      .limit(1);
    if (duplicateEmail) return { ok: false, error: `Work email "${profile.workEmail}" is already in use.` };

    await db
      .update(employee)
      .set({
        firstName: profile.firstName,
        middleName: profile.middleName || null,
        lastName: profile.lastName,
        genderId: profile.genderId,
        mobileNumber: profile.mobileNumber,
        viberNumber: profile.viberNumber || null,
        personalEmail: profile.personalEmail || null,
        workEmail: profile.workEmail,
      })
      .where(eq(employee.id, request.employeeId));

    await upsertEmployeeAddresses(request.employeeId, currentAddress, permanentAddress);

    await db
      .update(employeeChangeRequest)
      .set({ status: "approved", reviewedBy: actor.id, reviewedAt: new Date() })
      .where(eq(employeeChangeRequest.id, id));
    await decideApprovalStep(request.approvalRequestId, "approved", actor.id, null);

    const label = formatEmployeeName(profile);
    await recordAudit({
      module: "employees",
      action: "change_approved",
      entityId: request.employeeId,
      entityLabel: label,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: request.changes ?? [],
    });

    refreshViews(request.employeeId);
    return { ok: true, data: undefined, message: `${label}'s change request approved.` };
  });
}

export async function rejectChangeRequest(input: { id: string; note?: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("employees:edit");
    const id = idSchema.parse(input.id);
    const note = noteSchema.parse(input.note);

    const request = await getChangeRequestById(id);
    if (!request) return { ok: false, error: "That request no longer exists." };
    if (request.status !== "pending") return { ok: false, error: "This request has already been reviewed." };

    assertRequestInScope(actor, request.employeeTeamId);
    checkReviewerOutranksRequester(actor, request.requesterId, request.requesterRank, request.requesterRoleLabel);

    await db
      .update(employeeChangeRequest)
      .set({ status: "rejected", reviewedBy: actor.id, reviewedAt: new Date(), reviewNote: note || null })
      .where(eq(employeeChangeRequest.id, id));
    await decideApprovalStep(request.approvalRequestId, "rejected", actor.id, note || null);

    const label = formatEmployeeName({
      firstName: request.employeeFirstName,
      middleName: request.employeeMiddleName,
      lastName: request.employeeLastName,
    });
    await recordAudit({
      module: "employees",
      action: "change_rejected",
      entityId: request.employeeId,
      entityLabel: label,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: null,
    });

    refreshViews(request.employeeId);
    return { ok: true, data: undefined, message: `${label}'s change request rejected.` };
  });
}
