import type { EmployeeFilters } from "./types";

/** Shared between the server page (prefetch) and the client view (read/invalidate). */
export const employeesQueryKey = (filters: EmployeeFilters) => ["employees", "list", filters] as const;
export const employeeQueryKey = (id: string) => ["employees", "detail", id] as const;
