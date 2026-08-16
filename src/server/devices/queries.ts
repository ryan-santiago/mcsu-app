import "server-only";

import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { device, deviceDeployment, employee } from "@/db/schema";
import { formatEmployeeName } from "@/lib/employee-format";
import { authorize } from "@/lib/session";

import type {
  DeviceDetail,
  DeviceFilters,
  DeviceListResult,
  DeviceListRow,
  EmployeeOption,
} from "./types";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function buildWhere(filters: DeviceFilters): SQL | undefined {
  const clauses: SQL[] = [];

  const search = filters.search?.trim();
  if (search) {
    const pattern = `%${search}%`;
    const match = or(
      ilike(device.brand, pattern),
      ilike(device.model, pattern),
      ilike(device.os, pattern),
      ilike(device.serialNumber, pattern),
    );
    if (match) clauses.push(match);
  }

  if (filters.deviceType) {
    clauses.push(eq(device.deviceType, filters.deviceType));
  }

  if (filters.status) {
    clauses.push(eq(device.status, filters.status));
  }

  if (clauses.length === 0) return undefined;
  return clauses.length === 1 ? clauses[0] : and(...clauses);
}

/** Distinct-on-device latest assignment — mirrors `latestDeploymentSubquery` in `src/server/employees/queries.ts`. */
function latestDeviceDeploymentSubquery() {
  return db
    .selectDistinctOn([deviceDeployment.deviceId], {
      deviceId: deviceDeployment.deviceId,
      employeeId: deviceDeployment.employeeId,
      employeeFirstName: sql<string>`${employee.firstName}`.as("employee_first_name"),
      employeeMiddleName: sql<string | null>`${employee.middleName}`.as("employee_middle_name"),
      employeeLastName: sql<string>`${employee.lastName}`.as("employee_last_name"),
    })
    .from(deviceDeployment)
    .innerJoin(employee, eq(employee.id, deviceDeployment.employeeId))
    .orderBy(
      deviceDeployment.deviceId,
      sql`${deviceDeployment.endDate} IS NULL DESC`,
      desc(deviceDeployment.startDate),
    )
    .as("latest_device_deployment");
}

/**
 * Lists devices for the inventory table, each row carrying its current
 * holder (if any) computed via a `DISTINCT ON` subquery over deployment
 * history — same shape as `listEmployees`.
 */
export async function listDevices(filters: DeviceFilters = {}): Promise<DeviceListResult> {
  await authorize("devices:read");

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));

  const latestDeployment = latestDeviceDeploymentSubquery();
  const where = buildWhere(filters);

  const rows = await db
    .select({
      id: device.id,
      deviceType: device.deviceType,
      brand: device.brand,
      model: device.model,
      os: device.os,
      serialNumber: device.serialNumber,
      purchaseDate: device.purchaseDate,
      status: device.status,
      remarks: device.remarks,
      currentEmployeeId: latestDeployment.employeeId,
      currentEmployeeFirstName: latestDeployment.employeeFirstName,
      currentEmployeeMiddleName: latestDeployment.employeeMiddleName,
      currentEmployeeLastName: latestDeployment.employeeLastName,
    })
    .from(device)
    .leftJoin(latestDeployment, eq(latestDeployment.deviceId, device.id))
    .where(where)
    .orderBy(asc(device.brand), asc(device.model))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ value: total }] = await db.select({ value: count() }).from(device).where(where);

  const devices: DeviceListRow[] = rows.map((row) => ({
    id: row.id,
    deviceType: row.deviceType,
    brand: row.brand,
    model: row.model,
    os: row.os,
    serialNumber: row.serialNumber,
    purchaseDate: row.purchaseDate,
    status: row.status,
    remarks: row.remarks,
    currentEmployeeId: row.currentEmployeeId,
    currentEmployeeName:
      row.currentEmployeeId && row.currentEmployeeFirstName && row.currentEmployeeLastName
        ? formatEmployeeName({
            firstName: row.currentEmployeeFirstName,
            middleName: row.currentEmployeeMiddleName,
            lastName: row.currentEmployeeLastName,
          })
        : null,
  }));

  return { devices, total, page, pageSize };
}

export async function getDeviceById(id: string): Promise<DeviceDetail | null> {
  await authorize("devices:read");
  return loadDeviceDetail(id);
}

/** The unauthorized core of `getDeviceById` — mirrors `loadEmployeeDetail` in `src/server/employees/queries.ts`. */
export async function loadDeviceDetail(id: string): Promise<DeviceDetail | null> {
  const [row] = await db
    .select({
      id: device.id,
      deviceType: device.deviceType,
      brand: device.brand,
      model: device.model,
      os: device.os,
      serialNumber: device.serialNumber,
      purchaseDate: device.purchaseDate,
      status: device.status,
      remarks: device.remarks,
    })
    .from(device)
    .where(eq(device.id, id))
    .limit(1);

  if (!row) return null;

  const deploymentRows = await db
    .select({
      id: deviceDeployment.id,
      employeeId: deviceDeployment.employeeId,
      firstName: employee.firstName,
      middleName: employee.middleName,
      lastName: employee.lastName,
      startDate: deviceDeployment.startDate,
      endDate: deviceDeployment.endDate,
    })
    .from(deviceDeployment)
    .innerJoin(employee, eq(employee.id, deviceDeployment.employeeId))
    .where(eq(deviceDeployment.deviceId, id))
    .orderBy(sql`${deviceDeployment.endDate} IS NULL DESC`, desc(deviceDeployment.startDate));

  const deployments = deploymentRows.map((deployment) => ({
    id: deployment.id,
    employeeId: deployment.employeeId,
    employeeName: formatEmployeeName(deployment),
    startDate: deployment.startDate,
    endDate: deployment.endDate,
  }));

  const current = deploymentRows.find((deployment) => !deployment.endDate) ?? null;

  return {
    ...row,
    currentEmployeeId: current?.employeeId ?? null,
    currentEmployeeName: current ? formatEmployeeName(current) : null,
    deployments,
  };
}

/**
 * `{id, name}` for every active employee, for the device deployment form's
 * employee picker. Unauthorized by design, same trust model as
 * `listLookupOptions` in `src/server/maintenance/queries.ts` — the wrapping
 * action (`fetchEmployeeOptionsForDeployment` in `./actions.ts`) gates it on
 * `devices:edit`, not `employees:read`, so a devices-only admin isn't
 * blocked from assigning devices.
 */
export async function listEmployeeOptions(): Promise<EmployeeOption[]> {
  const rows = await db
    .select({
      id: employee.id,
      firstName: employee.firstName,
      middleName: employee.middleName,
      lastName: employee.lastName,
    })
    .from(employee)
    .where(eq(employee.isResigned, false))
    .orderBy(asc(employee.lastName), asc(employee.firstName));

  return rows.map((row) => ({ id: row.id, name: formatEmployeeName(row) }));
}
