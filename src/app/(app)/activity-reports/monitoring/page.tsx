import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { Metadata } from "next";

import { ActivityReportMonitoringView } from "@/components/activity-reports/activity-report-monitoring-view";
import { PageHeader } from "@/components/layout/page-header";
import { requirePermission } from "@/lib/session";
import { listActivityReportsForMonitoring } from "@/server/activity-reports/queries";
import { activityReportMonitoringQueryKey } from "@/server/activity-reports/query-key";
import type { ActivityReportMonitoringFilters } from "@/server/activity-reports/types";

export const metadata: Metadata = {
  title: "Activity Report Monitoring",
};

export default async function ActivityReportMonitoringPage() {
  await requirePermission("activity_reports:read_all");

  const initialFilters: ActivityReportMonitoringFilters = {};

  const queryClient = new QueryClient();
  await queryClient.prefetchQuery({
    queryKey: activityReportMonitoringQueryKey(initialFilters),
    queryFn: () => listActivityReportsForMonitoring(initialFilters),
  });

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="Activity Report Monitoring"
        description="Every employee's daily activity reports, in one place."
      />

      <HydrationBoundary state={dehydrate(queryClient)}>
        <ActivityReportMonitoringView initialFilters={initialFilters} />
      </HydrationBoundary>
    </div>
  );
}
