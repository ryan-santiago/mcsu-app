import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { role as roleTable, user } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { can, type Permission } from "@/lib/rbac";

/**
 * Email notifications for the recommendation lifecycle — submit, approve,
 * reject. Callers `await` these (a serverless function can't safely leave
 * work running after it returns), but `sendEmail()` itself never throws, so
 * a broken or unconfigured mail provider can never fail the underlying
 * business action — only delay its response by however long the lookup
 * takes. See docs/EMPLOYEE_RECOMMENDATION.md §13 for the Microsoft Graph
 * credentials this needs before any of it actually sends anything.
 */

function recommendationUrl(recommendationId: string): string {
  const base = process.env.BETTER_AUTH_URL ?? "";
  return `${base}/employee-recommendations/${recommendationId}`;
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
  return `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #1a1a1a;">${bodyHtml}<p style="color:#6b7280; font-size:12px; margin-top:24px;">MCSU Console — Employee Recommendation</p></div>`;
}

async function emailOfActiveUser(userId: string): Promise<string | null> {
  const [row] = await db.select({ email: user.email, status: user.status }).from(user).where(eq(user.id, userId)).limit(1);
  return row && row.status === "active" ? row.email : null;
}

/** Every active user whose role holds `permission` — same join/filter pattern as `listRecommendationApproverOptions` in `server/maintenance/queries.ts`. */
async function emailsOfPermissionHolders(permission: Permission): Promise<string[]> {
  const rows = await db
    .select({ id: user.id, email: user.email, status: user.status, roleId: user.roleId, permissions: roleTable.permissions })
    .from(user)
    .innerJoin(roleTable, eq(roleTable.id, user.roleId));

  return rows
    .filter((row) =>
      can(
        { id: row.id, status: row.status, roleId: row.roleId, rank: 0, permissions: (row.permissions ?? []) as Permission[] },
        permission,
      ),
    )
    .map((row) => row.email);
}

/** Sent when a recommendation is submitted (first step) or moves to the next step after an approval. */
export async function notifyApproverAssigned(params: {
  approverUserId: string;
  recommendationId: string;
  employeeName: string;
  roleLabel: string;
}): Promise<void> {
  const email = await emailOfActiveUser(params.approverUserId);
  if (!email) return;

  await sendEmail({
    to: [email],
    subject: `Recommendation needs your approval — ${params.employeeName}`,
    html: wrapHtml(
      `<p>A recommendation for <strong>${escapeHtml(params.employeeName)}</strong> needs your approval as ${escapeHtml(params.roleLabel)}.</p>` +
        `<p><a href="${recommendationUrl(params.recommendationId)}">Open in MCSU Console</a></p>`,
    ),
  });
}

/** Sent to every Talent Acquisition Manager (whoever holds `generate_erf`) once a recommendation clears its final approval step. */
export async function notifyErfHandlersOfApproval(params: { recommendationId: string; employeeName: string }): Promise<void> {
  const emails = await emailsOfPermissionHolders("employee_recommendations:generate_erf");
  if (emails.length === 0) return;

  await sendEmail({
    to: emails,
    subject: `Recommendation fully approved — ${params.employeeName}`,
    html: wrapHtml(
      `<p><strong>${escapeHtml(params.employeeName)}</strong>'s recommendation is fully approved and ready for the ERF to be generated.</p>` +
        `<p><a href="${recommendationUrl(params.recommendationId)}">Open in MCSU Console</a></p>`,
    ),
  });
}

/** Sent to whoever submitted the recommendation when an approver rejects it. */
export async function notifySubmitterOfRejection(params: {
  submitterUserId: string | null;
  recommendationId: string;
  employeeName: string;
  note: string | null;
}): Promise<void> {
  if (!params.submitterUserId) return;
  const email = await emailOfActiveUser(params.submitterUserId);
  if (!email) return;

  await sendEmail({
    to: [email],
    subject: `Recommendation rejected — ${params.employeeName}`,
    html: wrapHtml(
      `<p>Your recommendation for <strong>${escapeHtml(params.employeeName)}</strong> was rejected.</p>` +
        (params.note ? `<p>Note: ${escapeHtml(params.note)}</p>` : "") +
        `<p><a href="${recommendationUrl(params.recommendationId)}">Open in MCSU Console</a></p>`,
    ),
  });
}
