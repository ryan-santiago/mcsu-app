import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { role as roleTable, user } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { can, type Permission } from "@/lib/rbac";

/**
 * Email notifications for the TA pipeline's stage handoffs — L1 pass →
 * L2 reviewers, L2/Client Interview pass → L3 assessors, L3 pass → Final
 * Interview reviewers, Migrate → Team Lead/Manager and higher. Same shape as
 * `employee-recommendations/notifications.ts`, duplicated locally rather
 * than cross-imported (this module already duplicates other small pieces
 * independently of other modules). Callers `await` these, but `sendEmail()`
 * itself never throws, so a broken/unconfigured mail provider never fails
 * the underlying pipeline action.
 */

function taRequestUrl(requestId: string): string {
  const base = process.env.BETTER_AUTH_URL ?? "";
  return `${base}/talent-acquisition/${requestId}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wrapHtml(bodyHtml: string): string {
  return `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #1a1a1a;">${bodyHtml}<p style="color:#6b7280; font-size:12px; margin-top:24px;">MCSU Console — Talent Acquisition</p></div>`;
}

/** Every active user whose role holds any of `permissions` — same join/filter pattern as `employee-recommendations/notifications.ts`'s `emailsOfPermissionHolders`, widened to an OR-list for "Team Lead/Manager and higher" (the union of two permissions). */
async function emailsOfPermissionHolders(permissions: Permission | Permission[]): Promise<string[]> {
  const permissionList = Array.isArray(permissions) ? permissions : [permissions];

  const rows = await db
    .select({ id: user.id, email: user.email, status: user.status, roleId: user.roleId, permissions: roleTable.permissions })
    .from(user)
    .innerJoin(roleTable, eq(roleTable.id, user.roleId));

  const emails = rows
    .filter((row) =>
      permissionList.some((permission) =>
        can(
          { id: row.id, status: row.status, roleId: row.roleId, rank: 0, permissions: (row.permissions ?? []) as Permission[] },
          permission,
        ),
      ),
    )
    .map((row) => row.email);

  return Array.from(new Set(emails));
}

/** Step 3: L1 Assessment passes → notify whoever holds `l2_assess` (Team Lead/Manager tier) that this candidate needs L2. */
export async function notifyL2ReviewersNeeded(params: { requestId: string; candidateName: string }): Promise<void> {
  const emails = await emailsOfPermissionHolders("talent_acquisition:l2_assess");
  if (emails.length === 0) return;

  await sendEmail({
    to: emails,
    subject: `L2 Assessment needed — ${params.candidateName}`,
    html: wrapHtml(
      `<p><strong>${escapeHtml(params.candidateName)}</strong> passed L1 Assessment and is ready for L2 Assessment.</p>` +
        `<p><a href="${taRequestUrl(params.requestId)}">Open in MCSU Console</a></p>`,
    ),
  });
}

/** Steps 6: L2 Assessment (or L2 + Client Interview) passes → notify whoever holds `l3_assess` (TA Staff/Manager tier). */
export async function notifyL3AssessorsNeeded(params: { requestId: string; candidateName: string }): Promise<void> {
  const emails = await emailsOfPermissionHolders("talent_acquisition:l3_assess");
  if (emails.length === 0) return;

  await sendEmail({
    to: emails,
    subject: `L3 Interview & Assessment needed — ${params.candidateName}`,
    html: wrapHtml(
      `<p><strong>${escapeHtml(params.candidateName)}</strong> is ready for L3 Interview & Assessment.</p>` +
        `<p><a href="${taRequestUrl(params.requestId)}">Open in MCSU Console</a></p>`,
    ),
  });
}

/** Step 8: L3 Assessment passes → notify whoever holds `finalize` (Unit Manager tier). */
export async function notifyFinalInterviewersNeeded(params: { requestId: string; candidateName: string }): Promise<void> {
  const emails = await emailsOfPermissionHolders("talent_acquisition:finalize");
  if (emails.length === 0) return;

  await sendEmail({
    to: emails,
    subject: `Final Interview needed — ${params.candidateName}`,
    html: wrapHtml(
      `<p><strong>${escapeHtml(params.candidateName)}</strong> is ready for Final Interview.</p>` +
        `<p><a href="${taRequestUrl(params.requestId)}">Open in MCSU Console</a></p>`,
    ),
  });
}

/** Step 11: a candidate is migrated to Employee → notify "Team Lead/Manager and higher" — the union of `l2_assess` (Team Lead/Manager) and `finalize` (Unit Manager/Dept Head/Admin) holders. */
export async function notifyMigrationCompleted(params: { requestId: string; employeeName: string }): Promise<void> {
  const emails = await emailsOfPermissionHolders(["talent_acquisition:l2_assess", "talent_acquisition:finalize"]);
  if (emails.length === 0) return;

  await sendEmail({
    to: emails,
    subject: `Migrated to Employee — ${params.employeeName}`,
    html: wrapHtml(
      `<p><strong>${escapeHtml(params.employeeName)}</strong> has been migrated to the Employee module.</p>` +
        `<p><a href="${taRequestUrl(params.requestId)}">Open in MCSU Console</a></p>`,
    ),
  });
}
