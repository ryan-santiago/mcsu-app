import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { buildEmailSubject, ctaBlock, escapeHtml, logoAttachment, renderBrandedEmail } from "@/lib/email-template";
import { emailsOfRole, mergeRecipients, recommendationTeamId, teamManagerEmails } from "@/server/shared/notification-recipients";

/**
 * Email notifications for the recommendation lifecycle — submit, approve,
 * reject. Every step also copies the requesting employee's team manager,
 * alongside whichever specific approver or role the step is actually gated
 * on. Callers `await` these (a serverless function can't safely leave work
 * running after it returns), but `sendEmail()` itself never throws, so a
 * broken or unconfigured mail provider can never fail the underlying
 * business action — only delay its response by however long the lookup
 * takes. See docs/EMPLOYEE_RECOMMENDATION.md §13 for the Microsoft Graph
 * credentials this needs before any of it actually sends anything.
 */

const MODULE_LABEL = "Employee Recommendation";

function recommendationUrl(recommendationId: string): string {
  const base = process.env.BETTER_AUTH_URL ?? "";
  return `${base}/employee-recommendations/${recommendationId}`;
}

async function emailOfActiveUser(userId: string): Promise<string | null> {
  const [row] = await db.select({ email: user.email, status: user.status }).from(user).where(eq(user.id, userId)).limit(1);
  return row && row.status === "active" ? row.email : null;
}

/** Sent when a recommendation is submitted (first step) or moves to the next step after an approval — to the assigned approver plus the requesting employee's team manager. */
export async function notifyApproverAssigned(params: {
  approverUserId: string;
  recommendationId: string;
  employeeName: string;
  roleLabel: string;
}): Promise<void> {
  const [approverEmail, teamId] = await Promise.all([
    emailOfActiveUser(params.approverUserId),
    recommendationTeamId(params.recommendationId),
  ]);
  const emails = mergeRecipients(approverEmail, await teamManagerEmails(teamId));
  if (emails.length === 0) return;

  const url = recommendationUrl(params.recommendationId);
  await sendEmail({
    to: emails,
    subject: buildEmailSubject(MODULE_LABEL, "For Approval"),
    html: renderBrandedEmail({
      heading: "Approval needed",
      module: MODULE_LABEL,
      bodyHtml: `
        <p style="margin:0 0 16px; font-size:14px; line-height:1.6; color:#3A3D57;">
          A recommendation for <strong>${escapeHtml(params.employeeName)}</strong> needs your approval as ${escapeHtml(params.roleLabel)}.
        </p>
        ${ctaBlock(url, "Review in MCSU Console")}`,
    }),
    attachments: await logoAttachment(),
  });
}

/** Sent to the TA Manager and the requesting employee's team manager once a recommendation clears its final approval step. */
export async function notifyErfHandlersOfApproval(params: { recommendationId: string; employeeName: string }): Promise<void> {
  const teamId = await recommendationTeamId(params.recommendationId);
  const [taManagers, teamManagers] = await Promise.all([emailsOfRole("talent_acquisition_manager"), teamManagerEmails(teamId)]);
  const emails = mergeRecipients(taManagers, teamManagers);
  if (emails.length === 0) return;

  const url = recommendationUrl(params.recommendationId);
  await sendEmail({
    to: emails,
    subject: buildEmailSubject(MODULE_LABEL, "Fully Approved"),
    html: renderBrandedEmail({
      heading: "Fully approved — ready for ERF",
      module: MODULE_LABEL,
      bodyHtml: `
        <p style="margin:0 0 16px; font-size:14px; line-height:1.6; color:#3A3D57;">
          <strong>${escapeHtml(params.employeeName)}</strong>'s recommendation is fully approved and ready for the ERF to be generated.
        </p>
        ${ctaBlock(url, "Open in MCSU Console")}`,
    }),
    attachments: await logoAttachment(),
  });
}

/** Sent to the TA Manager and the requesting employee's team manager when an approver rejects the recommendation. */
export async function notifySubmitterOfRejection(params: {
  recommendationId: string;
  employeeName: string;
  note: string | null;
}): Promise<void> {
  const teamId = await recommendationTeamId(params.recommendationId);
  const [taManagers, teamManagers] = await Promise.all([emailsOfRole("talent_acquisition_manager"), teamManagerEmails(teamId)]);
  const emails = mergeRecipients(taManagers, teamManagers);
  if (emails.length === 0) return;

  const url = recommendationUrl(params.recommendationId);
  await sendEmail({
    to: emails,
    subject: buildEmailSubject(MODULE_LABEL, "Rejected"),
    html: renderBrandedEmail({
      heading: "Recommendation rejected",
      module: MODULE_LABEL,
      bodyHtml: `
        <p style="margin:0 0 16px; font-size:14px; line-height:1.6; color:#3A3D57;">
          The recommendation for <strong>${escapeHtml(params.employeeName)}</strong> was rejected.
        </p>
        ${params.note ? `<p style="margin:0 0 16px; font-size:14px; line-height:1.6; color:#3A3D57;">Note: ${escapeHtml(params.note)}</p>` : ""}
        ${ctaBlock(url, "Open in MCSU Console")}`,
    }),
    attachments: await logoAttachment(),
  });
}
