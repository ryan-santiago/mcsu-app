"use client";

import { useQuery } from "@tanstack/react-query";
import { Award, CalendarClock, ClipboardList, UserPlus } from "lucide-react";
import * as React from "react";

import { BreakdownCard } from "@/components/workforce-dashboard/breakdown-card";
import { DateRangeSelect } from "@/components/workforce-dashboard/date-range-select";
import { KpiCard } from "@/components/workforce-dashboard/kpi-card";
import { TrendLineChart } from "@/components/workforce-dashboard/trend-line-chart";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DATE_RANGE_PRESET_LABELS, type DateRangePreset } from "@/lib/date-range-presets";
import { fetchTalentAcquisitionDashboard } from "@/server/talent-acquisition-dashboard/actions";
import { talentAcquisitionDashboardQueryKey } from "@/server/talent-acquisition-dashboard/query-key";

/** `initialData` for `current_month` comes from the server prefetch (see `page.tsx`'s `HydrationBoundary`) — every other preset fetches on first select, same convention as Workforce/Engagement/Productivity Dashboard. */
export function TalentAcquisitionDashboardView() {
  const [range, setRange] = React.useState<DateRangePreset>("current_month");

  const query = useQuery({
    queryKey: talentAcquisitionDashboardQueryKey(range),
    queryFn: () => fetchTalentAcquisitionDashboard(range),
  });

  const data = query.data;
  const loading = query.isFetching || !data;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="Talent Acquisition Dashboard"
        description="Requests and the hiring pipeline at a glance."
        actions={<DateRangeSelect value={range} onChange={setRange} disabled={query.isFetching} />}
      />

      <p className="text-muted-foreground -mt-2 text-xs">
        Showing {DATE_RANGE_PRESET_LABELS[range].toLowerCase()}. Open Requests reflects today; everything else
        reflects this range.
      </p>

      {query.isPending ? (
        <SectionSkeleton />
      ) : !data ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            Nothing to show — you don&apos;t have read access to Talent Acquisition.
          </CardContent>
        </Card>
      ) : (
        <section className="space-y-3" aria-busy={loading}>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiCard icon={ClipboardList} label="Open requests" value={data.openRequests} />
            <KpiCard icon={UserPlus} label="Candidates sourced" value={data.candidatesSourced} />
            <KpiCard icon={Award} label="Migrated to Employee" value={data.migratedThisRange} tone="success" />
            <KpiCard
              icon={CalendarClock}
              label="Avg. time to fill"
              value={data.timeToFillAvgDays ?? 0}
              suffix={data.timeToFillAvgDays !== null ? " days" : ""}
              hint={data.timeToFillAvgDays === null ? "No hires in this range" : undefined}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Applications Received</CardTitle>
            </CardHeader>
            <CardContent>
              <TrendLineChart points={data.applicationsTrend} ariaLabel="Applications received trend chart" />
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-1">
            <BreakdownCard
              title="Pipeline Funnel"
              rows={data.funnelBreakdown}
              emptyLabel="No applications in this range."
              sortByCount={false}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <BreakdownCard title="By Source" rows={data.sourceBreakdown} emptyLabel="No applications in this range." barClassName="bg-chart-2" />
            <BreakdownCard title="By Client" rows={data.clientBreakdown} emptyLabel="No applications in this range." barClassName="bg-chart-3" />
          </div>
        </section>
      )}
    </div>
  );
}

function SectionSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-24 rounded-xl" />
      ))}
    </div>
  );
}
