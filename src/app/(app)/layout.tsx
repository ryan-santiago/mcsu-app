import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";
import { visibleNavigation } from "@/lib/navigation";
import { requireUser } from "@/lib/session";

/**
 * The authenticated shell.
 *
 * `requireUser()` runs on the server before anything renders, so an
 * unauthenticated or unapproved visitor never receives the page markup at all —
 * the middleware redirect is only there to make that bounce feel instant.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const groups = visibleNavigation(user);

  return (
    <div className="flex min-h-svh">
      <AppSidebar groups={groups} user={user} />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar groups={groups} user={user} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
