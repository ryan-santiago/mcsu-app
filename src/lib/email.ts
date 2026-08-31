import "server-only";

import { graphFetch, isGraphConfigured } from "@/lib/graph-client";

/**
 * Whether outbound email is actually wired up — `isGraphConfigured()` plus
 * the sender mailbox. See docs/EMPLOYEE_RECOMMENDATION.md §13 for the Entra
 * ID app registration this needs (Microsoft Graph, `Mail.Send` application
 * permission, restricted via an Exchange Application Access Policy to only
 * `MS_SENDER_EMAIL`). Same shape as `isDocumentStorageAvailable()` in
 * `document-storage.ts`: one guard, checked once, everything downstream
 * degrades quietly instead of half-working.
 */
export function isEmailAvailable(): boolean {
  return isGraphConfigured() && Boolean(process.env.MS_SENDER_EMAIL);
}

type SendEmailInput = {
  to: readonly string[];
  subject: string;
  html: string;
};

/**
 * Redirects every outbound email to one address instead of its real
 * recipients — set in every non-production environment so that real
 * employee emails (used to simulate the actual workflow) don't land in
 * coworkers' inboxes before this is actually ready to go live. The real
 * recipients are preserved in the subject and a banner in the body, so
 * nothing about who it was "really" for gets lost. Unset ONLY in production.
 */
function overrideRecipient(): string | undefined {
  return process.env.EMAIL_OVERRIDE_TO || undefined;
}

/**
 * Sends one email via Microsoft Graph (`/users/{sender}/sendMail`, app-only
 * auth) once `isEmailAvailable()` is true. Until then, this is a deliberate
 * no-op — logs what would have been sent and returns `false` — so every
 * call site can fire this off without `await`ing failure paths or ever
 * risking the underlying action (submit, approve, reject...) on email
 * delivery. Never throws, by design: a broken notification must not break
 * the recommendation it's about.
 */
export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<boolean> {
  if (to.length === 0) return true;

  const override = overrideRecipient();
  const finalTo = override ? [override] : [...to];
  const finalSubject = override ? `[Dev — originally to: ${to.join(", ")}] ${subject}` : subject;
  const finalHtml = override
    ? `<p style="background:#fef3c7;border:1px solid #f59e0b;padding:8px 12px;border-radius:6px;font-size:12px;">Development redirect — this would have gone to: <strong>${to.join(", ")}</strong></p>${html}`
    : html;

  if (!isEmailAvailable()) {
    console.warn("[email] not configured (see docs/EMPLOYEE_RECOMMENDATION.md §13) — would have sent:", {
      to: finalTo,
      subject: finalSubject,
      htmlLength: finalHtml.length,
    });
    return false;
  }

  try {
    const sender = process.env.MS_SENDER_EMAIL!;
    const response = await graphFetch(`/users/${encodeURIComponent(sender)}/sendMail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: finalSubject,
          body: { contentType: "HTML", content: finalHtml },
          toRecipients: finalTo.map((address) => ({ emailAddress: { address } })),
        },
        saveToSentItems: false,
      }),
    });

    if (!response.ok) {
      console.error("[email] Graph sendMail failed", { status: response.status, body: await response.text() });
      return false;
    }
    return true;
  } catch (error) {
    console.error("[email] send failed", error);
    return false;
  }
}
