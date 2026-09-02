import "server-only";

import { sendEmail } from "@/lib/email";
import { buildEmailSubject, ctaBlock, escapeHtml, logoAttachment, renderBrandedEmail } from "@/lib/email-template";
import {
  emailsOfRole,
  mergeRecipients,
  taRequestTeamId,
  teamApproverEmail,
  teamManagerEmails,
} from "@/server/shared/notification-recipients";

/**
 * Email notifications for the TA pipeline's stage handoffs — L1 pass →
 * the requesting team's manager, L2 pass → TA Manager + team manager, L3
 * pass → Unit Manager + team manager, Migrate → the whole chain (team
 * manager, Unit Manager, Department Head, Admin). Callers `await` these,
 * but `sendEmail()` itself never throws, so a broken/unconfigured mail
 * provider never fails the underlying pipeline action.
 */

const MODULE_LABEL = "Talent Acquisition";

function taRequestUrl(requestId: string): string {
  const base = process.env.BETTER_AUTH_URL ?? "";
  return `${base}/talent-acquisition/${requestId}`;
}

/** Step 3: L1 Assessment passes → notify the requesting team's manager that this candidate needs L2. */
export async function notifyL2ReviewersNeeded(params: { requestId: string; candidateName: string }): Promise<void> {
  const teamId = await taRequestTeamId(params.requestId);
  const emails = mergeRecipients(await teamManagerEmails(teamId));
  if (emails.length === 0) return;

  const url = taRequestUrl(params.requestId);
  await sendEmail({
    to: emails,
    subject: buildEmailSubject(MODULE_LABEL, "L2 Assessment"),
    html: renderBrandedEmail({
      heading: "Ready for L2 Assessment",
      module: MODULE_LABEL,
      bodyHtml: `
        <p style="margin:0 0 16px; font-size:14px; line-height:1.6; color:#3A3D57;">
          <strong>${escapeHtml(params.candidateName)}</strong> passed L1 Assessment and is ready for L2 Assessment.
        </p>
        ${ctaBlock(url, "Review in MCSU Console")}`,
    }),
    attachments: await logoAttachment(),
  });
}

/** Steps 6: L2 Assessment (or L2 + Client Interview) passes → notify the TA Manager and the requesting team's manager. */
export async function notifyL3AssessorsNeeded(params: { requestId: string; candidateName: string }): Promise<void> {
  const teamId = await taRequestTeamId(params.requestId);
  const [taManagers, teamManagers] = await Promise.all([emailsOfRole("talent_acquisition_manager"), teamManagerEmails(teamId)]);
  const emails = mergeRecipients(taManagers, teamManagers);
  if (emails.length === 0) return;

  const url = taRequestUrl(params.requestId);
  await sendEmail({
    to: emails,
    subject: buildEmailSubject(MODULE_LABEL, "L3 Assessment"),
    html: renderBrandedEmail({
      heading: "Ready for L3 Interview & Assessment",
      module: MODULE_LABEL,
      bodyHtml: `
        <p style="margin:0 0 16px; font-size:14px; line-height:1.6; color:#3A3D57;">
          <strong>${escapeHtml(params.candidateName)}</strong> is ready for L3 Interview & Assessment.
        </p>
        ${ctaBlock(url, "Review in MCSU Console")}`,
    }),
    attachments: await logoAttachment(),
  });
}

/** Step 8: L3 Assessment passes → notify the requesting team's Unit Manager and the team manager. */
export async function notifyFinalInterviewersNeeded(params: { requestId: string; candidateName: string }): Promise<void> {
  const teamId = await taRequestTeamId(params.requestId);
  const [unitManager, teamManagers] = await Promise.all([
    teamApproverEmail(teamId, "unit_manager"),
    teamManagerEmails(teamId),
  ]);
  const emails = mergeRecipients(unitManager, teamManagers);
  if (emails.length === 0) return;

  const url = taRequestUrl(params.requestId);
  await sendEmail({
    to: emails,
    subject: buildEmailSubject(MODULE_LABEL, "Final Interview"),
    html: renderBrandedEmail({
      heading: "Ready for Final Interview",
      module: MODULE_LABEL,
      bodyHtml: `
        <p style="margin:0 0 16px; font-size:14px; line-height:1.6; color:#3A3D57;">
          <strong>${escapeHtml(params.candidateName)}</strong> is ready for Final Interview.
        </p>
        ${ctaBlock(url, "Review in MCSU Console")}`,
    }),
    attachments: await logoAttachment(),
  });
}

/** Step 11: a candidate is migrated to Employee → notify the whole chain (team manager, Unit Manager, Department Head, Admin). */
export async function notifyMigrationCompleted(params: { requestId: string; employeeName: string }): Promise<void> {
  const teamId = await taRequestTeamId(params.requestId);
  const [teamManagers, unitManager, departmentHead, admins] = await Promise.all([
    teamManagerEmails(teamId),
    teamApproverEmail(teamId, "unit_manager"),
    teamApproverEmail(teamId, "department_head"),
    emailsOfRole("admin"),
  ]);
  const emails = mergeRecipients(teamManagers, unitManager, departmentHead, admins);
  if (emails.length === 0) return;

  const url = taRequestUrl(params.requestId);
  await sendEmail({
    to: emails,
    subject: buildEmailSubject(MODULE_LABEL, "Migrated to Employee"),
    html: renderBrandedEmail({
      heading: "Migrated to Employee",
      module: MODULE_LABEL,
      bodyHtml: `
        <p style="margin:0 0 16px; font-size:14px; line-height:1.6; color:#3A3D57;">
          <strong>${escapeHtml(params.employeeName)}</strong> has been migrated to the Employee module.
        </p>
        ${ctaBlock(url, "Open in MCSU Console")}`,
    }),
    attachments: await logoAttachment(),
  });
}
