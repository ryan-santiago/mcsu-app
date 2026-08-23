import "server-only";

import { and, asc, eq, notInArray } from "drizzle-orm";

import { db } from "@/db";
import { employee, staffAugmentationAssignment, staffAugmentationEngagement } from "@/db/schema";
import { formatEmployeeName } from "@/lib/employee-format";
import { authorize } from "@/lib/session";
import { latestDeploymentSubquery, latestEmploymentSubquery } from "@/server/employees/queries";

import type { EmployeeOption, StaffAugmentationAssignmentRow } from "./types";

export type StaffAugmentationEngagementRow = {
  id: string;
  name: string;
};

/** Visibility is pure RBAC — anyone holding `staff_augmentation:read` sees every item. */
export async function listStaffAugmentationEngagements(): Promise<StaffAugmentationEngagementRow[]> {
  await authorize("staff_augmentation:read");

  return db
    .select({ id: staffAugmentationEngagement.id, name: staffAugmentationEngagement.name })
    .from(staffAugmentationEngagement)
    .orderBy(asc(staffAugmentationEngagement.name));
}

export async function getStaffAugmentationEngagementById(
  id: string,
): Promise<StaffAugmentationEngagementRow | null> {
  await authorize("staff_augmentation:read");

  const [row] = await db
    .select({ id: staffAugmentationEngagement.id, name: staffAugmentationEngagement.name })
    .from(staffAugmentationEngagement)
    .where(eq(staffAugmentationEngagement.id, id))
    .limit(1);

  return row ?? null;
}

/**
 * Staffing rows for one engagement. Level/Position and Project/dates are
 * never stored on the assignment itself — they're read live from each
 * employee's current employment and latest deployment record, the same
 * `DISTINCT ON` subqueries the Employee directory uses, so this table can
 * never drift from what the Employee module shows for the same person.
 */
export async function listStaffAugmentationAssignments(
  engagementId: string,
): Promise<StaffAugmentationAssignmentRow[]> {
  await authorize("staff_augmentation:read");

  const latestEmployment = latestEmploymentSubquery();
  const latestDeployment = latestDeploymentSubquery();

  const rows = await db
    .select({
      id: staffAugmentationAssignment.id,
      employeeId: employee.id,
      firstName: employee.firstName,
      middleName: employee.middleName,
      lastName: employee.lastName,
      level: latestEmployment.levelName,
      position: latestEmployment.positionName,
      projectName: latestDeployment.projectName,
      startDate: latestDeployment.startDate,
      endDate: latestDeployment.endDate,
    })
    .from(staffAugmentationAssignment)
    .innerJoin(employee, eq(employee.id, staffAugmentationAssignment.employeeId))
    .leftJoin(latestEmployment, eq(latestEmployment.employeeId, employee.id))
    .leftJoin(latestDeployment, eq(latestDeployment.employeeId, employee.id))
    .where(eq(staffAugmentationAssignment.engagementId, engagementId))
    .orderBy(asc(employee.lastName), asc(employee.firstName));

  return rows.map((row) => ({
    id: row.id,
    employeeId: row.employeeId,
    employeeName: formatEmployeeName(row),
    level: row.level,
    position: row.position,
    projectName: row.projectName,
    startDate: row.startDate,
    endDate: row.endDate,
  }));
}

/**
 * Active employees not yet staffed on this engagement — feeds the "Add
 * employee" picker. Mirrors `listEmployeeOptions` in
 * `src/server/devices/queries.ts`.
 */
export async function listStaffAugmentationEmployeeOptions(engagementId: string): Promise<EmployeeOption[]> {
  const alreadyAssigned = db
    .select({ employeeId: staffAugmentationAssignment.employeeId })
    .from(staffAugmentationAssignment)
    .where(eq(staffAugmentationAssignment.engagementId, engagementId));

  const rows = await db
    .select({
      id: employee.id,
      firstName: employee.firstName,
      middleName: employee.middleName,
      lastName: employee.lastName,
    })
    .from(employee)
    .where(and(eq(employee.isResigned, false), notInArray(employee.id, alreadyAssigned)))
    .orderBy(asc(employee.lastName), asc(employee.firstName));

  return rows.map((row) => ({ id: row.id, name: formatEmployeeName(row) }));
}
