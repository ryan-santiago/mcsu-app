import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import type { Metadata } from "next";

import { ActivityReportsView } from "@/components/activity-reports/activity-reports-view";
import { PageHeader } from "@/components/layout/page-header";
import { defaultActivityReportRange } from "@/lib/activity-report-format";
import { requireUser } from "@/lib/session";
import { listMyActivityReports } from "@/server/activity-reports/queries";
import { myActivityReportsQueryKey } from "@/server/activity-reports/query-key";
import type { ActivityReportFilters } from "@/server/activity-reports/types";

export const metadata: Metadata = {
  title: "Activity Report",
};

/** No `requirePermission()` — every active signed-in user reaches their own reports. */
export default async function ActivityReportsPage() {
  await requireUser();

  const range = defaultActivityReportRange();
  const initialFilters: ActivityReportFilters = {
    from: format(range.from, "yyyy-MM-dd"),
    to: format(range.to, "yyyy-MM-dd"),
  };

  const queryClient = new QueryClient();
  await queryClient.prefetchQuery({
    queryKey: myActivityReportsQueryKey(initialFilters),
    queryFn: () => listMyActivityReports(initialFilters),
  });

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="Activity Report"
        description="Your daily activity log — what you worked on, time in/out and OT."
      />

      <HydrationBoundary state={dehydrate(queryClient)}>
        <ActivityReportsView initialFilters={initialFilters} />
      </HydrationBoundary>
    </div>
  );
}
