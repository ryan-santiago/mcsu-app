"use client";

import { useQuery } from "@tanstack/react-query";
import { Award, RotateCcw } from "lucide-react";

import { CertificationForm } from "@/components/certifications/certification-form";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchMyCertification } from "@/server/certifications/actions";
import { myCertificationQueryKey } from "@/server/certifications/query-key";
import type { CertificationDetail } from "@/server/certifications/types";

type CertificationDetailViewProps = {
  certificationId: string;
  storageAvailable: boolean;
};

export function CertificationDetailView({ certificationId, storageAvailable }: CertificationDetailViewProps) {
  const { data, isPending, isError, refetch } = useQuery<CertificationDetail | null>({
    queryKey: myCertificationQueryKey(certificationId),
    queryFn: () => fetchMyCertification(certificationId),
  });

  if (isPending) {
    return <Skeleton className="h-96 w-full rounded-xl" />;
  }

  if (isError) {
    return (
      <div className="border-destructive/30 bg-destructive/5 flex items-center justify-between gap-4 rounded-lg border p-4">
        <p className="text-destructive text-sm">Could not load this certification.</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          <RotateCcw className="size-4" aria-hidden />
          Retry
        </Button>
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState icon={Award} title="Certification not found" description="This entry may have been removed." />
    );
  }

  return (
    <CertificationForm
      mode="edit"
      certificationId={certificationId}
      initialData={data}
      storageAvailable={storageAvailable}
    />
  );
}
