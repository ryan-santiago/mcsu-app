import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { employee, employeeRecommendation, taRequest, team, user } from "@/db/schema";
import { employeeIdentitySubquery } from "@/server/employees/queries";

/**
 * Recipient resolution shared by the Talent Acquisition and Employee
 * Recommendation notification modules — both route stage/approval emails to
 * combinations of "the requesting team's Team Lead/Manager", a specific
 * team's Unit Manager/Department Head, or a built-in role broadcast, and
 * getting this wrong risks silently misrouting an approval-critical email.
 * Worth one shared, correct implementation rather than two independent ones.
 */

/** Active users holding a specific built-in role id (e.g. "admin", "talent_acquisition_manager"), by email. Hardcoded role ids match the existing convention in `src/lib/auth.ts`'s bootstrap logic. */
export async function emailsOfRole(roleId: string): Promise<string[]> {
  const rows = await db
    .select({ email: user.email })
    .from(user)
    .where(and(eq(user.roleId, roleId), eq(user.status, "active")));
  return Array.from(new Set(rows.map((row) => row.email)));
}

/**
 * The active "Team Lead/Manager"-role user(s) whose linked Employee record
 * belongs to `teamId` — resolved via the same work-email identity match
 * `getEmployeeIdentityByEmail` uses, just run in reverse (team → members →
 * accounts, filtered to the manager role) rather than account → employee.
 */
export async function teamManagerEmails(teamId: string | null): Promise<string[]> {
  if (!teamId) return [];

  const identity = employeeIdentitySubquery();
  const rows = await db
    .select({ email: user.email })
    .from(user)
    .innerJoin(identity, sql`${identity.workEmailLower} = lower(${user.email})`)
    .where(and(eq(identity.teamId, teamId), eq(user.roleId, "manager"), eq(user.status, "active")));

  return Array.from(new Set(rows.map((row) => row.email)));
}

/** `team.unitManagerUserId` / `team.departmentHeadUserId` resolved to an email, if that user is still active. */
export async function teamApproverEmail(
  teamId: string | null,
  kind: "unit_manager" | "department_head",
): Promise<string | null> {
  if (!teamId) return null;

  const [row] = await db
    .select({ unitManagerUserId: team.unitManagerUserId, departmentHeadUserId: team.departmentHeadUserId })
    .from(team)
    .where(eq(team.id, teamId))
    .limit(1);

  const userId = kind === "unit_manager" ? row?.unitManagerUserId : row?.departmentHeadUserId;
  if (!userId) return null;

  const [approver] = await db.select({ email: user.email, status: user.status }).from(user).where(eq(user.id, userId)).limit(1);
  return approver && approver.status === "active" ? approver.email : null;
}

/** A TA Request's team, if it has one — requests aren't required to carry a team. */
export async function taRequestTeamId(requestId: string): Promise<string | null> {
  const [row] = await db.select({ teamId: taRequest.teamId }).from(taRequest).where(eq(taRequest.id, requestId)).limit(1);
  return row?.teamId ?? null;
}

/** An Employee Recommendation's team, resolved through the employee it's for. */
export async function recommendationTeamId(recommendationId: string): Promise<string | null> {
  const [rec] = await db
    .select({ employeeId: employeeRecommendation.employeeId })
    .from(employeeRecommendation)
    .where(eq(employeeRecommendation.id, recommendationId))
    .limit(1);
  if (!rec) return null;

  const [emp] = await db.select({ teamId: employee.teamId }).from(employee).where(eq(employee.id, rec.employeeId)).limit(1);
  return emp?.teamId ?? null;
}

/** Dedupes and drops empty strings — every notification function merges 2+ recipient sources through this before sending. */
export function mergeRecipients(...groups: (string | string[] | null)[]): string[] {
  const emails = groups.flatMap((group) => (Array.isArray(group) ? group : group ? [group] : []));
  return Array.from(new Set(emails));
}
