import type { CertificationFilters, CertificationMonitoringFilters } from "./types";

/** Shared between the server page (prefetch) and the client view (read/invalidate). */
export const myCertificationsQueryKey = (filters: CertificationFilters) =>
  ["certifications", "list", filters] as const;
export const myCertificationQueryKey = (id: string) => ["certifications", "detail", id] as const;

export const certificationMonitoringQueryKey = (filters: CertificationMonitoringFilters) =>
  ["certifications", "monitoring", filters] as const;
export const certificationMonitoringEmployeeOptionsQueryKey = () =>
  ["certifications", "monitoring", "employee-options"] as const;
