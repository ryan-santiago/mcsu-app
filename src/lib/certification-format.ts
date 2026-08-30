const CONTROL_CHAR_MAX_CODE = 31;

/**
 * Strips path separators and control characters so a user-typed file name
 * can never introduce an extra path segment into the stored key — same
 * defense as `sanitizeDocumentName` in `one-lot-project-document-format.ts`,
 * duplicated rather than imported so Certifications' storage plumbing stays
 * independent of One-Lot Project's (see AGENTS.md/docs/DOCUMENTS.md — that
 * module's helpers are named for its own future SharePoint migration plan).
 */
export function sanitizeCertificationFileName(name: string): string {
  return Array.from(name.replace(/[/\\]/g, "-"))
    .filter((char) => char.charCodeAt(0) > CONTROL_CHAR_MAX_CODE)
    .join("")
    .trim();
}

export function certificationDocumentsPrefix(employeeId: string): string {
  return `Documents/Certifications/${employeeId}`;
}

/** Builds a certification's on-disk storage key (relative to the storage root) — `certificationId`-prefixed so two same-named uploads never collide on disk. The DB row's `fileName` is what users see, this key never changes after upload. */
export function buildCertificationStorageKey(employeeId: string, certificationId: string, fileName: string): string {
  return `${certificationDocumentsPrefix(employeeId)}/${certificationId}-${sanitizeCertificationFileName(fileName)}`;
}
