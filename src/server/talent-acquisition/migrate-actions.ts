"use server";

import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import {
  employee,
  employeeAddress,
  employeeDeployment,
  employeeEmployment,
  jobProfile,
  project,
  taApplication,
  taApplicationStage,
  taCandidate,
  taRequest,
} from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { diffFields, recordAudit } from "@/lib/audit";
import { formatEmployeeName } from "@/lib/employee-format";
import { AuthorizationError, authorize } from "@/lib/session";
import { addressSchema, employeeCodeSchema, phMobileOptionalSchema, phMobileSchema } from "@/lib/validation/ph";
import { emailSchema } from "@/lib/validation/auth";
import { listLookupOptions } from "@/server/maintenance/queries";
import type { LookupOption } from "@/server/maintenance/types";
import { listProjectOptions } from "@/server/projects/queries";
import type { ProjectOption } from "@/server/projects/types";

import { notifyMigrationCompleted } from "./notifications";

async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "That request was not valid." };
    }
    console.error("[talent-acquisition/migrate] action failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

const nameFieldSchema = z.string().trim().min(1, "Required").max(80, "That's too long");
const optionalNameFieldSchema = z.string().trim().max(80, "That's too long").optional().or(z.literal(""));
const optionalEmailSchema = emailSchema.optional().or(z.literal(""));

const salarySchema = z
  .string()
  .trim()
  .min(1, "Enter a salary")
  .refine((value) => Number.isFinite(Number(value)) && Number(value) > 0, "Enter a salary greater than zero");
const allowanceSchema = z
  .string()
  .trim()
  .min(1, "Enter an amount (0 if none)")
  .refine((value) => Number.isFinite(Number(value)) && Number(value) >= 0, "Enter a valid amount");

/**
 * Matches `MONITORED_EMPLOYMENT_TYPES` in
 * `src/server/employee-recommendations/queries.ts` — a hire in one of these
 * two types never shows up in that module's monitoring queue without an end
 * date, so this form requires one rather than leaving it to a manual
 * follow-up edit in the Employees module (the gap this fixes — see
 * docs/EMPLOYEE_RECOMMENDATION.md §2 open question 6). Kept as a small
 * literal duplicate rather than importing that "server-only" query module,
 * matching how this file already duplicates its other schemas independently
 * of the Employees module.
 */
const CONTRACT_END_DATE_REQUIRED_TYPES = new Set(["project_based", "probationary"]);

const employmentSchema = z
  .object({
    salary: salarySchema,
    communicationAllowance: allowanceSchema,
    transportationAllowance: allowanceSchema,
    employmentTypeId: z.string().min(1, "Select an employment type"),
    startDate: z.string().min(1, "Select a start date"),
    endDate: z.string().optional().or(z.literal("")),
  })
  .refine((data) => !CONTRACT_END_DATE_REQUIRED_TYPES.has(data.employmentTypeId) || Boolean(data.endDate), {
    message: "Select a contract/probation end date for this employment type",
    path: ["endDate"],
  })
  .refine((data) => !data.endDate || data.endDate >= data.startDate, {
    message: "End date cannot be before the start date",
    path: ["endDate"],
  });

const migrateInputSchema = z.object({
  applicationId: z.string().min(1),
  requestId: z.string().min(1),
  targetOnboardDate: z.string().min(1, "Select a target onboard date"),
  profile: z.object({
    code: employeeCodeSchema,
    firstName: nameFieldSchema,
    middleName: optionalNameFieldSchema,
    lastName: nameFieldSchema,
    genderId: z.string().min(1, "Select a gender"),
    mobileNumber: phMobileSchema,
    viberNumber: phMobileOptionalSchema,
    personalEmail: optionalEmailSchema,
    workEmail: emailSchema,
    teamId: z.string().min(1, "Select a team"),
  }),
  currentAddress: addressSchema,
  permanentAddress: addressSchema,
  employment: employmentSchema,
  deployment: z.object({
    projectId: z.string().min(1, "Select a project"),
    startDate: z.string().min(1, "Select a start date"),
  }),
});

export type MigrateCandidateInput = z.infer<typeof migrateInputSchema>;

function toAddressValues(address: z.infer<typeof addressSchema>) {
  return {
    regionCode: address.regionCode,
    regionName: address.regionName,
    provinceCode: address.provinceCode || null,
    provinceName: address.provinceName || null,
    cityCode: address.cityCode,
    cityName: address.cityName,
    barangayCode: address.barangayCode,
    barangayName: address.barangayName,
    addressLine: address.addressLine,
  };
}

/** Gated on `talent_acquisition:migrate`, not `employees:read` — only a Talent Acquisition Manager needs this, and shouldn't need Employees access too. */
export async function fetchProjectOptionsForClient(clientId: string): Promise<ProjectOption[]> {
  await authorize("talent_acquisition:migrate");
  return listProjectOptions(clientId);
}

export async function fetchTeamOptions(): Promise<LookupOption[]> {
  await authorize("talent_acquisition:migrate");
  return listLookupOptions("team");
}

export async function fetchEmploymentTypeOptions(): Promise<LookupOption[]> {
  await authorize("talent_acquisition:migrate");
  return listLookupOptions("employment_type");
}

/**
 * The one place a Talent Acquisition Manager writes directly into the
 * Employee module's tables — deliberately not routed through
 * `createEmployee`/`addEmploymentRecord`/`addDeploymentRecord`
 * (`src/server/employees/actions.ts`), since those are gated on
 * `employees:write`/`employees:edit` and a TA Manager isn't expected to hold
 * Employees permissions. The column-by-column shape and audit entries below
 * are kept identical to what those functions would produce, so the
 * resulting Employee record and its history look no different from one
 * created directly through the Employee module.
 *
 * Neon's HTTP driver has no interactive transactions (see
 * `src/db/index.ts`), so these are sequential inserts, employee row first —
 * same "authoritative row first" convention `employees/actions.ts` already
 * follows for its own multi-write operations.
 */
export async function migrateCandidateToEmployee(input: MigrateCandidateInput): Promise<ActionResult<{ employeeId: string }>> {
  return run(async () => {
    const actor = await authorize("talent_acquisition:migrate");
    const values = migrateInputSchema.parse(input);

    const [application] = await db.select().from(taApplication).where(eq(taApplication.id, values.applicationId)).limit(1);
    if (!application) return { ok: false, error: "That application no longer exists." };
    if (application.status !== "active") return { ok: false, error: "Only an active application can be migrated." };

    const [candidate] = await db.select().from(taCandidate).where(eq(taCandidate.id, application.candidateId)).limit(1);
    if (!candidate) return { ok: false, error: "That candidate no longer exists." };
    if (candidate.employeeId) return { ok: false, error: "This candidate has already been migrated to Employee." };

    const [finalInterviewStage] = await db
      .select({ status: taApplicationStage.status })
      .from(taApplicationStage)
      .where(and(eq(taApplicationStage.applicationId, values.applicationId), eq(taApplicationStage.stage, "final_interview")))
      .limit(1);
    if (finalInterviewStage?.status !== "passed") {
      return { ok: false, error: "Final Interview must be marked passed before migrating this candidate." };
    }

    const [request] = await db.select().from(taRequest).where(eq(taRequest.id, values.requestId)).limit(1);
    if (!request) return { ok: false, error: "That request no longer exists." };

    const [profile] = await db
      .select({ positionId: jobProfile.positionId, levelId: jobProfile.levelId })
      .from(jobProfile)
      .where(eq(jobProfile.id, request.jobProfileId))
      .limit(1);
    if (!profile) return { ok: false, error: "This request's job profile no longer exists." };

    const [targetProject] = await db
      .select({ name: project.name })
      .from(project)
      .where(eq(project.id, values.deployment.projectId))
      .limit(1);
    if (!targetProject) return { ok: false, error: "That project no longer exists." };

    if (values.profile.code) {
      const [existingCode] = await db
        .select({ id: employee.id })
        .from(employee)
        .where(eq(employee.code, values.profile.code))
        .limit(1);
      if (existingCode) return { ok: false, error: `Employee code "${values.profile.code}" is already in use.` };
    }

    const [existingEmail] = await db
      .select({ id: employee.id })
      .from(employee)
      .where(eq(employee.workEmail, values.profile.workEmail))
      .limit(1);
    if (existingEmail) return { ok: false, error: `Work email "${values.profile.workEmail}" is already in use.` };

    const employeeId = crypto.randomUUID();
    const label = formatEmployeeName(values.profile);

    await db.insert(employee).values({
      id: employeeId,
      code: values.profile.code || null,
      firstName: values.profile.firstName,
      middleName: values.profile.middleName || null,
      lastName: values.profile.lastName,
      genderId: values.profile.genderId,
      mobileNumber: values.profile.mobileNumber,
      viberNumber: values.profile.viberNumber || null,
      personalEmail: values.profile.personalEmail || null,
      workEmail: values.profile.workEmail,
      teamId: values.profile.teamId,
      resignationDate: null,
      reasonForLeaving: null,
      isResigned: false,
    });

    await db.insert(employeeAddress).values([
      { id: crypto.randomUUID(), employeeId, type: "current", ...toAddressValues(values.currentAddress) },
      { id: crypto.randomUUID(), employeeId, type: "permanent", ...toAddressValues(values.permanentAddress) },
    ]);

    await db.insert(employeeEmployment).values({
      id: crypto.randomUUID(),
      employeeId,
      salary: values.employment.salary,
      communicationAllowance: values.employment.communicationAllowance,
      transportationAllowance: values.employment.transportationAllowance,
      levelId: profile.levelId,
      positionId: profile.positionId,
      employmentTypeId: values.employment.employmentTypeId,
      startDate: values.employment.startDate,
      endDate: values.employment.endDate || null,
    });

    await db.insert(employeeDeployment).values({
      id: crypto.randomUUID(),
      employeeId,
      clientId: request.clientId,
      projectId: values.deployment.projectId,
      startDate: values.deployment.startDate,
      endDate: null,
    });

    await db.update(taCandidate).set({ employeeId }).where(eq(taCandidate.id, application.candidateId));

    await db
      .update(taApplication)
      .set({
        status: "hired",
        statusChangedAt: new Date(),
        statusChangedBy: actor.id,
        targetOnboardDate: values.targetOnboardDate,
      })
      .where(eq(taApplication.id, values.applicationId));

    const [{ hiredCount }] = await db
      .select({ hiredCount: count() })
      .from(taApplication)
      .where(and(eq(taApplication.requestId, values.requestId), eq(taApplication.status, "hired")));
    if (request.status !== "cancelled") {
      await db
        .update(taRequest)
        .set({ status: hiredCount >= request.headcountNeeded ? "filled" : "partially_filled" })
        .where(eq(taRequest.id, values.requestId));
    }

    // Mirrors the audit entries `createEmployee`/`addEmploymentRecord`/`addDeploymentRecord`
    // would each record, so this employee's history reads no differently than if HR had
    // entered it directly through the Employee module.
    await recordAudit({
      module: "employees",
      action: "created",
      entityId: employeeId,
      entityLabel: label,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(null, { code: values.profile.code || null }, { code: "Employee code" }),
    });
    await recordAudit({
      module: "employees",
      action: "employment_added",
      entityId: employeeId,
      entityLabel: label,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(
        null,
        { position: profile.positionId, level: profile.levelId, startDate: values.employment.startDate },
        { position: "Position", level: "Level", startDate: "Start date" },
      ),
    });
    await recordAudit({
      module: "employees",
      action: "deployment_added",
      entityId: employeeId,
      entityLabel: label,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(
        null,
        { client: request.clientId, project: targetProject.name, startDate: values.deployment.startDate },
        { client: "Client", project: "Project", startDate: "Start date" },
      ),
    });
    await recordAudit({
      module: "ta_candidates",
      action: "migrated_to_employee",
      entityId: application.candidateId,
      entityLabel: label,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields({ status: "active" }, { status: "hired" }, { status: "Status" }),
    });

    await notifyMigrationCompleted({ requestId: values.requestId, employeeName: label });

    revalidatePath(`/talent-acquisition/${values.requestId}`);
    revalidatePath("/employees");
    revalidatePath(`/employees/${employeeId}`);

    return { ok: true, data: { employeeId }, message: `${label} migrated to Employee.` };
  });
}
