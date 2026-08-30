import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CertificationDetailView } from "@/components/certifications/certification-detail-view";
import { PageHeader } from "@/components/layout/page-header";
import { isDocumentStorageAvailable } from "@/lib/document-storage";
import { requireUser } from "@/lib/session";
import { getMyCertificationById } from "@/server/certifications/queries";
import { myCertificationQueryKey } from "@/server/certifications/query-key";

type CertificationDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: CertificationDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const record = await getMyCertificationById(id);
  return { title: record ? record.title : "Certification" };
}

export default async function CertificationDetailPage({ params }: CertificationDetailPageProps) {
  await requireUser();
  const { id } = await params;

  const queryClient = new QueryClient();
  const record = await queryClient.fetchQuery({
    queryKey: myCertificationQueryKey(id),
    queryFn: () => getMyCertificationById(id),
  });

  if (!record) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader title="View / Edit Certification" description="Update this certification's details or attachment." />

      <HydrationBoundary state={dehydrate(queryClient)}>
        <CertificationDetailView certificationId={id} storageAvailable={isDocumentStorageAvailable()} />
      </HydrationBoundary>
    </div>
  );
}
