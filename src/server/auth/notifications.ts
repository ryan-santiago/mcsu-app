import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { sendEmail } from "@/lib/email";

/**
 * The reset-link email. Branded like the auth panel (navy header, brand blue
 * button — never orange, see docs/DESIGN.md's "orange rule") and built with
 * inline-styled tables rather than flexbox/grid, since Outlook's desktop
 * renderer (Word, not a browser engine) ignores most modern CSS.
 *
 * The logo is sent as an inline `cid:` attachment rather than an `<img src>`
 * pointing at `BETTER_AUTH_URL` — a recipient's mail client fetches image
 * URLs from its own servers, which can't reach `localhost` in dev and
 * shouldn't have to reach this app's domain at all for something this small.
 */

const LOGO_CONTENT_ID = "mcsu-logo";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Never throws — a missing/unreadable logo file degrades to an email with a broken image, not a failed reset request. */
async function logoAttachment() {
  try {
    const filePath = path.join(process.cwd(), "public", "brand", "logo-white.png");
    const contentBytes = await readFile(filePath, "base64");
    return [
      {
        contentId: LOGO_CONTENT_ID,
        contentType: "image/png",
        contentBytes,
        name: "logo-white.png",
        isInline: true,
      },
    ];
  } catch (error) {
    console.error("[email] failed to read logo attachment", error);
    return [];
  }
}

export async function sendPasswordResetEmail(user: { email: string; name: string }, url: string): Promise<void> {
  const safeUrl = escapeHtml(url);
  const firstName = escapeHtml(user.name.split(" ")[0] || user.name);

  // `color-scheme`/`supported-color-schemes` opt the message out of Outlook's
  // and Gmail's automatic dark-mode recoloring — without them, a client in
  // dark mode inverts the white card to black instead of leaving brand
  // colours alone. Needs a full `<head>`, so this can't just be a fragment.
  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light only" />
</head>
<body style="margin:0; background-color:#EEF0F7;">
<div style="background-color:#EEF0F7; padding:32px 16px; font-family: Arial, Helvetica, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; margin:0 auto; background-color:#ffffff; border-radius:10px; border:1px solid #E2E4EF;">
    <tr>
      <td style="background-color:#05061F; padding:28px 32px; text-align:center; border-radius:10px 10px 0 0;">
        <img src="cid:${LOGO_CONTENT_ID}" alt="QNX Questronix — QSERV-MCSU" height="32" style="height:32px; width:auto; display:inline-block; border:0;" />
      </td>
    </tr>
    <tr>
      <td style="padding:32px 32px 8px; background-color:#ffffff;">
        <h1 style="margin:0 0 16px; font-size:20px; line-height:1.3; color:#0A0D33; font-weight:600;">Reset your password</h1>
        <p style="margin:0 0 16px; font-size:14px; line-height:1.6; color:#3A3D57;">
          Hi ${firstName}, someone requested a password reset for your MCSU Console account. If this was you, choose a new password using the button below.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;">
          <tr>
            <td style="border-radius:8px; background-color:#000FBE;">
              <a href="${safeUrl}" style="display:inline-block; padding:12px 28px; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:8px;">
                Reset password
              </a>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 16px; font-size:13px; line-height:1.6; color:#5B5F7B;">
          Or copy this link into your browser:<br />
          <a href="${safeUrl}" style="color:#000FBE; word-break:break-all;">${safeUrl}</a>
        </p>
        <p style="margin:0 0 24px; font-size:13px; line-height:1.6; color:#5B5F7B;">
          This link expires in one hour. If you didn't request this, you can safely ignore this email — your password won't change.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 32px; background-color:#F7F8FC; text-align:center; border-radius:0 0 10px 10px; border-top:1px solid #E2E4EF;">
        <p style="margin:0; font-size:12px; color:#8388A6;">MCSU Console · Questronix Corporation</p>
      </td>
    </tr>
  </table>
</div>
</body>
</html>`.trim();

  await sendEmail({
    to: [user.email],
    subject: "Reset your MCSU Console password",
    html,
    attachments: await logoAttachment(),
  });
}
