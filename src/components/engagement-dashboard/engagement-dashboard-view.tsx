"use client";

import { useQuery } from "@tanstack/react-query";
import { Briefcase, FolderKanban, Layers, ListChecks, TrendingUp, UserPlus, Users } from "lucide-react";
import * as React from "react";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BreakdownCard } from "@/components/workforce-dashboard/breakdown-card";
import { DateRangeSelect } from "@/components/workforce-dashboard/date-range-select";
import { KpiCard } from "@/components/workforce-dashboard/kpi-card";
import { DATE_RANGE_PRESET_LABELS, type DateRangePreset } from "@/lib/date-range-presets";
import { fetchEngagementDashboard } from "@/server/engagement-dashboard/actions";
import { engagementDashboardQueryKey } from "@/server/engagement-dashboard/query-key";
import type { EngagementDashboardData } from "@/server/engagement-dashboard/types";

import { OneLotProjectsTable } from "./one-lot-projects-table";

/** `initialData` for `current_month` comes from the server prefetch (see `page.tsx`'s `HydrationBoundary`) — every other preset fetches on first select. Mirrors `WorkforceDashboardView`'s shape. */
export function EngagementDashboardView() {
  const [range, setRange] = React.useState<DateRangePreset>("current_month");

  const query = useQuery({
    queryKey: engagementDashboardQueryKey(range),
    queryFn: () => fetchEngagementDashboard(range),
  });

  const data = query.data;
  const loading = query.isFetching || !data;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="Engagement Dashboard"
        description="Staff Augmentation and One-Lot Projects at a glance."
        actions={<DateRangeSelect value={range} onChange={setRange} disabled={query.isFetching} />}
      />

      <p className="text-muted-foreground -mt-2 text-xs">
        Showing {DATE_RANGE_PRESET_LABELS[range].toLowerCase()}. Headcount and project totals reflect today; new
        assignments and points delivered reflect this range.
      </p>

      {!data ? (
        <div className="space-y-6">
          <SectionSkeleton />
          <SectionSkeleton />
        </div>
      ) : (
        <>
          {data.staffAugmentation ? <StaffAugmentationSection data={data.staffAugmentation} loading={loading} /> : null}
          {data.oneLotProjects ? <OneLotProjectsSection data={data.oneLotProjects} loading={loading} /> : null}

          {!data.staffAugmentation && !data.oneLotProjects ? (
            <Card>
              <CardContent className="text-muted-foreground py-10 text-center text-sm">
                Nothing to show — you don&apos;t have read access to Staff Augmentation or One-Lot Projects, and
                aren&apos;t a member of any project.
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

function StaffAugmentationSection({
  data,
  loading,
}: {
  data: NonNullable<EngagementDashboardData["staffAugmentation"]>;
  loading: boolean;
}) {
  return (
    <section className="space-y-3" aria-busy={loading}>
      <h3 className="text-sm font-semibold">Staff Augmentation</h3>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <KpiCard icon={Briefcase} label="Engagements" value={data.totalEngagements} />
        <KpiCard icon={Users} label="Staffed headcount" value={data.staffedHeadcount} />
        <KpiCard icon={UserPlus} label="New assignments" value={data.newAssignments} tone="success" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <BreakdownCard title="By Engagement" rows={data.engagementBreakdown} emptyLabel="No engagements yet." barClassName="bg-chart-2" />
        <BreakdownCard title="By Team" rows={data.teamBreakdown} emptyLabel="No staffed employees yet." barClassName="bg-chart-3" />
      </div>
    </section>
  );
}

function OneLotProjectsSection({
  data,
  loading,
}: {
  data: NonNullable<EngagementDashboardData["oneLotProjects"]>;
  loading: boolean;
}) {
  return (
    <section className="space-y-3" aria-busy={loading}>
      <h3 className="text-sm font-semibold">One-Lot Projects</h3>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard icon={FolderKanban} label="Projects" value={data.totalProjects} />
        <KpiCard icon={Layers} label="Active sprints" value={data.activeSprints} />
        <KpiCard icon={ListChecks} label="Work items" value={data.workItems} />
        <KpiCard icon={TrendingUp} label="Points delivered" value={data.pointsDelivered} tone="success" />
      </div>

      <OneLotProjectsTable projects={data.projects} />

      <div className="grid gap-4 md:grid-cols-3">
        <BreakdownCard title="Priority Breakdown" rows={data.priorityBreakdown} emptyLabel="No work items yet." barClassName="bg-chart-4" />
        <BreakdownCard title="Types of Work" rows={data.typesOfWorkBreakdown} emptyLabel="No work items yet." barClassName="bg-chart-5" />
        <BreakdownCard title="Team Workload" rows={data.teamWorkload} emptyLabel="No work items yet." barClassName="bg-chart-1" />
      </div>
    </section>
  );
}
