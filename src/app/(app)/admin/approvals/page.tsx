import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { ApprovalsView } from "@/components/change-requests/approvals-view";
import { PendingApprovalsView } from "@/components/employee-recommendations/pending-approvals-view";
import { PageHeader } from "@/components/layout/page-header";
import { can, canAny } from "@/lib/rbac";
import { requireUser } from "@/lib/session";
import { listChangeRequests } from "@/server/change-requests/queries";
import { changeRequestsQueryKey } from "@/server/change-requests/query-key";
import { listPendingApprovalsForActor } from "@/server/employee-recommendations/queries";
import { pendingApprovalsQueryKey } from "@/server/employee-recommendations/query-key";

export const metadata: Metadata = {
  title: "Approvals",
};

/**
 * The unified approvals inbox — one page for whatever's waiting on a
 * reviewer, across the two entity types that write into the generic
 * `approvalRequest`/`approvalStep` engine today (see
 * docs/EMPLOYEE_RECOMMENDATION.md §12 step 7 / §13). The two sections stay
 * genuinely separate rather than merged into one table: Change Requests are
 * pool-approved (any `employees:edit` holder in scope) with a single
 * decision that closes the whole request, while Employee Recommendation
 * steps are addressed to one named approver and may be one of several
 * sequential steps — different enough gating and action shapes that forcing
 * them into one row type would cost more than it'd save. Each section is
 * shown only to whoever actually holds the matching permission, so a Unit
 * Manager/Department Head (who typically has `employee_recommendations:approve`
 * but not `employees:edit`) still reaches this page and sees real work,
 * just not the Change Requests half.
 */
export default async function ApprovalsPage() {
  const actor = await requireUser();
  if (!canAny(actor, ["employees:edit", "employee_recommendations:approve"])) forbidden();

  const canReviewChangeRequests = can(actor, "employees:edit");
  const canReviewRecommendations = can(actor, "employee_recommendations:approve");

  const queryClient = new QueryClient();
  const initialFilters = { status: "pending" as const, page: 1, pageSize: 20 };
  await Promise.all([
    canReviewChangeRequests
      ? queryClient.prefetchQuery({
          queryKey: changeRequestsQueryKey(initialFilters),
          queryFn: () => listChangeRequests(initialFilters),
        })
      : Promise.resolve(),
    canReviewRecommendations
      ? queryClient.prefetchQuery({
          queryKey: pendingApprovalsQueryKey(),
          queryFn: () => listPendingApprovalsForActor(),
        })
      : Promise.resolve(),
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <PageHeader title="Approvals" description="Everything waiting on your review, in one place." />

      <HydrationBoundary state={dehydrate(queryClient)}>
        {canReviewRecommendations ? (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold">Employee Recommendation</h2>
            <PendingApprovalsView />
          </div>
        ) : null}

        {canReviewChangeRequests ? (
          <div className="space-y-3">
            {canReviewRecommendations ? <h2 className="text-sm font-semibold">Change Requests</h2> : null}
            <ApprovalsView actor={actor} />
          </div>
        ) : null}
      </HydrationBoundary>
    </div>
  );
}
