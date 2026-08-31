const CONTROL_CHAR_MAX_CODE = 31;

/**
 * Strips path separators and control characters so a user-typed file name
 * can never introduce an extra path segment into the stored key — same
 * defense as `sanitizeCertificationFileName` in `certification-format.ts`,
 * duplicated rather than imported so this module's storage plumbing stays
 * independent of Certifications' (see AGENTS.md/docs/DOCUMENTS.md).
 */
export function sanitizeAvatarFileName(name: string): string {
  return Array.from(name.replace(/[/\\]/g, "-"))
    .filter((char) => char.charCodeAt(0) > CONTROL_CHAR_MAX_CODE)
    .join("")
    .trim();
}

/** Builds a user's avatar storage key (relative to the storage root) — a fixed one-per-user slot, so re-uploading with a different file name still produces a new key (old file cleaned up by the caller). */
export function buildAvatarStorageKey(userId: string, fileName: string): string {
  return `Documents/Users/${userId}/avatar-${sanitizeAvatarFileName(fileName)}`;
}
