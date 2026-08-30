import type { Metadata } from "next";

import { CertificationForm } from "@/components/certifications/certification-form";
import { PageHeader } from "@/components/layout/page-header";
import { isDocumentStorageAvailable } from "@/lib/document-storage";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Add certification",
};

export default async function NewCertificationPage() {
  await requireUser();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader title="Add certification" description="A badge or certificate you've earned." />

      <CertificationForm mode="create" storageAvailable={isDocumentStorageAvailable()} />
    </div>
  );
}
