import "server-only";

import { format, startOfMonth, startOfWeek } from "date-fns";
import { and, count, countDistinct, eq, gte, inArray, lte } from "drizzle-orm";

import { db } from "@/db";
import { client, jobPostingSource, taApplication, taApplicationStage, taRequest } from "@/db/schema";
import { can } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/session";
import { TA_STAGE_LABELS } from "@/server/talent-acquisition/stage-types";
import { TA_STAGE_ORDER } from "@/server/talent-acquisition/stage-order";

import type { BreakdownRow, TalentAcquisitionDashboardData, TrendPoint } from "./types";

/** Same threshold `workforce-dashboard`'s `trendStepFor` uses — weekly under 4 months, monthly beyond. */
function trendBucketUnit(from: Date, to: Date): "week" | "month" {
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  return months <= 3 ? "week" : "month";
}

function bucketTrend(dates: Date[], unit: "week" | "month"): TrendPoint[] {
  const bucketStart = unit === "week" ? startOfWeek : startOfMonth;
  const labelFormat = unit === "week" ? "MMM d" : "MMM yyyy";

  const buckets = new Map<number, { date: Date; count: number }>();
  for (const date of dates) {
    const bucket = bucketStart(date);
    const key = bucket.getTime();
    const existing = buckets.get(key);
    if (existing) existing.count += 1;
    else buckets.set(key, { date: bucket, count: 1 });
  }

  return Array.from(buckets.values())
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((b) => ({ date: format(b.date, labelFormat), count: b.count }));
}

export async function getTalentAcquisitionDashboardData(range: {
  from: Date;
  to: Date;
}): Promise<TalentAcquisitionDashboardData | null> {
  const actor = await getCurrentUser();
  if (!actor || !can(actor, "talent_acquisition:read")) return null;

  const [{ value: openRequests }] = await db
    .select({ value: count() })
    .from(taRequest)
    .where(inArray(taRequest.status, ["open", "partially_filled"]));

  const applicationsInRange = await db
    .select({
      id: taApplication.id,
      candidateId: taApplication.candidateId,
      requestId: taApplication.requestId,
      status: taApplication.status,
      statusChangedAt: taApplication.statusChangedAt,
      createdAt: taApplication.createdAt,
      sourceId: taApplication.sourceId,
      sourceName: jobPostingSource.name,
      clientName: client.name,
      requestCreatedAt: taRequest.createdAt,
    })
    .from(taApplication)
    .innerJoin(taRequest, eq(taApplication.requestId, taRequest.id))
    .innerJoin(client, eq(taRequest.clientId, client.id))
    .leftJoin(jobPostingSource, eq(taApplication.sourceId, jobPostingSource.id))
    .where(and(gte(taApplication.createdAt, range.from), lte(taApplication.createdAt, range.to)));

  const candidatesSourced = applicationsInRange.length;

  const hiredInRange = applicationsInRange.filter((row) => row.status === "hired" && row.statusChangedAt);
  const migratedThisRange = hiredInRange.length;
  const timeToFillAvgDays =
    hiredInRange.length > 0
      ? Math.round(
          (hiredInRange.reduce((sum, row) => sum + (row.statusChangedAt!.getTime() - row.requestCreatedAt.getTime()), 0) /
            hiredInRange.length /
            (1000 * 60 * 60 * 24)) *
            10,
        ) / 10
      : null;

  const applicationsTrend = bucketTrend(
    applicationsInRange.map((row) => row.createdAt),
    trendBucketUnit(range.from, range.to),
  );

  const sourceCounts = new Map<string, number>();
  for (const row of applicationsInRange) {
    const label = row.sourceName ?? "Unspecified";
    sourceCounts.set(label, (sourceCounts.get(label) ?? 0) + 1);
  }
  const sourceBreakdown: BreakdownRow[] = Array.from(sourceCounts.entries()).map(([label, value]) => ({
    label,
    count: value,
  }));

  const clientCounts = new Map<string, number>();
  for (const row of applicationsInRange) {
    clientCounts.set(row.clientName, (clientCounts.get(row.clientName) ?? 0) + 1);
  }
  const clientBreakdown: BreakdownRow[] = Array.from(clientCounts.entries()).map(([label, value]) => ({
    label,
    count: value,
  }));

  const applicationIds = applicationsInRange.map((row) => row.id);
  const stageReachedCounts = new Map<string, number>();
  if (applicationIds.length > 0) {
    const stageRows = await db
      .select({ stage: taApplicationStage.stage, value: countDistinct(taApplicationStage.applicationId) })
      .from(taApplicationStage)
      .where(inArray(taApplicationStage.applicationId, applicationIds))
      .groupBy(taApplicationStage.stage);
    for (const row of stageRows) stageReachedCounts.set(row.stage, row.value);
  }

  const funnelBreakdown: BreakdownRow[] = [
    ...TA_STAGE_ORDER.map((stage) => ({ label: TA_STAGE_LABELS[stage], count: stageReachedCounts.get(stage) ?? 0 })),
    { label: "Migrated to Employee", count: migratedThisRange },
  ];

  return {
    openRequests,
    candidatesSourced,
    migratedThisRange,
    timeToFillAvgDays,
    funnelBreakdown,
    applicationsTrend,
    sourceBreakdown,
    clientBreakdown,
  };
}
