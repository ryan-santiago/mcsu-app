"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";

/**
 * Top-level error boundary. Next.js strips the real message in production and
 * replaces it with a digest, so we show a generic explanation plus that digest —
 * enough for someone to quote it when reporting the problem.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[mcsu] unhandled error", error);
  }, [error]);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 px-6 text-center">
      <span className="bg-destructive/10 text-destructive flex size-14 items-center justify-center rounded-full">
        <AlertTriangle className="size-7" aria-hidden />
      </span>

      <div className="max-w-md space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          An unexpected error stopped this page from loading. Trying again often
          clears it.
        </p>
        {error.digest ? (
          <p className="text-muted-foreground font-mono text-xs">Reference: {error.digest}</p>
        ) : null}
      </div>

      <Button onClick={reset}>
        <RotateCcw className="size-4" aria-hidden />
        Try again
      </Button>
    </div>
  );
}
