"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { device, deviceDeployment } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { diffFields, recordAudit } from "@/lib/audit";
import { AuthorizationError, authorize } from "@/lib/session";
import {
  deviceDeploymentRecordSchema,
  deviceFormSchema,
  type DeviceDeploymentRecordInput,
  type DeviceFormInput,
} from "@/lib/validation/device";

import { getDeviceById, listDevices, listEmployeeOptions } from "./queries";
import type { DeviceDetail, DeviceFilters, DeviceListResult, EmployeeOption } from "./types";

const idSchema = z.string().min(1, "A record must be selected");

async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "That request was not valid." };
    }
    console.error("[devices] action failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

function refreshDeviceViews(deviceId?: string) {
  revalidatePath("/admin/devices");
  if (deviceId) revalidatePath(`/admin/devices/${deviceId}`);
}

function deviceLabel(row: { brand: string; model: string; serialNumber: string }): string {
  return `${row.brand} ${row.model} (${row.serialNumber})`;
}

async function loadDeviceLabel(deviceId: string): Promise<string | null> {
  const [row] = await db
    .select({ brand: device.brand, model: device.model, serialNumber: device.serialNumber })
    .from(device)
    .where(eq(device.id, deviceId))
    .limit(1);
  return row ? deviceLabel(row) : null;
}

/**
 * Neon's HTTP driver has no interactive transactions (see `docs/ARCHITECTURE.md`),
 * so closing the previously-open assignment happens *after* the new one is
 * inserted, not atomically with it — same caveat as `closeOtherOpenEmployments`
 * in `src/server/employees/actions.ts`. A physical device can only be with
 * one employee at a time, so a new open (`endDate: null`) record always
 * displaces whichever one was open before it.
 */
async function closeOtherOpenDeviceDeployments(deviceId: string, keepId: string, closeAtDate: string) {
  await db
    .update(deviceDeployment)
    .set({ endDate: closeAtDate })
    .where(
      and(eq(deviceDeployment.deviceId, deviceId), isNull(deviceDeployment.endDate), ne(deviceDeployment.id, keepId)),
    );
}

/* -------------------------------------------------------------------------- */
/*  Read                                                                      */
/* -------------------------------------------------------------------------- */

export async function fetchDevices(filters: DeviceFilters): Promise<DeviceListResult> {
  return listDevices(filters);
}

export async function fetchDevice(id: string): Promise<DeviceDetail | null> {
  return getDeviceById(id);
}

/**
 * Employee options for the deployment form's picker. Gated on `devices:edit`
 * rather than `employees:read` — see `listEmployeeOptions` in `./queries.ts`.
 */
export async function fetchEmployeeOptionsForDeployment(): Promise<EmployeeOption[]> {
  await authorize("devices:edit");
  return listEmployeeOptions();
}

/* -------------------------------------------------------------------------- */
/*  Device profile                                                           */
/* -------------------------------------------------------------------------- */

export async function createDevice(input: DeviceFormInput): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const actor = await authorize("devices:write");
    const data = deviceFormSchema.parse(input);

    const [existingSerial] = await db
      .select({ id: device.id })
      .from(device)
      .where(eq(device.serialNumber, data.serialNumber))
      .limit(1);
    if (existingSerial) return { ok: false, error: `Serial number "${data.serialNumber}" is already in use.` };

    const id = crypto.randomUUID();
    await db.insert(device).values({
      id,
      deviceType: data.deviceType,
      brand: data.brand,
      model: data.model,
      os: data.os,
      serialNumber: data.serialNumber,
      purchaseDate: data.purchaseDate,
      status: data.status,
      remarks: data.remarks || null,
    });

    const label = deviceLabel(data);
    await recordAudit({
      module: "devices",
      action: "created",
      entityId: id,
      entityLabel: label,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(null, { serialNumber: data.serialNumber }, { serialNumber: "Serial number" }),
    });

    refreshDeviceViews(id);
    return { ok: true, data: { id }, message: `${label} added.` };
  });
}

export async function updateDevice(input: { id: string } & DeviceFormInput): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("devices:edit");
    const id = idSchema.parse(input.id);
    const data = deviceFormSchema.parse(input);

    const [existing] = await db.select().from(device).where(eq(device.id, id)).limit(1);
    if (!existing) return { ok: false, error: "That device no longer exists." };

    const [duplicateSerial] = await db
      .select({ id: device.id })
      .from(device)
      .where(and(eq(device.serialNumber, data.serialNumber), ne(device.id, id)))
      .limit(1);
    if (duplicateSerial) return { ok: false, error: `Serial number "${data.serialNumber}" is already in use.` };

    const nextRemarks = data.remarks || null;

    await db
      .update(device)
      .set({
        deviceType: data.deviceType,
        brand: data.brand,
        model: data.model,
        os: data.os,
        serialNumber: data.serialNumber,
        purchaseDate: data.purchaseDate,
        status: data.status,
        remarks: nextRemarks,
      })
      .where(eq(device.id, id));

    const label = deviceLabel(data);
    await recordAudit({
      module: "devices",
      action: "updated",
      entityId: id,
      entityLabel: label,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(
        {
          deviceType: existing.deviceType,
          brand: existing.brand,
          model: existing.model,
          os: existing.os,
          serialNumber: existing.serialNumber,
          purchaseDate: existing.purchaseDate,
          status: existing.status,
          remarks: existing.remarks,
        },
        {
          deviceType: data.deviceType,
          brand: data.brand,
          model: data.model,
          os: data.os,
          serialNumber: data.serialNumber,
          purchaseDate: data.purchaseDate,
          status: data.status,
          remarks: nextRemarks,
        },
        {
          deviceType: "Device type",
          brand: "Brand",
          model: "Model",
          os: "OS",
          serialNumber: "Serial number",
          purchaseDate: "Purchase date",
          status: "Status",
          remarks: "Remarks",
        },
      ),
    });

    refreshDeviceViews(id);
    return { ok: true, data: undefined, message: `${label} updated.` };
  });
}

export async function deleteDevice(input: { id: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("devices:delete");
    const id = idSchema.parse(input.id);

    const [target] = await db.select().from(device).where(eq(device.id, id)).limit(1);
    if (!target) return { ok: false, error: "That device no longer exists." };

    const label = deviceLabel(target);
    await recordAudit({
      module: "devices",
      action: "deleted",
      entityId: id,
      entityLabel: label,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields({ serialNumber: target.serialNumber }, null, { serialNumber: "Serial number" }),
    });

    // Deployment history cascades via FK.
    await db.delete(device).where(eq(device.id, id));

    refreshDeviceViews();
    return { ok: true, data: undefined, message: `${label} removed.` };
  });
}

/* -------------------------------------------------------------------------- */
/*  Deployment history                                                       */
/* -------------------------------------------------------------------------- */

export async function addDeviceDeploymentRecord(
  input: { deviceId: string } & DeviceDeploymentRecordInput,
): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("devices:edit");
    const deviceId = idSchema.parse(input.deviceId);
    const data = deviceDeploymentRecordSchema.parse(input);

    const label = await loadDeviceLabel(deviceId);
    if (!label) return { ok: false, error: "That device no longer exists." };

    const id = crypto.randomUUID();
    const endDate = data.endDate || null;

    await db.insert(deviceDeployment).values({
      id,
      deviceId,
      employeeId: data.employeeId,
      startDate: data.startDate,
      endDate,
    });

    if (!endDate) await closeOtherOpenDeviceDeployments(deviceId, id, data.startDate);

    await recordAudit({
      module: "devices",
      action: "deployment_added",
      entityId: deviceId,
      entityLabel: label,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(
        null,
        { employee: data.employeeId, startDate: data.startDate },
        { employee: "Assigned to", startDate: "Start date" },
      ),
    });

    refreshDeviceViews(deviceId);
    return { ok: true, data: undefined, message: "Deployment record added." };
  });
}

export async function updateDeviceDeploymentRecord(
  input: { id: string; deviceId: string } & DeviceDeploymentRecordInput,
): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("devices:edit");
    const id = idSchema.parse(input.id);
    const deviceId = idSchema.parse(input.deviceId);
    const data = deviceDeploymentRecordSchema.parse(input);

    const [existing] = await db
      .select()
      .from(deviceDeployment)
      .where(and(eq(deviceDeployment.id, id), eq(deviceDeployment.deviceId, deviceId)))
      .limit(1);
    if (!existing) return { ok: false, error: "That deployment record no longer exists." };

    const label = await loadDeviceLabel(deviceId);
    if (!label) return { ok: false, error: "That device no longer exists." };

    const endDate = data.endDate || null;

    await db
      .update(deviceDeployment)
      .set({
        employeeId: data.employeeId,
        startDate: data.startDate,
        endDate,
      })
      .where(eq(deviceDeployment.id, id));

    if (!endDate) await closeOtherOpenDeviceDeployments(deviceId, id, data.startDate);

    await recordAudit({
      module: "devices",
      action: "deployment_updated",
      entityId: deviceId,
      entityLabel: label,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(
        { employee: existing.employeeId, startDate: existing.startDate, endDate: existing.endDate },
        { employee: data.employeeId, startDate: data.startDate, endDate },
        { employee: "Assigned to", startDate: "Start date", endDate: "End date" },
      ),
    });

    refreshDeviceViews(deviceId);
    return { ok: true, data: undefined, message: "Deployment record updated." };
  });
}

export async function deleteDeviceDeploymentRecord(input: { id: string; deviceId: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("devices:delete");
    const id = idSchema.parse(input.id);
    const deviceId = idSchema.parse(input.deviceId);

    const [existing] = await db
      .select()
      .from(deviceDeployment)
      .where(and(eq(deviceDeployment.id, id), eq(deviceDeployment.deviceId, deviceId)))
      .limit(1);
    if (!existing) return { ok: false, error: "That deployment record no longer exists." };

    const label = await loadDeviceLabel(deviceId);

    await recordAudit({
      module: "devices",
      action: "deployment_removed",
      entityId: deviceId,
      entityLabel: label ?? deviceId,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields({ startDate: existing.startDate }, null, { startDate: "Start date" }),
    });

    await db.delete(deviceDeployment).where(eq(deviceDeployment.id, id));

    refreshDeviceViews(deviceId);
    return { ok: true, data: undefined, message: "Deployment record removed." };
  });
}
