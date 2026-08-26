import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { TaRequestForm } from "@/components/talent-acquisition/ta-request-form";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = {
  title: "New request",
};

export default async function NewTaRequestPage() {
  await requirePermission("talent_acquisition:write");

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <PageHeader
        title="New request"
        description="Request headcount for a Position and Level combination, at a given Client and work setup."
      />

      <TaRequestForm />
    </div>
  );
}
