import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { Metadata } from "next";

import { AuditView } from "@/components/audit/audit-view";
import { PageHeader } from "@/components/layout/page-header";
import { defaultAuditRange } from "@/lib/audit-registry";
import { requirePermission } from "@/lib/session";
import { listAuditEntries } from "@/server/audit/queries";
import { auditQueryKey } from "@/server/audit/query-key";
import type { AuditFilters } from "@/server/audit/types";

export const metadata: Metadata = {
  title: "Audit Trail",
};

const PAGE_SIZE = 25;

/**
 * Administrator-only — see `src/lib/rbac.ts`, `audit:read` is not granted to
 * Manager. Server-renders the first page (last 30 days) and hands it to
 * TanStack Query via `HydrationBoundary`, same pattern as
 * `src/app/(app)/admin/users/page.tsx`.
 */
export default async function AuditTrailPage() {
  await requirePermission("audit:read");

  const range = defaultAuditRange();
  const initialFilters: AuditFilters = {
    from: range.from,
    to: range.to,
    module: "all",
    action: "all",
    page: 1,
    pageSize: PAGE_SIZE,
  };

  const queryClient = new QueryClient();
  await queryClient.prefetchQuery({
    queryKey: auditQueryKey(initialFilters),
    queryFn: () => listAuditEntries(initialFilters),
  });

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="Audit Trail"
        description="Every change across the console — who changed what, from what, to what, and when."
      />

      <HydrationBoundary state={dehydrate(queryClient)}>
        <AuditView />
      </HydrationBoundary>
    </div>
  );
}
