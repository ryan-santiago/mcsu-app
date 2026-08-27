import "server-only";

/**
 * Whether outbound email is actually wired up. False until the
 * MS_GRAPH_* env vars below are set — see docs/EMPLOYEE_RECOMMENDATION.md
 * §13 "Email notifications" for the Entra ID app registration this needs
 * (Microsoft Graph, `Mail.Send` application permission) and the IT ask.
 * Same shape as `isDocumentStorageAvailable()` in `document-storage.ts`:
 * one guard, checked once, everything downstream degrades quietly instead
 * of half-working.
 */
export function isEmailAvailable(): boolean {
  return Boolean(
    process.env.MS_GRAPH_CLIENT_ID &&
      process.env.MS_GRAPH_TENANT_ID &&
      process.env.MS_GRAPH_CLIENT_SECRET &&
      process.env.MS_GRAPH_SENDER_EMAIL,
  );
}

type SendEmailInput = {
  to: readonly string[];
  subject: string;
  html: string;
};

/**
 * Redirects every outbound email to one address instead of its real
 * recipients — set while developing/testing against real accounts so
 * approval/rejection emails don't land in coworkers' real inboxes before
 * this is actually ready to go live. The real recipients are preserved in
 * the subject and a banner in the body, so nothing about who it was
 * "really" for gets lost. Unset in any environment where email should
 * reach its real recipients.
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
 *
 * TODO(once MS_GRAPH_* is configured): acquire an app-only token via the
 * client-credentials flow against
 * `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`
 * (scope `https://graph.microsoft.com/.default`), then POST to
 * `https://graph.microsoft.com/v1.0/users/{MS_GRAPH_SENDER_EMAIL}/sendMail`.
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
    // Real Microsoft Graph call goes here once credentials exist.
    console.warn("[email] MS_GRAPH_* is set but sendEmail() isn't implemented yet:", {
      to: finalTo,
      subject: finalSubject,
      htmlLength: finalHtml.length,
    });
    return false;
  } catch (error) {
    console.error("[email] send failed", error);
    return false;
  }
}
