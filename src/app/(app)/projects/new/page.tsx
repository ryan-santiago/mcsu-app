import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { ProjectForm } from "@/components/projects/project-form";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = {
  title: "Add project",
};

export default async function NewProjectPage() {
  await requirePermission("projects:write");

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader
        title="Add project"
        description="Save the S3P identity first — financial details can be added once the record exists."
      />

      <ProjectForm mode="create" />
    </div>
  );
}
