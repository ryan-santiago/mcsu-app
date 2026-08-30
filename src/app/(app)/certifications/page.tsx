import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { Metadata } from "next";

import { CertificationsView } from "@/components/certifications/certifications-view";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/lib/session";
import { listMyCertifications } from "@/server/certifications/queries";
import { myCertificationsQueryKey } from "@/server/certifications/query-key";
import type { CertificationFilters } from "@/server/certifications/types";

export const metadata: Metadata = {
  title: "Certifications",
};

/** No `requirePermission()` — every active signed-in user manages their own certifications. */
export default async function CertificationsPage() {
  await requireUser();

  const initialFilters: CertificationFilters = {};

  const queryClient = new QueryClient();
  await queryClient.prefetchQuery({
    queryKey: myCertificationsQueryKey(initialFilters),
    queryFn: () => listMyCertifications(initialFilters),
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader title="Certifications" description="Your badges and certificates — training completed, credentials earned." />

      <HydrationBoundary state={dehydrate(queryClient)}>
        <CertificationsView initialFilters={initialFilters} />
      </HydrationBoundary>
    </div>
  );
}
