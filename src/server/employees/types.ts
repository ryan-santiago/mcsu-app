import type { EmployeeAddressType } from "@/db/schema";

export type EmployeeListRow = {
  id: string;
  code: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
  latestLevel: string | null;
  latestPosition: string | null;
  latestEmploymentType: string | null;
  latestClient: string | null;
  latestProject: string | null;
  currentAddress: { barangayName: string; cityName: string } | null;
  isResigned: boolean;
};

export type EmployeeFilters = {
  search?: string;
  /** Resigned employees are excluded unless this is true. */
  includeResigned?: boolean;
  /** Matches the employee's latest deployment's client. Omitted/"all" = no filter. */
  clientId?: string;
  /** Matches the employee's latest employment record's type (an Employment Type lookup id). Omitted/"all" = no filter. */
  employmentTypeId?: string;
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
  communicationAllowance: string;
  transportationAllowance: string;
  levelId: string;
  levelName: string;
  positionId: string;
  positionName: string;
  employmentTypeId: string;
  employmentTypeName: string;
  startDate: string;
  endDate: string | null;
};

export type DeploymentRecordRow = {
  id: string;
  clientId: string;
  clientName: string;
  projectId: string;
  projectName: string;
  startDate: string;
  endDate: string | null;
};

export type EmployeeDetail = {
  id: string;
  code: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
  genderId: string;
  genderName: string;
  mobileNumber: string;
  viberNumber: string | null;
  personalEmail: string | null;
  workEmail: string;
  teamId: string | null;
  teamName: string | null;
  resignationDate: string | null;
  reasonForLeaving: string | null;
  isResigned: boolean;
  currentAddress: EmployeeAddressDetail | null;
  permanentAddress: EmployeeAddressDetail | null;
  employments: EmploymentRecordRow[];
  deployments: DeploymentRecordRow[];
};
