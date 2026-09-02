import "server-only";

import { sendEmail } from "@/lib/email";
import { buildEmailSubject, ctaBlock, escapeHtml, logoAttachment, renderBrandedEmail } from "@/lib/email-template";

/** The reset-link email — see `src/lib/email-template.ts` for the shared branded shell every outbound email uses. */
export async function sendPasswordResetEmail(user: { email: string; name: string }, url: string): Promise<void> {
  const firstName = escapeHtml(user.name.split(" ")[0] || user.name);

  const html = renderBrandedEmail({
    heading: "Reset your password",
    module: "User Account",
    bodyHtml: `
        <p style="margin:0 0 16px; font-size:14px; line-height:1.6; color:#3A3D57;">
          Hi ${firstName}, someone requested a password reset for your MCSU Console account. If this was you, choose a new password using the button below.
        </p>
        ${ctaBlock(url, "Reset password")}
        <p style="margin:16px 0 0; font-size:13px; line-height:1.6; color:#5B5F7B;">
          This link expires in one hour. If you didn't request this, you can safely ignore this email — your password won't change.
        </p>`,
  });

  await sendEmail({
    to: [user.email],
    subject: buildEmailSubject("User Account", "Reset Password"),
    html,
    attachments: await logoAttachment(),
  });
}
