import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ActivityReportDetailView } from "@/components/activity-reports/activity-report-detail-view";
import { PageHeader } from "@/components/layout/page-header";
import { formatDate } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { getMyActivityReportById } from "@/server/activity-reports/queries";
import { myActivityReportQueryKey } from "@/server/activity-reports/query-key";

type ActivityReportDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: ActivityReportDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const report = await getMyActivityReportById(id);
  return { title: report ? formatDate(report.date) : "Activity report" };
}

export default async function ActivityReportDetailPage({ params }: ActivityReportDetailPageProps) {
  await requireUser();
  const { id } = await params;

  const queryClient = new QueryClient();
  const report = await queryClient.fetchQuery({
    queryKey: myActivityReportQueryKey(id),
    queryFn: () => getMyActivityReportById(id),
  });

  if (!report) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title="View / Edit Activity Report"
        description="Update this entry's time in/out, OT and activities."
      />

      <HydrationBoundary state={dehydrate(queryClient)}>
        <ActivityReportDetailView reportId={id} />
      </HydrationBoundary>
    </div>
  );
}
