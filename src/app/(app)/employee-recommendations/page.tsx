import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { Metadata } from "next";

import { EmployeeRecommendationsView } from "@/components/employee-recommendations/employee-recommendations-view";
import { PageHeader } from "@/components/layout/page-header";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { listPendingApprovalsForActor, listRecommendationQueue, listRecommendations } from "@/server/employee-recommendations/queries";
import {
  pendingApprovalsQueryKey,
  recommendationQueueQueryKey,
  recommendationsInProgressQueryKey,
} from "@/server/employee-recommendations/query-key";

export const metadata: Metadata = {
  title: "Employee Recommendation",
};

export default async function EmployeeRecommendationsPage() {
  const actor = await requirePermission("employee_recommendations:read");
  const canApprove = can(actor, "employee_recommendations:approve");

  const queryClient = new QueryClient();
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: recommendationQueueQueryKey(),
      queryFn: () => listRecommendationQueue(),
    }),
    queryClient.prefetchQuery({
      queryKey: recommendationsInProgressQueryKey(),
      queryFn: () => listRecommendations(),
    }),
    canApprove
      ? queryClient.prefetchQuery({
          queryKey: pendingApprovalsQueryKey(),
          queryFn: () => listPendingApprovalsForActor(),
        })
      : Promise.resolve(),
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        title="Employee Recommendation"
        description="Employees whose Project Hired contract or Probationary period is coming up for renewal, and who needs an Employee Recommendation Form."
      />

      <HydrationBoundary state={dehydrate(queryClient)}>
        <EmployeeRecommendationsView canCreate={can(actor, "employee_recommendations:edit")} canApprove={canApprove} />
      </HydrationBoundary>
    </div>
  );
}
