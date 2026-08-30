"use client";

import { useQuery } from "@tanstack/react-query";
import { Award, BadgeCheck, CalendarClock, Clock, ClipboardList, Users } from "lucide-react";
import * as React from "react";

import { BreakdownCard } from "@/components/workforce-dashboard/breakdown-card";
import { DateRangeSelect } from "@/components/workforce-dashboard/date-range-select";
import { KpiCard } from "@/components/workforce-dashboard/kpi-card";
import { TrendLineChart } from "@/components/workforce-dashboard/trend-line-chart";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DATE_RANGE_PRESET_LABELS, type DateRangePreset } from "@/lib/date-range-presets";
import { fetchProductivityDashboard } from "@/server/productivity-dashboard/actions";
import { productivityDashboardQueryKey } from "@/server/productivity-dashboard/query-key";
import type { ProductivityDashboardData } from "@/server/productivity-dashboard/types";

/** `initialData` for `current_month` comes from the server prefetch (see `page.tsx`'s `HydrationBoundary`) — every other preset fetches on first select, same convention as Workforce/Engagement Dashboard. */
export function ProductivityDashboardView() {
  const [range, setRange] = React.useState<DateRangePreset>("current_month");

  const query = useQuery({
    queryKey: productivityDashboardQueryKey(range),
    queryFn: () => fetchProductivityDashboard(range),
  });

  const data = query.data;
  const loading = query.isFetching || !data;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="Productivity Dashboard"
        description="Activity Report and Certifications at a glance."
        actions={<DateRangeSelect value={range} onChange={setRange} disabled={query.isFetching} />}
      />

      <p className="text-muted-foreground -mt-2 text-xs">
        Showing {DATE_RANGE_PRESET_LABELS[range].toLowerCase()}. Every figure below reflects this range.
      </p>

      {!data ? (
        <div className="space-y-6">
          <SectionSkeleton />
          <SectionSkeleton />
        </div>
      ) : (
        <>
          {data.activityReport ? <ActivityReportSection data={data.activityReport} loading={loading} /> : null}
          {data.certifications ? <CertificationsSection data={data.certifications} loading={loading} /> : null}

          {!data.activityReport && !data.certifications ? (
            <Card>
              <CardContent className="text-muted-foreground py-10 text-center text-sm">
                Nothing to show — you don&apos;t have monitoring access to Activity Report or Certifications.
              </CardContent>
            </Card>
          ) : null}
        </>
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

function ActivityReportSection({
  data,
  loading,
}: {
  data: NonNullable<ProductivityDashboardData["activityReport"]>;
  loading: boolean;
}) {
  const filingPct =
    data.filingRate.totalActive > 0 ? Math.round((data.filingRate.filed / data.filingRate.totalActive) * 1000) / 10 : 0;

  return (
    <section className="space-y-3" aria-busy={loading}>
      <h3 className="text-sm font-semibold">Activity Report</h3>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard
          icon={Users}
          label="Filing rate"
          value={filingPct}
          suffix="%"
          hint={`${data.filingRate.filed} of ${data.filingRate.totalActive} employees`}
          tone={filingPct < 80 ? "warning" : "success"}
        />
        <KpiCard icon={ClipboardList} label="Reports submitted" value={data.reportsSubmitted} />
        <KpiCard icon={CalendarClock} label="On leave" value={data.onLeave} />
        <KpiCard icon={Clock} label="Total OT hours" value={data.totalOtHours} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filing Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <TrendLineChart points={data.filingTrend} ariaLabel="Activity report filing trend chart" />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <BreakdownCard title="By Team" rows={data.teamBreakdown} emptyLabel="No reports in this range." />
        <BreakdownCard
          title="By Status"
          rows={data.statusBreakdown}
          emptyLabel="No reports in this range."
          barClassName="bg-chart-2"
        />
      </div>
    </section>
  );
}

function CertificationsSection({
  data,
  loading,
}: {
  data: NonNullable<ProductivityDashboardData["certifications"]>;
  loading: boolean;
}) {
  return (
    <section className="space-y-3" aria-busy={loading}>
      <h3 className="text-sm font-semibold">Certifications</h3>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <KpiCard icon={Award} label="Certifications added" value={data.certificationsAdded} tone="success" />
        <KpiCard icon={Users} label="Employees certified" value={data.employeesCertified} />
        <KpiCard
          icon={BadgeCheck}
          label="With verification link"
          value={data.withVerificationLink.withLink}
          hint={`of ${data.withVerificationLink.total} in range`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Certifications Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <TrendLineChart points={data.certificationTrend} ariaLabel="Certifications earned trend chart" />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <BreakdownCard
          title="By Team"
          rows={data.teamBreakdown}
          emptyLabel="No certifications in this range."
          barClassName="bg-chart-3"
        />
        <BreakdownCard
          title="Top Certificate Titles"
          rows={data.topTitles}
          emptyLabel="No certifications in this range."
          barClassName="bg-chart-4"
        />
      </div>
    </section>
  );
}
