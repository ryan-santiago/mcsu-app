"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { jobProfile, level, position } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { diffFields, recordAudit } from "@/lib/audit";
import { sanitizeDescriptionHtml } from "@/lib/sanitize-html";
import { AuthorizationError, authorize } from "@/lib/session";
import { listLookupOptions } from "@/server/maintenance/queries";
import type { LookupOption } from "@/server/maintenance/types";

import { listJobProfiles } from "./queries";
import type { JobProfileRow } from "./types";

const idSchema = z.string().min(1, "A job profile must be selected");
const lookupIdSchema = z.string().min(1, "Required");

const jobProfileInputSchema = z.object({
  positionId: lookupIdSchema,
  levelId: lookupIdSchema,
  jobDescription: z.string().optional(),
  jobQualification: z.string().optional(),
});

const CHANGE_LABELS = {
  position: "Position / Level",
  jobDescription: "Job description",
  jobQualification: "Job qualification",
};

async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "That request was not valid." };
    }
    console.error("[job-profiles] action failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

function refreshJobProfilesView() {
  revalidatePath("/admin/maintenance");
}

/** "Position — Level", resolved fresh so a rename elsewhere shows up immediately in the audit entry. */
async function labelFor(positionId: string, levelId: string): Promise<string> {
  const [[positionRow], [levelRow]] = await Promise.all([
    db.select({ name: position.name }).from(position).where(eq(position.id, positionId)).limit(1),
    db.select({ name: level.name }).from(level).where(eq(level.id, levelId)).limit(1),
  ]);
  return `${positionRow?.name ?? "Unknown position"} — ${levelRow?.name ?? "Unknown level"}`;
}

/** Server-action entry point for the Job Profiles table's TanStack Query `queryFn`. */
export async function fetchJobProfiles(): Promise<JobProfileRow[]> {
  return listJobProfiles();
}

/** Active Position/Level options for the Job Profile form's pickers — gated by `maintenance:read` since this lives under Maintenance, not Employees. */
export async function fetchPositionLevelOptions(): Promise<{ positions: LookupOption[]; levels: LookupOption[] }> {
  await authorize("maintenance:read");
  const [positions, levels] = await Promise.all([listLookupOptions("position"), listLookupOptions("level")]);
  return { positions, levels };
}

export async function createJobProfile(input: {
  positionId: string;
  levelId: string;
  jobDescription?: string;
  jobQualification?: string;
}): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const actor = await authorize("maintenance:write");
    const values = jobProfileInputSchema.parse(input);
    const jobDescription = values.jobDescription ? sanitizeDescriptionHtml(values.jobDescription) || null : null;
    const jobQualification = values.jobQualification
      ? sanitizeDescriptionHtml(values.jobQualification) || null
      : null;

    const [existing] = await db
      .select({ id: jobProfile.id })
      .from(jobProfile)
      .where(and(eq(jobProfile.positionId, values.positionId), eq(jobProfile.levelId, values.levelId)))
      .limit(1);
    if (existing) return { ok: false, error: "A job profile for that position and level already exists." };

    const id = crypto.randomUUID();
    const label = await labelFor(values.positionId, values.levelId);

    await db.insert(jobProfile).values({
      id,
      positionId: values.positionId,
      levelId: values.levelId,
      jobDescription,
      jobQualification,
      createdBy: actor.id,
    });

    await recordAudit({
      module: "job_profiles",
      action: "created",
      entityId: id,
      entityLabel: label,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(null, { position: label, jobDescription, jobQualification }, CHANGE_LABELS),
    });

    refreshJobProfilesView();
    return { ok: true, data: { id }, message: `Job profile "${label}" added.` };
  });
}

export async function updateJobProfile(input: {
  id: string;
  positionId: string;
  levelId: string;
  jobDescription?: string;
  jobQualification?: string;
}): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("maintenance:edit");
    const id = idSchema.parse(input.id);
    const values = jobProfileInputSchema.parse(input);
    const jobDescription = values.jobDescription ? sanitizeDescriptionHtml(values.jobDescription) || null : null;
    const jobQualification = values.jobQualification
      ? sanitizeDescriptionHtml(values.jobQualification) || null
      : null;

    const [target] = await db.select().from(jobProfile).where(eq(jobProfile.id, id)).limit(1);
    if (!target) return { ok: false, error: "That job profile no longer exists." };

    const [duplicate] = await db
      .select({ id: jobProfile.id })
      .from(jobProfile)
      .where(
        and(
          eq(jobProfile.positionId, values.positionId),
          eq(jobProfile.levelId, values.levelId),
          ne(jobProfile.id, id),
        ),
      )
      .limit(1);
    if (duplicate) return { ok: false, error: "A job profile for that position and level already exists." };

    const [oldLabel, newLabel] = await Promise.all([
      labelFor(target.positionId, target.levelId),
      labelFor(values.positionId, values.levelId),
    ]);

    await db
      .update(jobProfile)
      .set({
        positionId: values.positionId,
        levelId: values.levelId,
        jobDescription,
        jobQualification,
      })
      .where(eq(jobProfile.id, id));

    await recordAudit({
      module: "job_profiles",
      action: "updated",
      entityId: id,
      entityLabel: newLabel,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(
        {
          position: oldLabel,
          jobDescription: target.jobDescription,
          jobQualification: target.jobQualification,
        },
        { position: newLabel, jobDescription, jobQualification },
        CHANGE_LABELS,
      ),
    });

    refreshJobProfilesView();
    return { ok: true, data: undefined, message: `Job profile "${newLabel}" updated.` };
  });
}

export async function setJobProfileActive(input: { id: string; isActive: boolean }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("maintenance:edit");
    const id = idSchema.parse(input.id);

    const [target] = await db.select().from(jobProfile).where(eq(jobProfile.id, id)).limit(1);
    if (!target) return { ok: false, error: "That job profile no longer exists." };
    if (target.isActive === input.isActive) {
      return { ok: false, error: `That job profile is already ${input.isActive ? "active" : "inactive"}.` };
    }

    const label = await labelFor(target.positionId, target.levelId);

    await db.update(jobProfile).set({ isActive: input.isActive }).where(eq(jobProfile.id, id));

    await recordAudit({
      module: "job_profiles",
      action: input.isActive ? "activated" : "deactivated",
      entityId: id,
      entityLabel: label,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields({ isActive: target.isActive }, { isActive: input.isActive }, { isActive: "Active" }),
    });

    refreshJobProfilesView();
    return {
      ok: true,
      data: undefined,
      message: input.isActive ? `Job profile "${label}" reactivated.` : `Job profile "${label}" deactivated.`,
    };
  });
}

export async function deleteJobProfile(input: { id: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("maintenance:delete");
    const id = idSchema.parse(input.id);

    const [target] = await db.select().from(jobProfile).where(eq(jobProfile.id, id)).limit(1);
    if (!target) return { ok: false, error: "That job profile no longer exists." };

    const label = await labelFor(target.positionId, target.levelId);

    await recordAudit({
      module: "job_profiles",
      action: "deleted",
      entityId: id,
      entityLabel: label,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields({ position: label }, null, CHANGE_LABELS),
    });

    await db.delete(jobProfile).where(eq(jobProfile.id, id));

    refreshJobProfilesView();
    return { ok: true, data: undefined, message: `Job profile "${label}" removed.` };
  });
}
