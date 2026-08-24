import { FolderX } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { OneLotProjectDocumentsExplorer } from "@/components/one-lot-projects/documents/one-lot-project-documents-explorer";
import { isDocumentStorageAvailable } from "@/lib/document-storage";
import { requireUser } from "@/lib/session";
import { getOneLotProjectDocumentFolder } from "@/server/one-lot-projects/document-queries";
import { getOneLotProjectById } from "@/server/one-lot-projects/queries";

export const metadata: Metadata = { title: "Documents" };

type OneLotProjectDocumentsPageProps = {
  params: Promise<{ id: string }>;
};

export default async function OneLotProjectDocumentsPage({ params }: OneLotProjectDocumentsPageProps) {
  const { id } = await params;
  const actor = await requireUser();
  const project = await getOneLotProjectById(id, actor);
  if (!project) notFound();

  if (!isDocumentStorageAvailable()) {
    return (
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <PageHeader title={project.name} description="Documents" />
        <EmptyState
          icon={FolderX}
          title="Document storage isn't available here"
          description="Docs stores files on local disk, which only works on a persistent server (self-hosted or EC2) — not this environment. See docs/DOCUMENTS.md."
        />
      </div>
    );
  }

  const folder = await getOneLotProjectDocumentFolder(id, null, actor);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader title={project.name} description="Documents" />
      <OneLotProjectDocumentsExplorer projectId={id} initialFolder={folder} />
    </div>
  );
}
