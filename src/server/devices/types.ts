import type { DeviceStatus, DeviceType } from "@/db/schema";

export type { DeviceStatus, DeviceType };

export type DeviceListRow = {
  id: string;
  deviceType: DeviceType;
  brand: string;
  model: string;
  os: string;
  serialNumber: string;
  purchaseDate: string;
  status: DeviceStatus;
  remarks: string | null;
  currentEmployeeId: string | null;
  currentEmployeeName: string | null;
};

export type DeviceFilters = {
  search?: string;
  deviceType?: DeviceType;
  status?: DeviceStatus;
  /** 1-indexed. */
  page?: number;
  pageSize?: number;
};

export type DeviceListResult = {
  devices: DeviceListRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type DeviceDeploymentRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  startDate: string;
  endDate: string | null;
};

export type DeviceDetail = {
  id: string;
  deviceType: DeviceType;
  brand: string;
  model: string;
  os: string;
  serialNumber: string;
  purchaseDate: string;
  status: DeviceStatus;
  remarks: string | null;
  currentEmployeeId: string | null;
  currentEmployeeName: string | null;
  deployments: DeviceDeploymentRow[];
};

export type EmployeeOption = {
  id: string;
  name: string;
};
