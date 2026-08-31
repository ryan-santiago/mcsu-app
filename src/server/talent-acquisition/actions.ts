"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { taRequest } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { diffFields, recordAudit } from "@/lib/audit";
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
  employmentTypeId: z.string().min(1, "Select an employment type"),
  teamId: z.string().min(1, "Select a team"),
  headcountNeeded: z.coerce.number().int().min(1, "Must be at least 1"),
  workArrangement: z.string().trim().min(1, "Describe the work arrangement"),
  notes: z.string().optional(),
});

const CHANGE_LABELS = {
  jobProfileId: "Job profile",
  clientId: "Client",
  employmentTypeId: "Employment type",
  teamId: "Team",
  headcountNeeded: "Headcount needed",
  workArrangement: "Work arrangement",
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

export async function fetchTeamOptionsForRequest(): Promise<LookupOption[]> {
  await authorize("talent_acquisition:write");
  return listLookupOptions("team");
}

export async function fetchEmploymentTypeOptionsForRequest(): Promise<LookupOption[]> {
  await authorize("talent_acquisition:write");
  return listLookupOptions("employment_type");
}

export async function createTaRequest(input: {
  jobProfileId: string;
  clientId: string;
  employmentTypeId: string;
  teamId: string;
  headcountNeeded: number;
  workArrangement: string;
  notes?: string;
}): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const actor = await authorize("talent_acquisition:write");
    const values = requestInputSchema.parse(input);
    const notes = values.notes?.trim() || null;

    const id = crypto.randomUUID();
    await db.insert(taRequest).values({
      id,
      jobProfileId: values.jobProfileId,
      clientId: values.clientId,
      employmentTypeId: values.employmentTypeId,
      teamId: values.teamId,
      headcountNeeded: values.headcountNeeded,
      workArrangement: values.workArrangement,
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
          employmentTypeId: values.employmentTypeId,
          teamId: values.teamId,
          headcountNeeded: values.headcountNeeded,
          workArrangement: values.workArrangement,
          notes,
        },
        CHANGE_LABELS,
      ),
    });

    revalidatePath("/talent-acquisition");
    return { ok: true, data: { id }, message: "Request created — it's now open for sourcing." };
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
