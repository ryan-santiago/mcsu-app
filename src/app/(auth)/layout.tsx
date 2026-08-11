import { ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";

import { Logo } from "@/components/brand/logo";
import { getCurrentUser } from "@/lib/session";

/**
 * The split-panel auth shell: brand on the left, the form on the right.
 *
 * The brand panel is decorative, so it collapses away entirely below `lg` and a
 * compact logo header takes its place — on a phone the form should own the
 * viewport rather than fight a hero image for it.
 */
export default async function AuthLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();

  // Someone with a live session has no business on the login screen.
  if (user && user.status === "active") redirect("/dashboard");

  return (
    <div className="grid min-h-svh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* ---------------------------------------------------------------- */}
      {/* Brand panel                                                       */}
      {/* ---------------------------------------------------------------- */}
      <aside className="brand-panel relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="brand-grid pointer-events-none absolute inset-0" aria-hidden />

        <div className="relative">
          <span className="text-[0.7rem] font-medium tracking-[0.28em] text-white/55 uppercase">
            Questronix Corporation
          </span>
        </div>

        <div className="relative flex flex-col items-start gap-8">
          <Logo variant="white" height={64} priority className="max-w-full" />

          <div className="max-w-md space-y-4">
            <h1 className="text-3xl leading-tight font-semibold tracking-tight text-balance text-white">
              Managed Cloud Services Unit
            </h1>
            <p className="text-base leading-relaxed text-pretty text-white/70">
              One console for the people, access and services the MCSU team runs
              day to day.
            </p>
          </div>
        </div>

        <div className="relative flex items-center gap-2.5 text-sm text-white/55">
          <ShieldCheck className="size-4 shrink-0" aria-hidden />
          <span>Internal system — access is granted by an MCSU administrator.</span>
        </div>
      </aside>

      {/* ---------------------------------------------------------------- */}
      {/* Form panel                                                        */}
      {/* ---------------------------------------------------------------- */}
      <main className="bg-background flex flex-col">
        <div className="flex justify-center border-b px-6 py-5 lg:hidden">
          <Logo height={34} priority />
        </div>

        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-[26rem]">{children}</div>
        </div>

        <footer className="text-muted-foreground px-6 pb-8 text-center text-xs sm:px-10">
          <p>
            QSERV-MCSU · QNX Services · © {new Date().getFullYear()} Questronix
            Corporation
          </p>
        </footer>
      </main>
    </div>
  );
}
