import { CheckCircle2, Clock3, Mail } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Awaiting approval",
};

/**
 * Shown after registration and whenever an unapproved user tries to sign in.
 * Deliberately reachable without a session — pending users never get one.
 */
export default async function PendingPage({ searchParams }: PageProps<"/pending">) {
  const params = await searchParams;
  const justRegistered = params.registered === "1";

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <span
          className={
            justRegistered
              ? "bg-success/10 text-success inline-flex size-12 items-center justify-center rounded-full"
              : "bg-warning/10 text-warning inline-flex size-12 items-center justify-center rounded-full"
          }
        >
          {justRegistered ? (
            <CheckCircle2 className="size-6" aria-hidden />
          ) : (
            <Clock3 className="size-6" aria-hidden />
          )}
        </span>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {justRegistered ? "Account created" : "Awaiting approval"}
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {justRegistered
              ? "Your request has been sent to the MCSU administrators. You'll be able to sign in once someone approves it and assigns your role."
              : "This account has not been approved yet. An MCSU administrator needs to review it before you can sign in."}
          </p>
        </div>
      </header>

      <div className="bg-muted/50 space-y-3 rounded-lg border p-4">
        <h2 className="text-sm font-medium">What happens next</h2>
        <ol className="text-muted-foreground space-y-2.5 text-sm">
          <li className="flex gap-3">
            <span className="bg-background flex size-5 shrink-0 items-center justify-center rounded-full border text-[0.6875rem] font-medium">
              1
            </span>
            An administrator reviews your request in User Management.
          </li>
          <li className="flex gap-3">
            <span className="bg-background flex size-5 shrink-0 items-center justify-center rounded-full border text-[0.6875rem] font-medium">
              2
            </span>
            They approve it and assign the role that matches your work.
          </li>
          <li className="flex gap-3">
            <span className="bg-background flex size-5 shrink-0 items-center justify-center rounded-full border text-[0.6875rem] font-medium">
              3
            </span>
            You sign in with the same email and password.
          </li>
        </ol>
      </div>

      <div className="space-y-3">
        <Button asChild className="w-full" size="lg">
          <Link href="/login">Back to sign in</Link>
        </Button>

        <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs">
          <Mail className="size-3.5" aria-hidden />
          Need it sooner? Contact your MCSU administrator directly.
        </p>
      </div>
    </div>
  );
}
