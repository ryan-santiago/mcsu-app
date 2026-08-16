"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarClock, RotateCcw } from "lucide-react";

import { ActivityReportForm } from "@/components/activity-reports/activity-report-form";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchMyActivityReport } from "@/server/activity-reports/actions";
import { myActivityReportQueryKey } from "@/server/activity-reports/query-key";
import type { ActivityReportDetail } from "@/server/activity-reports/types";

type ActivityReportDetailViewProps = {
  reportId: string;
};

export function ActivityReportDetailView({ reportId }: ActivityReportDetailViewProps) {
  const { data, isPending, isError, refetch } = useQuery<ActivityReportDetail | null>({
    queryKey: myActivityReportQueryKey(reportId),
    queryFn: () => fetchMyActivityReport(reportId),
  });

  if (isPending) {
    return <Skeleton className="h-96 w-full rounded-xl" />;
  }

  if (isError) {
    return (
      <div className="border-destructive/30 bg-destructive/5 flex items-center justify-between gap-4 rounded-lg border p-4">
        <p className="text-destructive text-sm">Could not load this report.</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          <RotateCcw className="size-4" aria-hidden />
          Retry
        </Button>
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState icon={CalendarClock} title="Report not found" description="This entry may have been removed." />
    );
  }

  return <ActivityReportForm mode="edit" reportId={reportId} initialData={data} />;
}
