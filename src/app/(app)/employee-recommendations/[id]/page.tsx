import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { RecommendationForm } from "@/components/employee-recommendations/recommendation-form";
import { PageHeader } from "@/components/layout/page-header";
import { requirePermission } from "@/lib/session";
import { getRecommendationById } from "@/server/employee-recommendations/queries";
import { recommendationByIdQueryKey } from "@/server/employee-recommendations/query-key";

export const metadata: Metadata = {
  title: "Employee Recommendation",
};

export default async function EmployeeRecommendationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("employee_recommendations:read");
  const { id } = await params;

  const queryClient = new QueryClient();
  await queryClient.prefetchQuery({
    queryKey: recommendationByIdQueryKey(id),
    queryFn: () => getRecommendationById(id),
  });

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="space-y-2">
        <Link
          href="/employee-recommendations"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Employee Recommendation
        </Link>
        <PageHeader title="Recommendation" />
      </div>

      <HydrationBoundary state={dehydrate(queryClient)}>
        <RecommendationForm id={id} />
      </HydrationBoundary>
    </div>
  );
}
