import { KeyRound, LifeBuoy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Forgot password",
};

/**
 * Placeholder until an email provider is configured. Self-serve reset needs a
 * transactional sender (Resend et al.) plus BetterAuth's `sendResetPassword`
 * hook — tracked in docs/ROADMAP.md. Until then, an administrator resets the
 * password out of band, and saying so beats a form that silently does nothing.
 */
export default function ForgotPasswordPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <span className="bg-muted text-muted-foreground inline-flex size-12 items-center justify-center rounded-full">
          <KeyRound className="size-6" aria-hidden />
        </span>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Self-service password reset isn&apos;t switched on yet — the console
            has no outbound email configured. Ask an MCSU administrator to reset
            it for you.
          </p>
        </div>
      </header>

      <div className="bg-muted/50 flex gap-3 rounded-lg border p-4">
        <LifeBuoy className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
        <p className="text-muted-foreground text-sm leading-relaxed">
          Administrators can issue a new password from{" "}
          <span className="text-foreground font-medium">
            Administration → User Management
          </span>
          .
        </p>
      </div>

      <Button asChild variant="outline" className="w-full" size="lg">
        <Link href="/login">Back to sign in</Link>
      </Button>
    </div>
  );
}
