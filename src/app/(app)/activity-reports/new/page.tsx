import type { Metadata } from "next";

import { ActivityReportForm } from "@/components/activity-reports/activity-report-form";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Add activity report",
};

export default async function NewActivityReportPage() {
  await requireUser();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title="Add activity report"
        description="One entry per date — add every activity you worked on that day."
      />

      <ActivityReportForm mode="create" />
    </div>
  );
}
