"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { role, taRequest, user } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { diffFields, recordAudit } from "@/lib/audit";
import { denyReasonForActingOn } from "@/lib/rbac";
import { AuthorizationError, authorize } from "@/lib/session";
import { listActiveJobProfileOptions } from "@/server/job-profiles/queries";
import type { JobProfileOption } from "@/server/job-profiles/types";
import { listLookupOptions } from "@/server/maintenance/queries";
import type { LookupOption } from "@/server/maintenance/types";

import { getTaRequestById, listTaRequests } from "./queries";
import type { TaRequestRow } from "./types";

const requestInputSchema = z.object({
  jobProfileId: z.string().min(1, "Select a job profile"),
  clientId: z.string().min(1, "Select a client"),
  headcountNeeded: z.coerce.number().int().min(1, "Must be at least 1"),
  workSetup: z.enum(["onsite", "hybrid", "remote"]),
  workSetupDetail: z.string().optional(),
  notes: z.string().optional(),
});

const reviewNoteSchema = z.string().trim().min(1, "Enter a reason").max(500, "Keep it under 500 characters");

const CHANGE_LABELS = {
  jobProfileId: "Job profile",
  clientId: "Client",
  headcountNeeded: "Headcount needed",
  workSetup: "Work setup",
  workSetupDetail: "Work setup detail",
  notes: "Notes",
};

async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "That request was not valid." };
    }
    console.error("[talent-acquisition] action failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/** Rank-checks the approver/rejecter against the requester — same defense-in-depth precedent as `change-requests/actions.ts`. A request with no requester (deleted account) has no one left to protect, so it proceeds unchecked. */
async function assertOutranksRequester(actor: { id: string; rank: number }, requestedBy: string | null): Promise<void> {
  if (!requestedBy) return;

  const [requester] = await db
    .select({ rank: role.rank, roleLabel: role.label })
    .from(user)
    .innerJoin(role, eq(user.roleId, role.id))
    .where(eq(user.id, requestedBy))
    .limit(1);
  if (!requester) return;

  const denial = denyReasonForActingOn(actor, { id: requestedBy, rank: requester.rank, roleLabel: requester.roleLabel });
  if (denial) throw new AuthorizationError(denial);
}

/** Server-action entry points for the Requests list/detail's TanStack Query `queryFn`s. */
export async function fetchTaRequests(): Promise<TaRequestRow[]> {
  return listTaRequests();
}

export async function fetchTaRequest(id: string): Promise<TaRequestRow | null> {
  return getTaRequestById(id);
}

/** Gated on `talent_acquisition:write`, not `:read` — only someone filing a request needs the picker options. */
export async function fetchJobProfileOptions(): Promise<JobProfileOption[]> {
  await authorize("talent_acquisition:write");
  return listActiveJobProfileOptions();
}

export async function fetchClientOptions(): Promise<LookupOption[]> {
  await authorize("talent_acquisition:write");
  return listLookupOptions("client");
}

export async function createTaRequest(input: {
  jobProfileId: string;
  clientId: string;
  headcountNeeded: number;
  workSetup: string;
  workSetupDetail?: string;
  notes?: string;
}): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const actor = await authorize("talent_acquisition:write");
    const values = requestInputSchema.parse(input);
    const workSetupDetail = values.workSetupDetail?.trim() || null;
    const notes = values.notes?.trim() || null;

    const id = crypto.randomUUID();
    await db.insert(taRequest).values({
      id,
      jobProfileId: values.jobProfileId,
      clientId: values.clientId,
      headcountNeeded: values.headcountNeeded,
      workSetup: values.workSetup,
      workSetupDetail,
      notes,
      requestedBy: actor.id,
    });

    await recordAudit({
      module: "ta_requests",
      action: "created",
      entityId: id,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(
        null,
        {
          jobProfileId: values.jobProfileId,
          clientId: values.clientId,
          headcountNeeded: values.headcountNeeded,
          workSetup: values.workSetup,
          workSetupDetail,
          notes,
        },
        CHANGE_LABELS,
      ),
    });

    revalidatePath("/talent-acquisition");
    return { ok: true, data: { id }, message: "Request submitted for approval." };
  });
}

export async function approveTaRequest(input: { id: string; reviewNote?: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("talent_acquisition:approve");

    const [target] = await db.select().from(taRequest).where(eq(taRequest.id, input.id)).limit(1);
    if (!target) return { ok: false, error: "That request no longer exists." };
    if (target.status !== "pending_approval") return { ok: false, error: "This request isn't awaiting approval." };

    await assertOutranksRequester(actor, target.requestedBy);

    const reviewNote = input.reviewNote?.trim() || null;
    await db
      .update(taRequest)
      .set({ status: "open", approvedBy: actor.id, approvedAt: new Date(), reviewNote })
      .where(eq(taRequest.id, input.id));

    await recordAudit({
      module: "ta_requests",
      action: "approved",
      entityId: input.id,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields({ status: "pending_approval" }, { status: "open" }, { status: "Status" }),
    });

    revalidatePath("/talent-acquisition");
    revalidatePath(`/talent-acquisition/${input.id}`);
    return { ok: true, data: undefined, message: "Request approved — it's now open for sourcing." };
  });
}

export async function rejectTaRequest(input: { id: string; reviewNote: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("talent_acquisition:approve");
    const reviewNote = reviewNoteSchema.parse(input.reviewNote);

    const [target] = await db.select().from(taRequest).where(eq(taRequest.id, input.id)).limit(1);
    if (!target) return { ok: false, error: "That request no longer exists." };
    if (target.status !== "pending_approval") return { ok: false, error: "This request isn't awaiting approval." };

    await assertOutranksRequester(actor, target.requestedBy);

    await db
      .update(taRequest)
      .set({ status: "cancelled", approvedBy: actor.id, approvedAt: new Date(), reviewNote })
      .where(eq(taRequest.id, input.id));

    await recordAudit({
      module: "ta_requests",
      action: "rejected",
      entityId: input.id,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields({ status: "pending_approval" }, { status: "cancelled" }, { status: "Status" }),
    });

    revalidatePath("/talent-acquisition");
    revalidatePath(`/talent-acquisition/${input.id}`);
    return { ok: true, data: undefined, message: "Request rejected." };
  });
}

export async function cancelTaRequest(input: { id: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("talent_acquisition:edit");

    const [target] = await db.select().from(taRequest).where(eq(taRequest.id, input.id)).limit(1);
    if (!target) return { ok: false, error: "That request no longer exists." };
    if (target.status === "cancelled") return { ok: false, error: "That request is already cancelled." };

    await db.update(taRequest).set({ status: "cancelled" }).where(eq(taRequest.id, input.id));

    await recordAudit({
      module: "ta_requests",
      action: "updated",
      entityId: input.id,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields({ status: target.status }, { status: "cancelled" }, { status: "Status" }),
    });

    revalidatePath("/talent-acquisition");
    revalidatePath(`/talent-acquisition/${input.id}`);
    return { ok: true, data: undefined, message: "Request cancelled." };
  });
}
