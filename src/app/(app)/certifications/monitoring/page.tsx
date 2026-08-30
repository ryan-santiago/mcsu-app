import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { Metadata } from "next";

import { CertificationMonitoringView } from "@/components/certifications/certification-monitoring-view";
import { PageHeader } from "@/components/layout/page-header";
import { requirePermission } from "@/lib/session";
import { listCertificationsForMonitoring } from "@/server/certifications/queries";
import { certificationMonitoringQueryKey } from "@/server/certifications/query-key";
import type { CertificationMonitoringFilters } from "@/server/certifications/types";

export const metadata: Metadata = {
  title: "Certifications Monitoring",
};

export default async function CertificationMonitoringPage() {
  await requirePermission("certifications:read_all");

  const initialFilters: CertificationMonitoringFilters = {};

  const queryClient = new QueryClient();
  await queryClient.prefetchQuery({
    queryKey: certificationMonitoringQueryKey(initialFilters),
    queryFn: () => listCertificationsForMonitoring(initialFilters),
  });

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="Certifications Monitoring"
        description="Every employee's badges and certificates, in one place."
      />

      <HydrationBoundary state={dehydrate(queryClient)}>
        <CertificationMonitoringView initialFilters={initialFilters} />
      </HydrationBoundary>
    </div>
  );
}
