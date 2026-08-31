import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { Metadata } from "next";

import { TalentAcquisitionDashboardView } from "@/components/talent-acquisition-dashboard/talent-acquisition-dashboard-view";
import { resolveDateRangePreset } from "@/lib/date-range-presets";
import { requirePermission } from "@/lib/session";
import { getTalentAcquisitionDashboardData } from "@/server/talent-acquisition-dashboard/queries";
import { talentAcquisitionDashboardQueryKey } from "@/server/talent-acquisition-dashboard/query-key";

export const metadata: Metadata = {
  title: "Talent Acquisition Dashboard",
};

/**
 * Gated on the single `talent_acquisition:read` permission — unlike
 * Workforce Dashboard's three-way module split, Talent Acquisition has one
 * cohesive read gate, so `requirePermission` (not `requirePermissionAny`) is
 * enough.
 */
export default async function TalentAcquisitionDashboardPage() {
  await requirePermission("talent_acquisition:read");

  const queryClient = new QueryClient();
  await queryClient.prefetchQuery({
    queryKey: talentAcquisitionDashboardQueryKey("current_month"),
    queryFn: () => getTalentAcquisitionDashboardData(resolveDateRangePreset("current_month")),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <TalentAcquisitionDashboardView />
    </HydrationBoundary>
  );
}
