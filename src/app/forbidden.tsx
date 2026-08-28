import { ShieldAlert } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/** Rendered by `forbidden()` — the user is signed in but lacks the permission. */
export default function Forbidden() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 px-6 text-center">
      <span className="bg-destructive/10 text-destructive flex size-14 items-center justify-center rounded-full">
        <ShieldAlert className="size-7" aria-hidden />
      </span>

      <div className="max-w-md space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">You don&apos;t have access</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Your role doesn&apos;t include permission for this page. If you need it,
          ask an MCSU administrator to review your access.
        </p>
      </div>

      <Button asChild>
        <Link href="/announcements">Back to Announcements</Link>
      </Button>
    </div>
  );
}
