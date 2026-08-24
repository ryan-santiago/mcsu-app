import type { OneLotProjectDocumentType } from "@/db/schema";

export type DocumentRow = {
  id: string;
  parentId: string | null;
  type: OneLotProjectDocumentType;
  name: string;
  mimeType: string | null;
  size: number | null;
  uploadedByName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DocumentBreadcrumb = { id: string; name: string };

export type DocumentFolderData = {
  currentFolderId: string | null;
  breadcrumbs: DocumentBreadcrumb[];
  items: DocumentRow[];
};
