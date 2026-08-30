"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Briefcase,
  ClipboardCheck,
  ClipboardList,
  FileCheck2,
  Hourglass,
  UserMinus,
  UserPlus,
  Users,
  UsersRound,
} from "lucide-react";
import * as React from "react";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DATE_RANGE_PRESET_LABELS, type DateRangePreset } from "@/lib/date-range-presets";
import { fetchWorkforceDashboard } from "@/server/workforce-dashboard/actions";
import { workforceDashboardQueryKey } from "@/server/workforce-dashboard/query-key";
import type { WorkforceDashboardData } from "@/server/workforce-dashboard/types";

import { BreakdownCard } from "./breakdown-card";
import { DateRangeSelect } from "./date-range-select";
import { KpiCard } from "./kpi-card";
import { TrendLineChart } from "./trend-line-chart";

/** `initialData` for `current_month` comes from the server prefetch (see `page.tsx`'s `HydrationBoundary`) — every other preset fetches on first select. */
export function WorkforceDashboardView() {
  const [range, setRange] = React.useState<DateRangePreset>("current_month");

  const query = useQuery({
    queryKey: workforceDashboardQueryKey(range),
    queryFn: () => fetchWorkforceDashboard(range),
  });

  const data = query.data;
  const loading = query.isFetching || !data;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="Workforce Dashboard"
        description="Employees, Projects, and Employee Recommendation at a glance."
        actions={<DateRangeSelect value={range} onChange={setRange} disabled={query.isFetching} />}
      />

      <p className="text-muted-foreground -mt-2 text-xs">
        Showing {DATE_RANGE_PRESET_LABELS[range].toLowerCase()}. Headcount and breakdowns reflect today; new hires,
        resignations, and recommendation activity reflect this range.
      </p>

      {!data ? (
        <div className="space-y-6">
          <SectionSkeleton />
          <SectionSkeleton />
          <SectionSkeleton />
        </div>
      ) : (
        <>
          {data.employees ? <EmployeesSection data={data.employees} loading={loading} /> : null}
          {data.projects ? <ProjectsSection data={data.projects} loading={loading} /> : null}
          {data.employeeRecommendation ? (
            <EmployeeRecommendationSection data={data.employeeRecommendation} loading={loading} />
          ) : null}

          {!data.employees && !data.projects && !data.employeeRecommendation ? (
            <Card>
              <CardContent className="text-muted-foreground py-10 text-center text-sm">
                Nothing to show — you don&apos;t have read access to Employees, Projects, or Employee Recommendation.
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

function EmployeesSection({ data, loading }: { data: NonNullable<WorkforceDashboardData["employees"]>; loading: boolean }) {
  return (
    <section className="space-y-3" aria-busy={loading}>
      <h3 className="text-sm font-semibold">Employees</h3>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard icon={Users} label="Current headcount" value={data.headcountNow} />
        <KpiCard icon={UserPlus} label="New hires" value={data.newHires} tone="success" />
        <KpiCard icon={UserMinus} label="Resignations" value={data.resignations} tone={data.resignations > 0 ? "warning" : "default"} />
        <KpiCard icon={ClipboardList} label="Needs recommendation" value={data.needsRecommendation} tone={data.needsRecommendation > 0 ? "warning" : "default"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Headcount Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <TrendLineChart points={data.headcountTrend} ariaLabel="Headcount trend chart" />
        </CardContent>
      </Card>

      {data.employmentRecordCoverage.total > 0 && data.employmentRecordCoverage.withRecord < data.employmentRecordCoverage.total ? (
        <p className="text-muted-foreground text-xs">
          Employment Type below reflects only the {data.employmentRecordCoverage.withRecord} of{" "}
          {data.employmentRecordCoverage.total} active employees who have an employment record on file — the rest
          have none entered in the Employees module yet.
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <BreakdownCard title="By Employment Type" rows={data.employmentTypeBreakdown} emptyLabel="No active employees." />
        {data.teamBreakdown.length > 0 ? (
          <BreakdownCard title="By Team" rows={data.teamBreakdown} emptyLabel="No active employees." barClassName="bg-chart-2" />
        ) : null}
        <BreakdownCard title="By Gender" rows={data.genderBreakdown} emptyLabel="No active employees." barClassName="bg-chart-3" />
      </div>
    </section>
  );
}

function ProjectsSection({ data, loading }: { data: NonNullable<WorkforceDashboardData["projects"]>; loading: boolean }) {
  return (
    <section className="space-y-3" aria-busy={loading}>
      <h3 className="text-sm font-semibold">Projects</h3>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <KpiCard icon={Briefcase} label="Active projects" value={data.activeProjects} />
        <KpiCard icon={ClipboardCheck} label="New projects" value={data.newProjects} tone="success" />
        <KpiCard icon={UsersRound} label="Deployed headcount" value={data.deployedHeadcount} />
      </div>

      <BreakdownCard title="Projects by Client" rows={data.clientBreakdown} emptyLabel="No projects yet." barClassName="bg-chart-4" />
    </section>
  );
}

function EmployeeRecommendationSection({
  data,
  loading,
}: {
  data: NonNullable<WorkforceDashboardData["employeeRecommendation"]>;
  loading: boolean;
}) {
  return (
    <section className="space-y-3" aria-busy={loading}>
      <h3 className="text-sm font-semibold">Employee Recommendation</h3>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <KpiCard icon={FileCheck2} label="Submitted" value={data.submitted} />
        <KpiCard icon={Hourglass} label="Awaiting approval" value={data.pendingApproval} tone={data.pendingApproval > 0 ? "warning" : "default"} />
        <KpiCard icon={ClipboardCheck} label="Applied to history" value={data.appliedToEmploymentHistory} tone="success" />
      </div>

      <BreakdownCard title="By Status (this range)" rows={data.statusBreakdown} emptyLabel="No recommendations in this range." barClassName="bg-chart-5" />
    </section>
  );
}
