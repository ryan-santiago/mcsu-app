import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { Metadata } from "next";

import { ApprovalsView } from "@/components/change-requests/approvals-view";
import { PageHeader } from "@/components/layout/page-header";
import { requirePermission } from "@/lib/session";
import { listChangeRequests } from "@/server/change-requests/queries";
import { changeRequestsQueryKey } from "@/server/change-requests/query-key";

export const metadata: Metadata = {
  title: "Approvals",
};

export default async function ApprovalsPage() {
  const actor = await requirePermission("employees:edit");

  const queryClient = new QueryClient();
  const initialFilters = { status: "pending" as const, page: 1, pageSize: 20 };
  await queryClient.prefetchQuery({
    queryKey: changeRequestsQueryKey(initialFilters),
    queryFn: () => listChangeRequests(initialFilters),
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        title="Approvals"
        description="Review self-service profile changes employees have requested about themselves."
      />

      <HydrationBoundary state={dehydrate(queryClient)}>
        <ApprovalsView actor={actor} />
      </HydrationBoundary>
    </div>
  );
}
