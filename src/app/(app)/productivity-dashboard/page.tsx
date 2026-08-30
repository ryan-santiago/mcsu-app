import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { Metadata } from "next";

import { ProductivityDashboardView } from "@/components/productivity-dashboard/productivity-dashboard-view";
import { resolveDateRangePreset } from "@/lib/date-range-presets";
import { requirePermissionAny } from "@/lib/session";
import { getProductivityDashboardData } from "@/server/productivity-dashboard/queries";
import { productivityDashboardQueryKey } from "@/server/productivity-dashboard/query-key";

export const metadata: Metadata = {
  title: "Productivity Dashboard",
};

/**
 * Gated on either of the two monitoring permissions — Activity Report and
 * Certifications have no plain `:read` permission (self-service is fully
 * ungated), so this dashboard is really an extension of "monitoring," same
 * as the two module-level monitoring pages. Each section inside
 * `ProductivityDashboardView` independently re-checks its own permission
 * (see `getProductivityDashboardData`) and omits itself if the viewer can't
 * see it — same pattern Workforce/Engagement Dashboard use.
 */
export default async function ProductivityDashboardPage() {
  await requirePermissionAny(["activity_reports:read_all", "certifications:read_all"]);

  const queryClient = new QueryClient();
  await queryClient.prefetchQuery({
    queryKey: productivityDashboardQueryKey("current_month"),
    queryFn: () => getProductivityDashboardData(resolveDateRangePreset("current_month")),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ProductivityDashboardView />
    </HydrationBoundary>
  );
}
