"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { activityReport, activityReportItem } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { formatTimeOfDay } from "@/lib/activity-report-format";
import { diffFields, recordAudit } from "@/lib/audit";
import { formatEmployeeDisplayName } from "@/lib/employee-format";
import { AuthorizationError } from "@/lib/session";
import {
  activityReportExportInputSchema,
  activityReportFormSchema,
  type ActivityLineItemInput,
  type ActivityReportExportInput,
  type ActivityReportFormInput,
} from "@/lib/validation/activity-report";
import { getMyEmployeeDetail, requireActiveUser } from "@/server/settings/queries";

import {
  getMyActivityReportById,
  listActiveClientOptions,
  listMyActivityReports,
  listMyActivityReportsForExport,
} from "./queries";
import type {
  ActivityReportDetail,
  ActivityReportExportDefaults,
  ActivityReportFilters,
  ActivityReportListResult,
} from "./types";

const idSchema = z.string().min(1, "A report must be selected");

async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "That request was not valid." };
    }
    console.error("[activity-reports] action failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

function refreshMyActivityReports(id?: string) {
  revalidatePath("/activity-reports");
  if (id) revalidatePath(`/activity-reports/${id}`);
}

/**
 * Whole-list replace — no independent lifecycle for a report's activity
 * lines, same convention as `replaceClientNames` in
 * `src/server/projects/actions.ts`. `sortOrder` comes from the submitted
 * array's own order.
 */
async function replaceActivityItems(reportId: string, items: ActivityLineItemInput[]) {
  await db.delete(activityReportItem).where(eq(activityReportItem.activityReportId, reportId));
  if (items.length > 0) {
    await db.insert(activityReportItem).values(
      items.map((item, index) => ({
        id: crypto.randomUUID(),
        activityReportId: reportId,
        activityCode: item.activityCode,
        activityName: item.activityName,
        description: item.description,
        issueBlockers: item.issueBlockers || null,
        sortOrder: index,
      })),
    );
  }
}

/* -------------------------------------------------------------------------- */
/*  Read                                                                      */
/* -------------------------------------------------------------------------- */

export async function fetchMyActivityReports(filters: ActivityReportFilters): Promise<ActivityReportListResult> {
  return listMyActivityReports(filters);
}

export async function fetchMyActivityReport(id: string): Promise<ActivityReportDetail | null> {
  return getMyActivityReportById(id);
}

/** Prefill data for the Export Report dialog — employee name, active clients, and the latest deployment's client/project as defaults. */
export async function fetchActivityReportExportDefaults(): Promise<ActionResult<ActivityReportExportDefaults>> {
  return run(async () => {
    const [employee, clientOptions] = await Promise.all([getMyEmployeeDetail(), listActiveClientOptions()]);
    if (!employee) return { ok: false, error: "Your account has no linked employee record." };

    const latestDeployment = employee.deployments[0] ?? null;

    return {
      ok: true,
      data: {
        employeeName: formatEmployeeDisplayName(employee),
        clientOptions,
        defaultClientName: latestDeployment?.clientName ?? "",
        defaultProjectName: latestDeployment?.projectName ?? "",
      },
      message: "",
    };
  });
}

/** The signed-in user's activity reports (with line items) for one calendar month — the Export Report PDF's data source. */
export async function fetchActivityReportExportData(
  input: ActivityReportExportInput,
): Promise<ActionResult<{ reports: ActivityReportDetail[] }>> {
  return run(async () => {
    const actor = await requireActiveUser();
    if (!actor.employeeId) return { ok: false, error: "Your account has no linked employee record." };

    const { month, year } = activityReportExportInputSchema.parse(input);
    const from = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const reports = await listMyActivityReportsForExport(from, to);
    return { ok: true, data: { reports }, message: "" };
  });
}

/* -------------------------------------------------------------------------- */
/*  Write                                                                     */
/* -------------------------------------------------------------------------- */

export async function createMyActivityReport(
  input: ActivityReportFormInput,
): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const actor = await requireActiveUser();
    if (!actor.employeeId) return { ok: false, error: "Your account has no linked employee record." };

    const data = activityReportFormSchema.parse(input);

    const [existing] = await db
      .select({ id: activityReport.id })
      .from(activityReport)
      .where(and(eq(activityReport.employeeId, actor.employeeId), eq(activityReport.date, data.date)))
      .limit(1);
    if (existing) return { ok: false, error: "You already have an entry for that date — edit it instead." };

    const onLeave = data.status === "on_leave";

    const id = crypto.randomUUID();
    await db.insert(activityReport).values({
      id,
      employeeId: actor.employeeId,
      date: data.date,
      status: data.status,
      timeIn: onLeave ? null : data.timeIn,
      timeOut: onLeave ? null : data.timeOut,
      otHours: onLeave ? null : data.otHours,
    });

    await replaceActivityItems(id, onLeave ? [] : data.items);

    await recordAudit({
      module: "activity_reports",
      action: "created",
      entityId: id,
      entityLabel: data.date,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(null, { date: data.date, status: data.status }, { date: "Date", status: "Status" }),
    });

    refreshMyActivityReports(id);
    return { ok: true, data: { id }, message: "Activity report added." };
  });
}

export async function updateMyActivityReport(
  input: { id: string } & ActivityReportFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const actor = await requireActiveUser();
    if (!actor.employeeId) return { ok: false, error: "Your account has no linked employee record." };
    const id = idSchema.parse(input.id);
    const data = activityReportFormSchema.parse(input);

    const [existing] = await db
      .select()
      .from(activityReport)
      .where(and(eq(activityReport.id, id), eq(activityReport.employeeId, actor.employeeId)))
      .limit(1);
    if (!existing) return { ok: false, error: "That report no longer exists." };

    if (data.date !== existing.date) {
      const [duplicate] = await db
        .select({ id: activityReport.id })
        .from(activityReport)
        .where(
          and(
            eq(activityReport.employeeId, actor.employeeId),
            eq(activityReport.date, data.date),
            ne(activityReport.id, id),
          ),
        )
        .limit(1);
      if (duplicate) return { ok: false, error: "You already have an entry for that date — edit it instead." };
    }

    const onLeave = data.status === "on_leave";

    await db
      .update(activityReport)
      .set({
        date: data.date,
        status: data.status,
        timeIn: onLeave ? null : data.timeIn,
        timeOut: onLeave ? null : data.timeOut,
        otHours: onLeave ? null : data.otHours,
      })
      .where(eq(activityReport.id, id));

    await replaceActivityItems(id, onLeave ? [] : data.items);

    await recordAudit({
      module: "activity_reports",
      action: "updated",
      entityId: id,
      entityLabel: data.date,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(
        {
          date: existing.date,
          status: existing.status,
          timeIn: existing.timeIn ? formatTimeOfDay(existing.timeIn) : null,
          timeOut: existing.timeOut ? formatTimeOfDay(existing.timeOut) : null,
          otHours: existing.otHours,
        },
        {
          date: data.date,
          status: data.status,
          timeIn: onLeave ? null : data.timeIn,
          timeOut: onLeave ? null : data.timeOut,
          otHours: onLeave ? null : data.otHours,
        },
        { date: "Date", status: "Status", timeIn: "Time in", timeOut: "Time out", otHours: "OT hours" },
      ),
    });

    refreshMyActivityReports(id);
    return { ok: true, data: undefined, message: "Activity report updated." };
  });
}

export async function deleteMyActivityReport(input: { id: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await requireActiveUser();
    if (!actor.employeeId) return { ok: false, error: "Your account has no linked employee record." };
    const id = idSchema.parse(input.id);

    const [existing] = await db
      .select()
      .from(activityReport)
      .where(and(eq(activityReport.id, id), eq(activityReport.employeeId, actor.employeeId)))
      .limit(1);
    if (!existing) return { ok: false, error: "That report no longer exists." };

    await recordAudit({
      module: "activity_reports",
      action: "deleted",
      entityId: id,
      entityLabel: existing.date,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields({ date: existing.date }, null, { date: "Date" }),
    });

    // Activity lines cascade via FK.
    await db.delete(activityReport).where(eq(activityReport.id, id));

    refreshMyActivityReports();
    return { ok: true, data: undefined, message: "Activity report removed." };
  });
}
