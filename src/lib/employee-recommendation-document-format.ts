/**
 * Storage-key building for the KPI Result PDF and generated ERF — local
 * disk today, SharePoint later, same seam as
 * `one-lot-project-document-format.ts`. The `Documents/` root matches that
 * file's `projectDocumentsPrefix()` on purpose — both are meant to land
 * under the same eventual SharePoint "Documents" library (see
 * docs/DOCUMENTS.md's IT-ask #1), just under a different top-level folder.
 * Unlike One-Lot Docs, there's exactly one file of each kind per
 * recommendation and it's always a PDF, so each key is fixed and
 * predictable rather than `{documentId}-{fileName}` — nothing needs to
 * parse a filename back out of it. See docs/EMPLOYEE_RECOMMENDATION.md §7.
 */
function employeeRecommendationDocumentsPrefix(recommendationId: string): string {
  return `Documents/Employee Recommendation/${recommendationId}`;
}

export function kpiResultStorageKey(recommendationId: string): string {
  return `${employeeRecommendationDocumentsPrefix(recommendationId)}/kpi-result.pdf`;
}

/** The generated ERF — a saved copy of exactly what was sent to HRD, since the live data could change after the fact. */
export function erfStorageKey(recommendationId: string): string {
  return `${employeeRecommendationDocumentsPrefix(recommendationId)}/erf.pdf`;
}
