/** Shared between the server page (prefetch) and the client view (read/invalidate). */
export const recommendationQueueQueryKey = () => ["employee-recommendations", "queue"] as const;

export const recommendationEmployeeOptionsQueryKey = () => ["employee-recommendations", "employee-options"] as const;

export const recommendationSnapshotQueryKey = (employeeId: string) =>
  ["employee-recommendations", "snapshot", employeeId] as const;

export const recommendationByIdQueryKey = (id: string) => ["employee-recommendations", "detail", id] as const;

export const recommendationsInProgressQueryKey = () => ["employee-recommendations", "in-progress"] as const;

export const pendingApprovalsQueryKey = () => ["employee-recommendations", "pending-approvals"] as const;
