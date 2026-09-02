import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The one branded shell every outbound email uses — navy header with the
 * logo, a white content card, a brand-blue button (never orange — see
 * docs/DESIGN.md's "orange rule"), and `color-scheme`/`supported-color-schemes`
 * meta tags so a mail client in dark mode doesn't auto-invert the card.
 * Built with inline-styled tables rather than flexbox/grid, since Outlook's
 * desktop renderer (Word, not a browser engine) ignores most modern CSS.
 *
 * Previously duplicated per-module (auth, Talent Acquisition, Employee
 * Recommendation each had their own bare `<div>` wrapper); pulled into one
 * place once a third caller needed the exact same navy-header-plus-logo
 * treatment the password-reset email introduced — not worth three drifting
 * copies of the same markup.
 */

const LOGO_CONTENT_ID = "mcsu-logo";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The logo as an inline `cid:` attachment rather than an `<img src>` — a
 * recipient's mail client fetches image URLs from its own servers, which
 * can't reach `localhost` in dev and shouldn't have to reach this app's
 * domain at all for something this small. Never throws — a missing/unreadable
 * logo file degrades to an email with a broken image, not a failed send.
 */
export async function logoAttachment(): Promise<
  { contentId: string; contentType: string; contentBytes: string; name: string; isInline: boolean }[]
> {
  try {
    const filePath = path.join(process.cwd(), "public", "brand", "logo-white.png");
    const contentBytes = await readFile(filePath, "base64");
    return [
      { contentId: LOGO_CONTENT_ID, contentType: "image/png", contentBytes, name: "logo-white.png", isInline: true },
    ];
  } catch (error) {
    console.error("[email] failed to read logo attachment", error);
    return [];
  }
}

/** Every outbound email's subject follows the same shape: `MCSU Console - Notification | <Module> | <Action>`. */
export function buildEmailSubject(module: string, action: string): string {
  return `MCSU Console - Notification | ${module} | ${action}`;
}

/** A brand-blue call-to-action button, plus the plain-link fallback some clients need to render it at all. */
export function ctaBlock(url: string, label: string): string {
  const safeUrl = escapeHtml(url);
  return `
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;">
          <tr>
            <td style="border-radius:8px; background-color:#000FBE;">
              <a href="${safeUrl}" style="display:inline-block; padding:12px 28px; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:8px;">
                ${escapeHtml(label)}
              </a>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 4px; font-size:13px; line-height:1.6; color:#5B5F7B;">
          Or copy this link into your browser:<br />
          <a href="${safeUrl}" style="color:#000FBE; word-break:break-all;">${safeUrl}</a>
        </p>`;
}

/**
 * Wraps `bodyHtml` (already-escaped, caller-built paragraphs — typically
 * ending in a `ctaBlock()`) in the branded shell. `module` labels the footer
 * so a recipient can tell at a glance which part of the console an email
 * came from ("MCSU Console · Questronix Corporation — Talent Acquisition").
 */
export function renderBrandedEmail(params: { heading: string; bodyHtml: string; module?: string }): string {
  const footer = params.module
    ? `MCSU Console · Questronix Corporation — ${escapeHtml(params.module)}`
    : "MCSU Console · Questronix Corporation";

  return `
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
        <h1 style="margin:0 0 16px; font-size:20px; line-height:1.3; color:#0A0D33; font-weight:600;">${escapeHtml(params.heading)}</h1>
        ${params.bodyHtml}
      </td>
    </tr>
    <tr>
      <td style="padding:16px 32px; background-color:#F7F8FC; text-align:center; border-radius:0 0 10px 10px; border-top:1px solid #E2E4EF;">
        <p style="margin:0; font-size:12px; color:#8388A6;">${footer}</p>
      </td>
    </tr>
  </table>
</div>
</body>
</html>`.trim();
}
