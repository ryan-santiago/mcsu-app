import "server-only";

import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  client,
  employee,
  employeeAddress,
  employeeDeployment,
  employeeEmployment,
  employmentType,
  gender,
  level,
  position,
  project,
  team,
} from "@/db/schema";
import { hasUnrestrictedAccess } from "@/lib/rbac";
import { authorize } from "@/lib/session";

import type { EmployeeDetail, EmployeeFilters, EmployeeListResult } from "./types";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function buildWhere(
  filters: EmployeeFilters,
  latestEmployment: ReturnType<typeof latestEmploymentSubquery>,
  latestDeployment: ReturnType<typeof latestDeploymentSubquery>,
  /** Non-null when the caller isn't `hasUnrestrictedAccess()` — narrows the result to their own team. */
  scopeTeamId: string | null,
): SQL | undefined {
  const clauses: SQL[] = [];

  if (scopeTeamId) {
    clauses.push(eq(employee.teamId, scopeTeamId));
  }

  const search = filters.search?.trim();
  if (search) {
    const pattern = `%${search}%`;
    const match = or(
      ilike(employee.firstName, pattern),
      ilike(employee.middleName, pattern),
      ilike(employee.lastName, pattern),
      ilike(employee.code, pattern),
      ilike(employee.workEmail, pattern),
      ilike(employee.personalEmail, pattern),
    );
    if (match) clauses.push(match);
  }

  if (!filters.includeResigned) {
    clauses.push(eq(employee.isResigned, false));
  }

  if (filters.clientId) {
    clauses.push(eq(latestDeployment.clientId, filters.clientId));
  }

  if (filters.employmentTypeId) {
    clauses.push(eq(latestEmployment.employmentTypeId, filters.employmentTypeId));
  }

  if (clauses.length === 0) return undefined;
  return clauses.length === 1 ? clauses[0] : and(...clauses);
}

/** Latest = the row with `endDate IS NULL` (current), else the newest `startDate`. */
export function latestEmploymentSubquery() {
  return db
    .selectDistinctOn([employeeEmployment.employeeId], {
      employeeId: employeeEmployment.employeeId,
      // `.as()` forces distinct column names in the subquery's own SELECT
      // list — without it, Drizzle emits both `level.name` and
      // `position.name` as a bare `name`, which Postgres then can't
      // disambiguate once this subquery is joined back in.
      levelName: sql<string>`${level.name}`.as("level_name"),
      positionName: sql<string>`${position.name}`.as("position_name"),
      employmentTypeId: employeeEmployment.employmentTypeId,
      employmentTypeName: sql<string>`${employmentType.name}`.as("employment_type_name"),
    })
    .from(employeeEmployment)
    .innerJoin(level, eq(level.id, employeeEmployment.levelId))
    .innerJoin(position, eq(position.id, employeeEmployment.positionId))
    .innerJoin(employmentType, eq(employmentType.id, employeeEmployment.employmentTypeId))
    .orderBy(
      employeeEmployment.employeeId,
      sql`${employeeEmployment.endDate} IS NULL DESC`,
      desc(employeeEmployment.startDate),
    )
    .as("latest_employment");
}

/**
 * One row per employee that has a work email, carrying their latest
 * Level/Position. Left-joined (not inner) against `latestEmploymentSubquery`
 * so an employee with no employment history yet still matches by name — used
 * to enrich `user` records matched by email, since there is no formal
 * `user`/`employee` relation.
 */
export function employeeIdentitySubquery() {
  const latestEmployment = latestEmploymentSubquery();
  return db
    .select({
      id: employee.id,
      workEmailLower: sql<string>`lower(${employee.workEmail})`.as("work_email_lower"),
      firstName: employee.firstName,
      middleName: employee.middleName,
      lastName: employee.lastName,
      teamId: employee.teamId,
      levelName: latestEmployment.levelName,
      positionName: latestEmployment.positionName,
    })
    .from(employee)
    .leftJoin(latestEmployment, eq(latestEmployment.employeeId, employee.id))
    .where(sql`${employee.workEmail} is not null`)
    .as("employee_identity");
}

/** Latest = the row with `endDate IS NULL` (current), else the newest `startDate`. */
export function latestDeploymentSubquery() {
  return db
    .selectDistinctOn([employeeDeployment.employeeId], {
      employeeId: employeeDeployment.employeeId,
      clientId: employeeDeployment.clientId,
      clientName: sql<string>`${client.name}`.as("client_name"),
      projectName: sql<string>`${project.name}`.as("project_name"),
      startDate: employeeDeployment.startDate,
      endDate: employeeDeployment.endDate,
    })
    .from(employeeDeployment)
    .innerJoin(client, eq(client.id, employeeDeployment.clientId))
    .innerJoin(project, eq(project.id, employeeDeployment.projectId))
    .orderBy(
      employeeDeployment.employeeId,
      sql`${employeeDeployment.endDate} IS NULL DESC`,
      desc(employeeDeployment.startDate),
    )
    .as("latest_deployment");
}

/**
 * Lists employees for the directory table, each row carrying its latest
 * employment (Level/Position) and deployment (Client/Project) computed via a
 * `DISTINCT ON` subquery per history table, plus the current address.
 * Paginated, same shape as `listUsers`/`listAuditEntries`.
 */
export async function listEmployees(filters: EmployeeFilters = {}): Promise<EmployeeListResult> {
  const actor = await authorize("employees:read");

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));

  // Non-admins with no resolved team see nothing rather than everyone.
  if (!hasUnrestrictedAccess(actor) && !actor.teamId) {
    return { employees: [], total: 0, page, pageSize };
  }

  const latestEmployment = latestEmploymentSubquery();
  const latestDeployment = latestDeploymentSubquery();
  const where = buildWhere(filters, latestEmployment, latestDeployment, hasUnrestrictedAccess(actor) ? null : actor.teamId);

  const rows = await db
    .select({
      id: employee.id,
      code: employee.code,
      firstName: employee.firstName,
      middleName: employee.middleName,
      lastName: employee.lastName,
      latestLevel: latestEmployment.levelName,
      latestPosition: latestEmployment.positionName,
      latestEmploymentType: latestEmployment.employmentTypeName,
      latestClient: latestDeployment.clientName,
      latestProject: latestDeployment.projectName,
      currentBarangay: employeeAddress.barangayName,
      currentCity: employeeAddress.cityName,
      isResigned: employee.isResigned,
    })
    .from(employee)
    .leftJoin(latestEmployment, eq(latestEmployment.employeeId, employee.id))
    .leftJoin(latestDeployment, eq(latestDeployment.employeeId, employee.id))
    .leftJoin(
      employeeAddress,
      and(eq(employeeAddress.employeeId, employee.id), eq(employeeAddress.type, "current")),
    )
    .where(where)
    .orderBy(asc(employee.lastName), asc(employee.firstName))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(employee)
    .leftJoin(latestEmployment, eq(latestEmployment.employeeId, employee.id))
    .leftJoin(latestDeployment, eq(latestDeployment.employeeId, employee.id))
    .where(where);

  return {
    employees: rows.map((row) => ({
      id: row.id,
      code: row.code,
      firstName: row.firstName,
      middleName: row.middleName,
      lastName: row.lastName,
      latestLevel: row.latestLevel,
      latestPosition: row.latestPosition,
      latestEmploymentType: row.latestEmploymentType,
      latestClient: row.latestClient,
      latestProject: row.latestProject,
      currentAddress:
        row.currentBarangay && row.currentCity
          ? { barangayName: row.currentBarangay, cityName: row.currentCity }
          : null,
      isResigned: row.isResigned,
    })),
    total,
    page,
    pageSize,
  };
}

export async function getEmployeeById(id: string): Promise<EmployeeDetail | null> {
  const actor = await authorize("employees:read");
  const detail = await loadEmployeeDetail(id);
  if (!detail) return null;
  if (!hasUnrestrictedAccess(actor) && detail.teamId !== actor.teamId) return null;
  return detail;
}

/**
 * The unauthorized core of `getEmployeeById` — used by `getEmployeeById`
 * itself (gated on `employees:read`) and by
 * `src/server/settings/queries.ts`'s `getMyEmployeeDetail()`, which must let
 * any active user load their *own* record regardless of whether they hold
 * the Employees module permission at all. Same reasoning as
 * `getEmployeeIdentityByEmail` being ungated: safe because the caller
 * controls which `id` reaches it, not the browser.
 */
export async function loadEmployeeDetail(id: string): Promise<EmployeeDetail | null> {
  const [row] = await db
    .select({
      id: employee.id,
      code: employee.code,
      firstName: employee.firstName,
      middleName: employee.middleName,
      lastName: employee.lastName,
      genderId: employee.genderId,
      genderName: gender.name,
      mobileNumber: employee.mobileNumber,
      viberNumber: employee.viberNumber,
      personalEmail: employee.personalEmail,
      workEmail: employee.workEmail,
      teamId: employee.teamId,
      teamName: team.name,
      resignationDate: employee.resignationDate,
      reasonForLeaving: employee.reasonForLeaving,
      isResigned: employee.isResigned,
    })
    .from(employee)
    .innerJoin(gender, eq(gender.id, employee.genderId))
    .leftJoin(team, eq(team.id, employee.teamId))
    .where(eq(employee.id, id))
    .limit(1);

  if (!row) return null;

  const addresses = await db.select().from(employeeAddress).where(eq(employeeAddress.employeeId, id));
  const currentAddress = addresses.find((address) => address.type === "current") ?? null;
  const permanentAddress = addresses.find((address) => address.type === "permanent") ?? null;

  const employments = await db
    .select({
      id: employeeEmployment.id,
      salary: employeeEmployment.salary,
      communicationAllowance: employeeEmployment.communicationAllowance,
      transportationAllowance: employeeEmployment.transportationAllowance,
      levelId: employeeEmployment.levelId,
      levelName: level.name,
      positionId: employeeEmployment.positionId,
      positionName: position.name,
      employmentTypeId: employeeEmployment.employmentTypeId,
      employmentTypeName: employmentType.name,
      startDate: employeeEmployment.startDate,
      endDate: employeeEmployment.endDate,
    })
    .from(employeeEmployment)
    .innerJoin(level, eq(level.id, employeeEmployment.levelId))
    .innerJoin(position, eq(position.id, employeeEmployment.positionId))
    .innerJoin(employmentType, eq(employmentType.id, employeeEmployment.employmentTypeId))
    .where(eq(employeeEmployment.employeeId, id))
    .orderBy(sql`${employeeEmployment.endDate} IS NULL DESC`, desc(employeeEmployment.startDate));

  const deployments = await db
    .select({
      id: employeeDeployment.id,
      clientId: employeeDeployment.clientId,
      clientName: client.name,
      projectId: employeeDeployment.projectId,
      projectName: project.name,
      startDate: employeeDeployment.startDate,
      endDate: employeeDeployment.endDate,
    })
    .from(employeeDeployment)
    .innerJoin(client, eq(client.id, employeeDeployment.clientId))
    .innerJoin(project, eq(project.id, employeeDeployment.projectId))
    .where(eq(employeeDeployment.employeeId, id))
    .orderBy(sql`${employeeDeployment.endDate} IS NULL DESC`, desc(employeeDeployment.startDate));

  return {
    id: row.id,
    code: row.code,
    firstName: row.firstName,
    middleName: row.middleName,
    lastName: row.lastName,
    genderId: row.genderId,
    genderName: row.genderName,
    mobileNumber: row.mobileNumber,
    viberNumber: row.viberNumber,
    personalEmail: row.personalEmail,
    workEmail: row.workEmail,
    teamId: row.teamId,
    teamName: row.teamName,
    resignationDate: row.resignationDate,
    reasonForLeaving: row.reasonForLeaving,
    isResigned: row.isResigned,
    currentAddress,
    permanentAddress,
    employments,
    deployments,
  };
}
