import type { EmployeeAddressType, EmploymentType } from "@/db/schema";

export type EmployeeListRow = {
  id: string;
  code: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  latestLevel: string | null;
  latestPosition: string | null;
  latestClient: string | null;
  latestProject: string | null;
  currentAddress: { barangayName: string; cityName: string } | null;
};

export type EmployeeFilters = {
  search?: string;
  /** 1-indexed. */
  page?: number;
  pageSize?: number;
};

export type EmployeeListResult = {
  employees: EmployeeListRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type EmployeeAddressDetail = {
  id: string;
  type: EmployeeAddressType;
  regionCode: string;
  regionName: string;
  provinceCode: string | null;
  provinceName: string | null;
  cityCode: string;
  cityName: string;
  barangayCode: string;
  barangayName: string;
  addressLine: string;
};

export type EmploymentRecordRow = {
  id: string;
  salary: string;
  levelId: string;
  levelName: string;
  positionId: string;
  positionName: string;
  employmentType: EmploymentType;
  startDate: string;
  endDate: string | null;
};

export type DeploymentRecordRow = {
  id: string;
  clientId: string;
  clientName: string;
  project: string;
  startDate: string;
  endDate: string | null;
};

export type EmployeeDetail = {
  id: string;
  code: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  genderId: string;
  genderName: string;
  mobileNumber: string;
  viberNumber: string | null;
  personalEmail: string | null;
  workEmail: string | null;
  teamId: string | null;
  teamName: string | null;
  currentAddress: EmployeeAddressDetail | null;
  permanentAddress: EmployeeAddressDetail | null;
  employments: EmploymentRecordRow[];
  deployments: DeploymentRecordRow[];
};
