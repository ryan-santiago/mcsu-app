import "server-only";

import { format, startOfMonth, startOfWeek } from "date-fns";
import { and, count, eq, gte, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import { activityReport, certification, employee, team } from "@/db/schema";
import { ACTIVITY_REPORT_STATUS_LABELS } from "@/lib/activity-report-format";
import { can } from "@/lib/rbac";
import { getCurrentUser, type CurrentUser } from "@/lib/session";

import type {
  ActivityReportDashboardData,
  BreakdownRow,
  CertificationsDashboardData,
  ProductivityDashboardData,
  TrendPoint,
} from "./types";

/** Same threshold `workforce-dashboard`'s `trendStepFor` uses — weekly under 4 months, monthly beyond, so a 1-year range doesn't render ~365 crowded points. */
function trendBucketUnit(from: Date, to: Date): "week" | "month" {
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  return months <= 3 ? "week" : "month";
}

/** Buckets a list of plain dates (already known to be within range) into weekly/monthly `TrendPoint`s, sorted chronologically. Done in JS rather than a SQL `date_trunc` grouping — the row volume a monitoring dashboard deals with doesn't need it, and it sidesteps this driver's timestamp deserialization for a grouped column entirely. */
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

async function getActivityReportDashboardData(
  actor: CurrentUser,
  range: { from: Date; to: Date },
): Promise<ActivityReportDashboardData | null> {
  if (!can(actor, "activity_reports:read_all")) return null;

  const fromDateStr = format(range.from, "yyyy-MM-dd");
  const toDateStr = format(range.to, "yyyy-MM-dd");
  const inRange = and(gte(activityReport.date, fromDateStr), lte(activityReport.date, toDateStr));

  const [activeEmployeesRow] = await db.select({ value: count() }).from(employee).where(eq(employee.isResigned, false));

  const periodRows = await db
    .select({
      date: activityReport.date,
      status: activityReport.status,
      employeeId: activityReport.employeeId,
    })
    .from(activityReport)
    .where(inRange);

  const distinctFilers = new Set(periodRows.map((r) => r.employeeId)).size;
  const onLeaveCount = periodRows.filter((r) => r.status === "on_leave").length;

  const statusCounts = new Map<string, number>();
  for (const row of periodRows) statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1);
  const statusBreakdown: BreakdownRow[] = Array.from(statusCounts.entries()).map(([status, value]) => ({
    label: ACTIVITY_REPORT_STATUS_LABELS[status as keyof typeof ACTIVITY_REPORT_STATUS_LABELS] ?? status,
    count: value,
  }));

  const unit = trendBucketUnit(range.from, range.to);
  const filingTrend = bucketTrend(
    periodRows.map((row) => new Date(`${row.date}T00:00:00`)),
    unit,
  );

  const [otHoursRow] = await db
    .select({ value: sql<string>`coalesce(sum(${activityReport.otHours}), 0)` })
    .from(activityReport)
    .where(inRange);

  const teamRows = await db
    .select({ label: sql<string>`coalesce(${team.name}, 'No team')`, value: count() })
    .from(activityReport)
    .innerJoin(employee, eq(employee.id, activityReport.employeeId))
    .leftJoin(team, eq(team.id, employee.teamId))
    .where(inRange)
    .groupBy(team.name);

  return {
    filingRate: { filed: distinctFilers, totalActive: activeEmployeesRow.value },
    reportsSubmitted: periodRows.length,
    onLeave: onLeaveCount,
    totalOtHours: Number(otHoursRow.value),
    filingTrend,
    teamBreakdown: teamRows.map((r): BreakdownRow => ({ label: r.label, count: r.value })),
    statusBreakdown,
  };
}

async function getCertificationsDashboardData(
  actor: CurrentUser,
  range: { from: Date; to: Date },
): Promise<CertificationsDashboardData | null> {
  if (!can(actor, "certifications:read_all")) return null;

  const fromDateStr = format(range.from, "yyyy-MM-dd");
  const toDateStr = format(range.to, "yyyy-MM-dd");
  const inRange = and(gte(certification.dateAcquired, fromDateStr), lte(certification.dateAcquired, toDateStr));

  const periodRows = await db
    .select({
      dateAcquired: certification.dateAcquired,
      employeeId: certification.employeeId,
      title: certification.title,
      credentialUrl: certification.credentialUrl,
    })
    .from(certification)
    .where(inRange);

  const employeesCertified = new Set(periodRows.map((r) => r.employeeId)).size;
  const withLinkCount = periodRows.filter((r) => r.credentialUrl).length;

  const unit = trendBucketUnit(range.from, range.to);
  const certificationTrend = bucketTrend(
    periodRows.map((row) => new Date(`${row.dateAcquired}T00:00:00`)),
    unit,
  );

  const titleCounts = new Map<string, number>();
  for (const row of periodRows) titleCounts.set(row.title, (titleCounts.get(row.title) ?? 0) + 1);
  const topTitles: BreakdownRow[] = Array.from(titleCounts.entries())
    .map(([label, value]) => ({ label, count: value }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const teamRows = await db
    .select({ label: sql<string>`coalesce(${team.name}, 'No team')`, value: count() })
    .from(certification)
    .innerJoin(employee, eq(employee.id, certification.employeeId))
    .leftJoin(team, eq(team.id, employee.teamId))
    .where(inRange)
    .groupBy(team.name);

  return {
    certificationsAdded: periodRows.length,
    employeesCertified,
    withVerificationLink: { withLink: withLinkCount, total: periodRows.length },
    certificationTrend,
    teamBreakdown: teamRows.map((r): BreakdownRow => ({ label: r.label, count: r.value })),
    topTitles,
  };
}

export async function getProductivityDashboardData(range: { from: Date; to: Date }): Promise<ProductivityDashboardData> {
  const actor = await getCurrentUser();
  if (!actor) return { activityReport: null, certifications: null };

  const [activityReportData, certificationsData] = await Promise.all([
    getActivityReportDashboardData(actor, range),
    getCertificationsDashboardData(actor, range),
  ]);

  return { activityReport: activityReportData, certifications: certificationsData };
}
