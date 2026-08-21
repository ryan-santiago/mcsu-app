"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { employee, employeeAddress, employeeDeployment, employeeEmployment, project } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { diffFields, recordAudit } from "@/lib/audit";
import { formatEmployeeName } from "@/lib/employee-format";
import { hasUnrestrictedAccess } from "@/lib/rbac";
import { AuthorizationError, authorize, type CurrentUser } from "@/lib/session";
import {
  deploymentRecordSchema,
  employeeFormSchema,
  employmentRecordSchema,
  type DeploymentRecordInput,
  type EmployeeFormInput,
  type EmploymentRecordInput,
} from "@/lib/validation/employee";
import { listLookupOptions } from "@/server/maintenance/queries";
import type { LookupKind, LookupOption } from "@/server/maintenance/types";
import { listProjectOptions } from "@/server/projects/queries";
import type { ProjectOption } from "@/server/projects/types";

import { getEmployeeById, listEmployees } from "./queries";
import type { EmployeeDetail, EmployeeFilters, EmployeeListResult } from "./types";

const idSchema = z.string().min(1, "A record must be selected");

async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "That request was not valid." };
    }
    console.error("[employees] action failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

function refreshEmployeeViews(employeeId?: string) {
  revalidatePath("/employees");
  if (employeeId) revalidatePath(`/employees/${employeeId}`);
}

async function loadEmployeeLabel(employeeId: string): Promise<string | null> {
  const [row] = await db
    .select({ firstName: employee.firstName, middleName: employee.middleName, lastName: employee.lastName })
    .from(employee)
    .where(eq(employee.id, employeeId))
    .limit(1);
  return row ? formatEmployeeName(row) : null;
}

/**
 * Mirrors the read-side scoping in `listEmployees`/`getEmployeeById`
 * (`./queries.ts`) for mutations: a non-admin acting on an employee outside
 * their own team is treated the same as one lacking the permission at all.
 */
async function assertEmployeeInScope(actor: CurrentUser, employeeId: string): Promise<void> {
  if (hasUnrestrictedAccess(actor)) return;

  const [row] = await db.select({ teamId: employee.teamId }).from(employee).where(eq(employee.id, employeeId)).limit(1);
  if (!actor.teamId || row?.teamId !== actor.teamId) {
    throw new AuthorizationError("You can only manage employees on your own team.");
  }
}

/**
 * Neon's HTTP driver has no interactive transactions (see `docs/ARCHITECTURE.md`),
 * so closing the previously-open record happens *after* the new one is
 * inserted, not atomically with it. If this second write fails, the newest
 * row (correct by `startDate DESC`) is still what every read shows as
 * current — the only residual effect is a stale row that still displays as
 * open, which self-heals the next time a record is added.
 */
async function closeOtherOpenEmployments(employeeId: string, keepId: string, closeAtDate: string) {
  await db
    .update(employeeEmployment)
    .set({ endDate: closeAtDate })
    .where(
      and(
        eq(employeeEmployment.employeeId, employeeId),
        isNull(employeeEmployment.endDate),
        ne(employeeEmployment.id, keepId),
      ),
    );
}

/**
 * A resignation date means the employee's latest employment record ended
 * that day — whether it was still open ("Currently in this role") or
 * already closed with some other end date, its `endDate` is force-set to
 * the resignation date. "Latest" uses the same ordering as
 * `loadEmployeeDetail`'s employments list (open row first, else newest
 * `startDate`), so this always targets the one row the Employee module
 * shows as current. Safe to call every time a resignation date is saved:
 * re-setting an already-matching end date is a no-op.
 */
async function closeLatestEmploymentAtResignation(employeeId: string, resignationDate: string) {
  const [latest] = await db
    .select({ id: employeeEmployment.id })
    .from(employeeEmployment)
    .where(eq(employeeEmployment.employeeId, employeeId))
    .orderBy(sql`${employeeEmployment.endDate} IS NULL DESC`, desc(employeeEmployment.startDate))
    .limit(1);
  if (!latest) return;

  await db.update(employeeEmployment).set({ endDate: resignationDate }).where(eq(employeeEmployment.id, latest.id));
}

/* -------------------------------------------------------------------------- */
/*  Read                                                                      */
/* -------------------------------------------------------------------------- */

export async function fetchEmployees(filters: EmployeeFilters): Promise<EmployeeListResult> {
  return listEmployees(filters);
}

export async function fetchEmployee(id: string): Promise<EmployeeDetail | null> {
  return getEmployeeById(id);
}

/** Active options for the Gender/Team/Level/Position/Client pickers in the employee form. */
export async function fetchLookupOptions(kind: LookupKind): Promise<LookupOption[]> {
  await authorize("employees:read");
  return listLookupOptions(kind);
}

/** Options for the deployment history form's Project picker, optionally scoped to a client. */
export async function fetchProjectOptions(clientId?: string): Promise<ProjectOption[]> {
  await authorize("employees:read");
  return listProjectOptions(clientId);
}

async function loadProjectName(projectId: string): Promise<string | null> {
  const [row] = await db.select({ name: project.name }).from(project).where(eq(project.id, projectId)).limit(1);
  return row?.name ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Employee profile                                                         */
/* -------------------------------------------------------------------------- */

export async function createEmployee(input: EmployeeFormInput): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const actor = await authorize("employees:write");
    const { profile, currentAddress, permanentAddress } = employeeFormSchema.parse(input);

    if (!hasUnrestrictedAccess(actor) && profile.teamId !== actor.teamId) {
      return { ok: false, error: "You can only add employees to your own team." };
    }

    if (profile.code) {
      const [existingCode] = await db
        .select({ id: employee.id })
        .from(employee)
        .where(eq(employee.code, profile.code))
        .limit(1);
      if (existingCode) return { ok: false, error: `Employee code "${profile.code}" is already in use.` };
    }

    const [existingEmail] = await db
      .select({ id: employee.id })
      .from(employee)
      .where(eq(employee.workEmail, profile.workEmail))
      .limit(1);
    if (existingEmail) return { ok: false, error: `Work email "${profile.workEmail}" is already in use.` };

    const id = crypto.randomUUID();
    const resignationDate = profile.resignationDate || null;

    await db.insert(employee).values({
      id,
      code: profile.code || null,
      firstName: profile.firstName,
      middleName: profile.middleName || null,
      lastName: profile.lastName,
      genderId: profile.genderId,
      mobileNumber: profile.mobileNumber,
      viberNumber: profile.viberNumber || null,
      personalEmail: profile.personalEmail || null,
      workEmail: profile.workEmail,
      teamId: profile.teamId,
      resignationDate,
      reasonForLeaving: profile.reasonForLeaving || null,
      isResigned: Boolean(resignationDate),
    });

    await db.insert(employeeAddress).values([
      { id: crypto.randomUUID(), employeeId: id, type: "current", ...toAddressValues(currentAddress) },
      { id: crypto.randomUUID(), employeeId: id, type: "permanent", ...toAddressValues(permanentAddress) },
    ]);

    const label = formatEmployeeName(profile);
    await recordAudit({
      module: "employees",
      action: "created",
      entityId: id,
      entityLabel: label,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(null, { code: profile.code || null }, { code: "Employee code" }),
    });

    refreshEmployeeViews(id);
    return { ok: true, data: { id }, message: `${label} added.` };
  });
}

export async function updateEmployee(
  input: { id: string } & EmployeeFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("employees:edit");
    const id = idSchema.parse(input.id);
    const { profile, currentAddress, permanentAddress } = employeeFormSchema.parse(input);

    await assertEmployeeInScope(actor, id);
    if (!hasUnrestrictedAccess(actor) && profile.teamId !== actor.teamId) {
      return { ok: false, error: "You can only reassign employees within your own team." };
    }

    const [existing] = await db.select().from(employee).where(eq(employee.id, id)).limit(1);
    if (!existing) return { ok: false, error: "That employee no longer exists." };

    if (profile.code) {
      const [duplicateCode] = await db
        .select({ id: employee.id })
        .from(employee)
        .where(and(eq(employee.code, profile.code), ne(employee.id, id)))
        .limit(1);
      if (duplicateCode) return { ok: false, error: `Employee code "${profile.code}" is already in use.` };
    }

    const [duplicateEmail] = await db
      .select({ id: employee.id })
      .from(employee)
      .where(and(eq(employee.workEmail, profile.workEmail), ne(employee.id, id)))
      .limit(1);
    if (duplicateEmail) return { ok: false, error: `Work email "${profile.workEmail}" is already in use.` };

    const resignationDate = profile.resignationDate || null;
    const reasonForLeaving = profile.reasonForLeaving || null;

    await db
      .update(employee)
      .set({
        code: profile.code || null,
        firstName: profile.firstName,
        middleName: profile.middleName || null,
        lastName: profile.lastName,
        genderId: profile.genderId,
        mobileNumber: profile.mobileNumber,
        viberNumber: profile.viberNumber || null,
        personalEmail: profile.personalEmail || null,
        workEmail: profile.workEmail,
        teamId: profile.teamId,
        resignationDate,
        reasonForLeaving,
        isResigned: Boolean(resignationDate),
      })
      .where(eq(employee.id, id));

    if (resignationDate) await closeLatestEmploymentAtResignation(id, resignationDate);

    await upsertEmployeeAddresses(id, currentAddress, permanentAddress);

    const label = formatEmployeeName(profile);
    await recordAudit({
      module: "employees",
      action: "updated",
      entityId: id,
      entityLabel: label,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(
        {
          code: existing.code,
          firstName: existing.firstName,
          middleName: existing.middleName,
          lastName: existing.lastName,
          mobileNumber: existing.mobileNumber,
          viberNumber: existing.viberNumber,
          personalEmail: existing.personalEmail,
          workEmail: existing.workEmail,
          resignationDate: existing.resignationDate,
          reasonForLeaving: existing.reasonForLeaving,
        },
        {
          code: profile.code || null,
          firstName: profile.firstName,
          middleName: profile.middleName || null,
          lastName: profile.lastName,
          mobileNumber: profile.mobileNumber,
          viberNumber: profile.viberNumber || null,
          personalEmail: profile.personalEmail || null,
          workEmail: profile.workEmail,
          resignationDate,
          reasonForLeaving,
        },
        {
          code: "Employee code",
          firstName: "First name",
          middleName: "Middle name",
          lastName: "Last name",
          mobileNumber: "Mobile number",
          viberNumber: "Viber number",
          personalEmail: "Personal email",
          workEmail: "Work email",
          resignationDate: "Resignation date",
          reasonForLeaving: "Reason for leaving",
        },
      ),
    });

    refreshEmployeeViews(id);
    return { ok: true, data: undefined, message: `${label} updated.` };
  });
}

export async function deleteEmployee(input: { id: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("employees:delete");
    const id = idSchema.parse(input.id);
    await assertEmployeeInScope(actor, id);

    const [target] = await db.select().from(employee).where(eq(employee.id, id)).limit(1);
    if (!target) return { ok: false, error: "That employee no longer exists." };

    const label = formatEmployeeName(target);
    await recordAudit({
      module: "employees",
      action: "deleted",
      entityId: id,
      entityLabel: label,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields({ code: target.code }, null, { code: "Employee code" }),
    });

    // Addresses, employment and deployment history cascade via FK.
    await db.delete(employee).where(eq(employee.id, id));

    refreshEmployeeViews();
    return { ok: true, data: undefined, message: `${label} removed.` };
  });
}

function toAddressValues(address: EmployeeFormInput["currentAddress"]) {
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

/**
 * Upserts both address rows for an employee — shared by `updateEmployee`
 * (HR-initiated) and `approveChangeRequest`
 * (`src/server/change-requests/actions.ts`, a self-service edit approval),
 * since both end up writing the same Current/Permanent address pair.
 */
export async function upsertEmployeeAddresses(
  employeeId: string,
  currentAddress: EmployeeFormInput["currentAddress"],
  permanentAddress: EmployeeFormInput["permanentAddress"],
) {
  for (const [type, address] of [
    ["current", currentAddress],
    ["permanent", permanentAddress],
  ] as const) {
    const result = await db
      .update(employeeAddress)
      .set(toAddressValues(address))
      .where(and(eq(employeeAddress.employeeId, employeeId), eq(employeeAddress.type, type)));
    if (result.rowCount === 0) {
      await db.insert(employeeAddress).values({
        id: crypto.randomUUID(),
        employeeId,
        type,
        ...toAddressValues(address),
      });
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Employment history                                                       */
/* -------------------------------------------------------------------------- */

export async function addEmploymentRecord(
  input: { employeeId: string } & EmploymentRecordInput,
): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("employees:edit");
    const employeeId = idSchema.parse(input.employeeId);
    const data = employmentRecordSchema.parse(input);
    await assertEmployeeInScope(actor, employeeId);

    const label = await loadEmployeeLabel(employeeId);
    if (!label) return { ok: false, error: "That employee no longer exists." };

    const id = crypto.randomUUID();
    const endDate = data.endDate || null;

    await db.insert(employeeEmployment).values({
      id,
      employeeId,
      salary: data.salary,
      communicationAllowance: data.communicationAllowance,
      transportationAllowance: data.transportationAllowance,
      levelId: data.levelId,
      positionId: data.positionId,
      employmentTypeId: data.employmentTypeId,
      startDate: data.startDate,
      endDate,
    });

    if (!endDate) await closeOtherOpenEmployments(employeeId, id, data.startDate);

    await recordAudit({
      module: "employees",
      action: "employment_added",
      entityId: employeeId,
      entityLabel: label,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(
        null,
        { position: data.positionId, level: data.levelId, startDate: data.startDate },
        { position: "Position", level: "Level", startDate: "Start date" },
      ),
    });

    refreshEmployeeViews(employeeId);
    return { ok: true, data: undefined, message: "Employment record added." };
  });
}

export async function updateEmploymentRecord(
  input: { id: string; employeeId: string } & EmploymentRecordInput,
): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("employees:edit");
    const id = idSchema.parse(input.id);
    const employeeId = idSchema.parse(input.employeeId);
    const data = employmentRecordSchema.parse(input);
    await assertEmployeeInScope(actor, employeeId);

    const [existing] = await db
      .select()
      .from(employeeEmployment)
      .where(and(eq(employeeEmployment.id, id), eq(employeeEmployment.employeeId, employeeId)))
      .limit(1);
    if (!existing) return { ok: false, error: "That employment record no longer exists." };

    const label = await loadEmployeeLabel(employeeId);
    if (!label) return { ok: false, error: "That employee no longer exists." };

    const endDate = data.endDate || null;

    await db
      .update(employeeEmployment)
      .set({
        salary: data.salary,
        communicationAllowance: data.communicationAllowance,
        transportationAllowance: data.transportationAllowance,
        levelId: data.levelId,
        positionId: data.positionId,
        employmentTypeId: data.employmentTypeId,
        startDate: data.startDate,
        endDate,
      })
      .where(eq(employeeEmployment.id, id));

    if (!endDate) await closeOtherOpenEmployments(employeeId, id, data.startDate);

    await recordAudit({
      module: "employees",
      action: "employment_updated",
      entityId: employeeId,
      entityLabel: label,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(
        { position: existing.positionId, level: existing.levelId, startDate: existing.startDate, endDate: existing.endDate },
        { position: data.positionId, level: data.levelId, startDate: data.startDate, endDate },
        { position: "Position", level: "Level", startDate: "Start date", endDate: "End date" },
      ),
    });

    refreshEmployeeViews(employeeId);
    return { ok: true, data: undefined, message: "Employment record updated." };
  });
}

export async function deleteEmploymentRecord(input: { id: string; employeeId: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("employees:delete");
    const id = idSchema.parse(input.id);
    const employeeId = idSchema.parse(input.employeeId);
    await assertEmployeeInScope(actor, employeeId);

    const [existing] = await db
      .select()
      .from(employeeEmployment)
      .where(and(eq(employeeEmployment.id, id), eq(employeeEmployment.employeeId, employeeId)))
      .limit(1);
    if (!existing) return { ok: false, error: "That employment record no longer exists." };

    const label = await loadEmployeeLabel(employeeId);

    await recordAudit({
      module: "employees",
      action: "employment_removed",
      entityId: employeeId,
      entityLabel: label ?? employeeId,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields({ startDate: existing.startDate }, null, { startDate: "Start date" }),
    });

    await db.delete(employeeEmployment).where(eq(employeeEmployment.id, id));

    refreshEmployeeViews(employeeId);
    return { ok: true, data: undefined, message: "Employment record removed." };
  });
}

/* -------------------------------------------------------------------------- */
/*  Deployment history                                                       */
/* -------------------------------------------------------------------------- */

export async function addDeploymentRecord(
  input: { employeeId: string } & DeploymentRecordInput,
): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("employees:edit");
    const employeeId = idSchema.parse(input.employeeId);
    const data = deploymentRecordSchema.parse(input);
    await assertEmployeeInScope(actor, employeeId);

    const label = await loadEmployeeLabel(employeeId);
    if (!label) return { ok: false, error: "That employee no longer exists." };

    const projectName = await loadProjectName(data.projectId);
    if (!projectName) return { ok: false, error: "That project no longer exists." };

    const id = crypto.randomUUID();
    const endDate = data.endDate || null;

    await db.insert(employeeDeployment).values({
      id,
      employeeId,
      clientId: data.clientId,
      projectId: data.projectId,
      startDate: data.startDate,
      endDate,
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
        { client: data.clientId, project: projectName, startDate: data.startDate },
        { client: "Client", project: "Project", startDate: "Start date" },
      ),
    });

    refreshEmployeeViews(employeeId);
    return { ok: true, data: undefined, message: "Deployment record added." };
  });
}

export async function updateDeploymentRecord(
  input: { id: string; employeeId: string } & DeploymentRecordInput,
): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("employees:edit");
    const id = idSchema.parse(input.id);
    const employeeId = idSchema.parse(input.employeeId);
    const data = deploymentRecordSchema.parse(input);
    await assertEmployeeInScope(actor, employeeId);

    const [existing] = await db
      .select()
      .from(employeeDeployment)
      .where(and(eq(employeeDeployment.id, id), eq(employeeDeployment.employeeId, employeeId)))
      .limit(1);
    if (!existing) return { ok: false, error: "That deployment record no longer exists." };

    const label = await loadEmployeeLabel(employeeId);
    if (!label) return { ok: false, error: "That employee no longer exists." };

    const [existingProjectName, newProjectName] = await Promise.all([
      loadProjectName(existing.projectId),
      loadProjectName(data.projectId),
    ]);
    if (!newProjectName) return { ok: false, error: "That project no longer exists." };

    const endDate = data.endDate || null;

    await db
      .update(employeeDeployment)
      .set({
        clientId: data.clientId,
        projectId: data.projectId,
        startDate: data.startDate,
        endDate,
      })
      .where(eq(employeeDeployment.id, id));

    await recordAudit({
      module: "employees",
      action: "deployment_updated",
      entityId: employeeId,
      entityLabel: label,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(
        {
          client: existing.clientId,
          project: existingProjectName,
          startDate: existing.startDate,
          endDate: existing.endDate,
        },
        { client: data.clientId, project: newProjectName, startDate: data.startDate, endDate },
        { client: "Client", project: "Project", startDate: "Start date", endDate: "End date" },
      ),
    });

    refreshEmployeeViews(employeeId);
    return { ok: true, data: undefined, message: "Deployment record updated." };
  });
}

export async function deleteDeploymentRecord(input: { id: string; employeeId: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("employees:delete");
    const id = idSchema.parse(input.id);
    const employeeId = idSchema.parse(input.employeeId);
    await assertEmployeeInScope(actor, employeeId);

    const [existing] = await db
      .select()
      .from(employeeDeployment)
      .where(and(eq(employeeDeployment.id, id), eq(employeeDeployment.employeeId, employeeId)))
      .limit(1);
    if (!existing) return { ok: false, error: "That deployment record no longer exists." };

    const label = await loadEmployeeLabel(employeeId);

    await recordAudit({
      module: "employees",
      action: "deployment_removed",
      entityId: employeeId,
      entityLabel: label ?? employeeId,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields({ startDate: existing.startDate }, null, { startDate: "Start date" }),
    });

    await db.delete(employeeDeployment).where(eq(employeeDeployment.id, id));

    refreshEmployeeViews(employeeId);
    return { ok: true, data: undefined, message: "Deployment record removed." };
  });
}
