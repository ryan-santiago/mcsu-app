import "server-only";

import { addDays, addMonths, format } from "date-fns";
import { and, count, countDistinct, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { client, employee, employeeDeployment, employeeEmployment, employeeRecommendation, gender, project, team } from "@/db/schema";
import { can, hasUnrestrictedAccess } from "@/lib/rbac";
import { getCurrentUser, type CurrentUser } from "@/lib/session";
import { latestEmploymentSubquery } from "@/server/employees/queries";
import { listRecommendationQueue } from "@/server/employee-recommendations/queries";

import type {
  BreakdownRow,
  EmployeeRecommendationDashboardData,
  EmployeesDashboardData,
  ProjectsDashboardData,
  TrendPoint,
  WorkforceDashboardData,
} from "./types";

/** Same "org-wide vs own team" rule `listEmployees()` applies — kept as a local copy since that helper isn't exported. */
function canViewAllTeams(actor: CurrentUser): boolean {
  return hasUnrestrictedAccess(actor) || can(actor, "employees:read_all");
}

const RECOMMENDATION_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  erf_generated: "ERF Generated",
  applied: "Applied",
  cancelled: "Cancelled",
};

/** How many points to sample across the range for the headcount trend — weekly under 4 months, monthly beyond that, so a 1-year range doesn't render ~52 crowded points. */
function trendStepFor(from: Date, to: Date): { unit: "week" | "month"; step: number } {
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  return months <= 3 ? { unit: "week", step: 7 } : { unit: "month", step: 1 };
}

async function getEmployeesDashboardData(
  actor: CurrentUser,
  range: { from: Date; to: Date },
): Promise<EmployeesDashboardData | null> {
  if (!can(actor, "employees:read")) return null;
  if (!canViewAllTeams(actor) && !actor.teamId) {
    return {
      headcountNow: 0,
      newHires: 0,
      resignations: 0,
      needsRecommendation: 0,
      employmentRecordCoverage: { withRecord: 0, total: 0 },
      headcountTrend: [],
      employmentTypeBreakdown: [],
      teamBreakdown: [],
      genderBreakdown: [],
    };
  }

  const teamScope = canViewAllTeams(actor) ? undefined : eq(employee.teamId, actor.teamId!);
  const fromDateStr = format(range.from, "yyyy-MM-dd");
  const toDateStr = format(range.to, "yyyy-MM-dd");

  // "Hire date" is the employee's earliest employment record's start date
  // when one exists — that's the actual HR-entered date, versus
  // `employee.createdAt` (when the row was typed into this app), which is a
  // poor proxy the moment historical records get entered or bulk-imported
  // well after the fact (an employee hired years ago, entered into the
  // system today, would otherwise show as "hired today"). Falls back to
  // `createdAt` only for the employees with no employment record at all.
  const hireDate = sql<string>`coalesce((select min(${employeeEmployment.startDate}) from ${employeeEmployment} where ${employeeEmployment.employeeId} = ${employee.id}), ${employee.createdAt}::date)`;

  const [headcountRow] = await db
    .select({ value: count() })
    .from(employee)
    .where(and(eq(employee.isResigned, false), teamScope));

  const [withEmploymentRecordRow] = await db
    .select({ value: countDistinct(employeeEmployment.employeeId) })
    .from(employee)
    .innerJoin(employeeEmployment, eq(employeeEmployment.employeeId, employee.id))
    .where(and(eq(employee.isResigned, false), teamScope));

  const [newHiresRow] = await db
    .select({ value: count() })
    .from(employee)
    .where(and(gte(hireDate, fromDateStr), lte(hireDate, toDateStr), teamScope));

  const [resignationsRow] = await db
    .select({ value: count() })
    .from(employee)
    .where(
      and(
        eq(employee.isResigned, true),
        gte(employee.resignationDate, fromDateStr),
        lte(employee.resignationDate, toDateStr),
        teamScope,
      ),
    );

  const latestEmployment = latestEmploymentSubquery();
  const employmentTypeRows = await db
    .select({ label: latestEmployment.employmentTypeName, value: count() })
    .from(employee)
    .innerJoin(latestEmployment, eq(latestEmployment.employeeId, employee.id))
    .where(and(eq(employee.isResigned, false), teamScope))
    .groupBy(latestEmployment.employmentTypeName)
    .orderBy(latestEmployment.employmentTypeName);

  const teamRows = canViewAllTeams(actor)
    ? await db
        .select({ label: team.name, value: count() })
        .from(employee)
        .innerJoin(team, eq(team.id, employee.teamId))
        .where(eq(employee.isResigned, false))
        .groupBy(team.name)
        .orderBy(team.name)
    : [];

  const genderRows = await db
    .select({ label: gender.name, value: count() })
    .from(employee)
    .innerJoin(gender, eq(gender.id, employee.genderId))
    .where(and(eq(employee.isResigned, false), teamScope))
    .groupBy(gender.name)
    .orderBy(gender.name);

  // "Active as of D" ≈ hired on/before D and not resigned by D — an
  // approximation (an employee re-hired after resigning would double-count
  // as two rows, but that's not a case this schema tracks specially either).
  const { unit, step } = trendStepFor(range.from, range.to);
  const points: TrendPoint[] = [];
  let cursor = range.from;
  while (cursor <= range.to) {
    const cursorStr = format(cursor, "yyyy-MM-dd");
    const [row] = await db
      .select({ value: count() })
      .from(employee)
      .where(
        and(
          lte(hireDate, cursorStr),
          or(eq(employee.isResigned, false), isNull(employee.resignationDate), gte(employee.resignationDate, cursorStr)),
          teamScope,
        ),
      );
    points.push({ date: format(cursor, "MMM d"), count: row.value });
    cursor = unit === "week" ? addDays(cursor, step) : addMonths(cursor, step);
  }
  if (points.length === 0 || points[points.length - 1].date !== format(range.to, "MMM d")) {
    const [row] = await db
      .select({ value: count() })
      .from(employee)
      .where(
        and(
          lte(hireDate, toDateStr),
          or(eq(employee.isResigned, false), isNull(employee.resignationDate), gte(employee.resignationDate, toDateStr)),
          teamScope,
        ),
      );
    points.push({ date: format(range.to, "MMM d"), count: row.value });
  }

  const queue = can(actor, "employee_recommendations:read") ? await listRecommendationQueue() : [];

  return {
    headcountNow: headcountRow.value,
    newHires: newHiresRow.value,
    resignations: resignationsRow.value,
    needsRecommendation: queue.length,
    employmentRecordCoverage: { withRecord: withEmploymentRecordRow.value, total: headcountRow.value },
    headcountTrend: points,
    employmentTypeBreakdown: employmentTypeRows.map((r): BreakdownRow => ({ label: r.label, count: r.value })),
    teamBreakdown: teamRows.map((r): BreakdownRow => ({ label: r.label, count: r.value })),
    genderBreakdown: genderRows.map((r): BreakdownRow => ({ label: r.label, count: r.value })),
  };
}

async function getProjectsDashboardData(
  actor: CurrentUser,
  range: { from: Date; to: Date },
): Promise<ProjectsDashboardData | null> {
  if (!can(actor, "projects:read")) return null;

  const fromDateStr = format(range.from, "yyyy-MM-dd");
  const toDateStr = format(range.to, "yyyy-MM-dd");
  const today = format(new Date(), "yyyy-MM-dd");

  const [activeRow] = await db
    .select({ value: count() })
    .from(project)
    .where(or(isNull(project.endDate), gte(project.endDate, today)));

  const [newProjectsRow] = await db
    .select({ value: count() })
    .from(project)
    .where(and(gte(project.startDate, fromDateStr), lte(project.startDate, toDateStr)));

  const [deployedRow] = await db
    .select({ value: countDistinct(employeeDeployment.employeeId) })
    .from(employeeDeployment)
    .where(isNull(employeeDeployment.endDate));

  const clientRows = await db
    .select({ label: client.name, value: count() })
    .from(project)
    .innerJoin(client, eq(client.id, project.clientId))
    .groupBy(client.name)
    .orderBy(client.name);

  return {
    activeProjects: activeRow.value,
    newProjects: newProjectsRow.value,
    deployedHeadcount: deployedRow.value,
    clientBreakdown: clientRows.map((r): BreakdownRow => ({ label: r.label, count: r.value })).sort((a, b) => b.count - a.count),
  };
}

async function getEmployeeRecommendationDashboardData(
  actor: CurrentUser,
  range: { from: Date; to: Date },
): Promise<EmployeeRecommendationDashboardData | null> {
  if (!can(actor, "employee_recommendations:read")) return null;

  const [submittedRow] = await db
    .select({ value: count() })
    .from(employeeRecommendation)
    .where(and(gte(employeeRecommendation.createdAt, range.from), lte(employeeRecommendation.createdAt, range.to)));

  const [pendingRow] = await db
    .select({ value: count() })
    .from(employeeRecommendation)
    .where(inArray(employeeRecommendation.status, ["submitted"]));

  const [appliedRow] = await db
    .select({ value: count() })
    .from(employeeRecommendation)
    .where(
      and(
        gte(employeeRecommendation.appliedToEmploymentHistoryAt, range.from),
        lte(employeeRecommendation.appliedToEmploymentHistoryAt, range.to),
      ),
    );

  const statusRows = await db
    .select({ label: employeeRecommendation.status, value: count() })
    .from(employeeRecommendation)
    .where(and(gte(employeeRecommendation.createdAt, range.from), lte(employeeRecommendation.createdAt, range.to)))
    .groupBy(employeeRecommendation.status);

  return {
    submitted: submittedRow.value,
    pendingApproval: pendingRow.value,
    appliedToEmploymentHistory: appliedRow.value,
    statusBreakdown: statusRows.map(
      (r): BreakdownRow => ({ label: RECOMMENDATION_STATUS_LABELS[r.label] ?? r.label, count: r.value }),
    ),
  };
}

export async function getWorkforceDashboardData(
  range: { from: Date; to: Date },
): Promise<WorkforceDashboardData> {
  const actor = await getCurrentUser();
  if (!actor) return { employees: null, projects: null, employeeRecommendation: null };

  const [employees, projects, employeeRecommendationData] = await Promise.all([
    getEmployeesDashboardData(actor, range),
    getProjectsDashboardData(actor, range),
    getEmployeeRecommendationDashboardData(actor, range),
  ]);

  return { employees, projects, employeeRecommendation: employeeRecommendationData };
}
