import {
  File,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  Presentation,
  type LucideIcon,
} from "lucide-react";

export type DocumentKind =
  | "folder"
  | "pdf"
  | "word"
  | "excel"
  | "powerpoint"
  | "image"
  | "archive"
  | "text"
  | "other";

const EXTENSION_KINDS: Record<string, DocumentKind> = {
  pdf: "pdf",
  doc: "word",
  docx: "word",
  xls: "excel",
  xlsx: "excel",
  csv: "excel",
  ppt: "powerpoint",
  pptx: "powerpoint",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  svg: "image",
  zip: "archive",
  rar: "archive",
  "7z": "archive",
  txt: "text",
  md: "text",
};

/** Extension first (more reliable across browsers/OSes than a possibly-generic `application/octet-stream` MIME type), MIME type as a fallback. */
export function getDocumentKind(name: string, mimeType: string | null, isFolder: boolean): DocumentKind {
  if (isFolder) return "folder";

  const extension = name.split(".").pop()?.toLowerCase();
  if (extension && extension in EXTENSION_KINDS) return EXTENSION_KINDS[extension];

  if (mimeType?.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType?.includes("wordprocessingml") || mimeType === "application/msword") return "word";
  if (mimeType?.includes("spreadsheetml") || mimeType === "application/vnd.ms-excel") return "excel";
  if (mimeType?.includes("presentationml") || mimeType === "application/vnd.ms-powerpoint") return "powerpoint";
  if (mimeType?.startsWith("text/")) return "text";

  return "other";
}

export const DOCUMENT_KIND_ICONS: Record<DocumentKind, LucideIcon> = {
  folder: Folder,
  pdf: FileText,
  word: FileText,
  excel: FileSpreadsheet,
  powerpoint: Presentation,
  image: FileImage,
  archive: FileArchive,
  text: FileText,
  other: File,
};

/** Distinct per kind so a document list reads at a glance, same spirit as `columnColor` cycling for Kanban status. Folder uses the brand color; files use fixed, meaningful hues rather than a cycling palette since "kind" is identity, not an ordinal series. */
export const DOCUMENT_KIND_COLOR_CLASSNAME: Record<DocumentKind, string> = {
  folder: "text-brand",
  pdf: "text-destructive",
  word: "text-info",
  excel: "text-success",
  powerpoint: "text-warning",
  image: "text-chart-5",
  archive: "text-muted-foreground",
  text: "text-muted-foreground",
  other: "text-muted-foreground",
};

/** Whether a browser can render this kind natively (used to decide the download route's Content-Disposition and the UI's "Preview" vs. "Download" action). */
export function isBrowserViewable(kind: DocumentKind): boolean {
  return kind === "pdf" || kind === "image" || kind === "text";
}

/**
 * Storage-key building for the on-disk document store (see
 * `document-storage.ts`). The relative path shape mirrors where this is
 * planned to migrate to under SharePoint later — see `docs/DOCUMENTS.md` —
 * so only the storage backend changes when that integration lands, not this
 * naming.
 */
export function projectDocumentsPrefix(projectId: string): string {
  return `Documents/One-Lot Project/${projectId}/documents`;
}

const CONTROL_CHAR_MAX_CODE = 31;

/**
 * Strips path separators, control characters, and SharePoint's reserved
 * filename characters (`" * : < > ? |`, on top of `/` and `\`) so a
 * user-typed file/folder name can never introduce an extra path segment
 * into the stored key, or get rejected outright by Graph once it's the
 * storage backend. This is also a correctness fix on Windows, where the
 * same reserved-character set is invalid regardless of SharePoint.
 * Ordinary spaces, hyphens, and unicode in the visible name are left alone.
 */
export function sanitizeDocumentName(name: string): string {
  return Array.from(name.replace(/[/\\"*:<>?|]/g, "-"))
    .filter((char) => char.charCodeAt(0) > CONTROL_CHAR_MAX_CODE)
    .join("")
    .trim();
}

/** Builds this document's on-disk storage key (relative to the storage root). `documentId` prefixes the stored filename so two same-named files (different folders, or a renamed file) never collide on disk — the DB row is what users see and rename, this key never changes after upload. */
export function buildDocumentStorageKey(projectId: string, documentId: string, fileName: string): string {
  return `${projectDocumentsPrefix(projectId)}/${documentId}-${sanitizeDocumentName(fileName)}`;
}
