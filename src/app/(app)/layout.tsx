import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";
import { visibleNavigation } from "@/lib/navigation";
import { requireUser } from "@/lib/session";
import { getEngagementNavData } from "@/server/engagement/nav";
import { countPendingUserApprovals } from "@/server/notifications/queries";

/**
 * The authenticated shell.
 *
 * `requireUser()` runs on the server before anything renders, so an
 * unauthenticated or unapproved visitor never receives the page markup at all —
 * the middleware redirect is only there to make that bounce feel instant.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const [dynamicNav, pendingUserApprovals] = await Promise.all([
    getEngagementNavData(user),
    countPendingUserApprovals(),
  ]);

  // Only User Management has a live badge source today — see AGENTS.md's
  // note on this feature starting out scoped there. `countPendingUserApprovals()`
  // already returns 0 for anyone without `users:edit`, so no separate guard here.
  const navBadges: Record<string, number> =
    pendingUserApprovals > 0 ? { "/admin/users": pendingUserApprovals } : {};

  // Static permission-based filtering (`visibleNavigation()`) can't see
  // One-Lot Project's membership-based access — no DB access there — so a
  // `dynamicKind` item with nothing in `dynamicNav` (module permission
  // absent *and* not a member of anything) is dropped here instead.
  const groups = visibleNavigation(user)
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.dynamicKind || dynamicNav[item.dynamicKind] !== undefined),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="flex min-h-svh">
      <AppSidebar groups={groups} user={user} dynamicNav={dynamicNav} navBadges={navBadges} />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar groups={groups} user={user} dynamicNav={dynamicNav} navBadges={navBadges} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
