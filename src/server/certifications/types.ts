export type CertificationRow = {
  id: string;
  title: string;
  dateAcquired: string;
  credentialUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
};

export type CertificationFilters = {
  search?: string;
  /** `yyyy-MM-dd`. */
  from?: string;
  /** `yyyy-MM-dd`. */
  to?: string;
  /** 1-indexed. */
  page?: number;
  pageSize?: number;
};

export type CertificationListResult = {
  certifications: CertificationRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type CertificationDetail = CertificationRow & {
  employeeId: string;
  mimeType: string | null;
};

/**
 * Server-only shape used by the authenticated download route handler —
 * carries `storageKey`, which `CertificationDetail` deliberately omits since
 * that type is safe to return to the client (`fetchMyCertification`) and a
 * raw disk path never should be.
 */
export type CertificationDownloadRecord = CertificationDetail & {
  storageKey: string | null;
};

export type CertificationMonitoringFilters = {
  employeeId?: string;
  /** `yyyy-MM-dd`. */
  from?: string;
  /** `yyyy-MM-dd`. */
  to?: string;
  /** 1-indexed. */
  page?: number;
  pageSize?: number;
};

export type CertificationMonitoringRow = CertificationRow & {
  employeeId: string;
  employeeName: string;
  teamName: string | null;
};

export type CertificationMonitoringListResult = {
  certifications: CertificationMonitoringRow[];
  total: number;
  page: number;
  pageSize: number;
};
