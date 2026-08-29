import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { EngagementDashboardView } from "@/components/engagement-dashboard/engagement-dashboard-view";
import { resolveDateRangePreset } from "@/lib/date-range-presets";
import { can } from "@/lib/rbac";
import { requireUser } from "@/lib/session";
import { getEngagementDashboardData } from "@/server/engagement-dashboard/queries";
import { engagementDashboardQueryKey } from "@/server/engagement-dashboard/query-key";
import { listVisibleOneLotProjects } from "@/server/one-lot-projects/queries";

export const metadata: Metadata = {
  title: "Engagement Dashboard",
};

/**
 * Gated on `staff_augmentation:read`, `one_lot_projects:read`, or just being
 * a member of at least one One-Lot project — the same "is this module
 * reachable at all" bar `/one-lot-projects` itself and `getEngagementNavData`
 * use, since One-Lot Project visibility isn't a plain permission (see
 * `listVisibleOneLotProjects`'s doc comment). Each section inside
 * `EngagementDashboardView` independently re-checks its own access and
 * simply omits itself if the viewer can't see it.
 */
export default async function EngagementDashboardPage() {
  const actor = await requireUser();
  const visibleProjects = await listVisibleOneLotProjects(actor);
  const hasAccess =
    can(actor, "staff_augmentation:read") || can(actor, "one_lot_projects:read") || visibleProjects.length > 0;
  if (!hasAccess) forbidden();

  const queryClient = new QueryClient();
  await queryClient.prefetchQuery({
    queryKey: engagementDashboardQueryKey("current_month"),
    queryFn: () => getEngagementDashboardData(resolveDateRangePreset("current_month")),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <EngagementDashboardView />
    </HydrationBoundary>
  );
}
