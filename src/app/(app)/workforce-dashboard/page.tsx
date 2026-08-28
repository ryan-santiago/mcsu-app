import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { Metadata } from "next";

import { WorkforceDashboardView } from "@/components/workforce-dashboard/workforce-dashboard-view";
import { resolveDateRangePreset } from "@/lib/date-range-presets";
import { requirePermissionAny } from "@/lib/session";
import { getWorkforceDashboardData } from "@/server/workforce-dashboard/queries";
import { workforceDashboardQueryKey } from "@/server/workforce-dashboard/query-key";

export const metadata: Metadata = {
  title: "Workforce Dashboard",
};

/**
 * Gated on any one of the three Workforce modules' `:read` permissions —
 * the page itself always renders, but each section inside
 * `WorkforceDashboardView` independently checks its own permission (see
 * `getWorkforceDashboardData`) and simply omits itself if the viewer can't
 * see it, same pattern `/admin/approvals` uses for its two sections.
 */
export default async function WorkforceDashboardPage() {
  await requirePermissionAny(["employees:read", "projects:read", "employee_recommendations:read"]);

  const queryClient = new QueryClient();
  await queryClient.prefetchQuery({
    queryKey: workforceDashboardQueryKey("current_month"),
    queryFn: () => getWorkforceDashboardData(resolveDateRangePreset("current_month")),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <WorkforceDashboardView />
    </HydrationBoundary>
  );
}
