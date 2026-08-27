/**
 * Storage-key building for the KPI Result PDF — local disk today,
 * SharePoint later, same seam as `one-lot-project-document-format.ts`. The
 * `Documents/` root matches that file's `projectDocumentsPrefix()` on
 * purpose — both are meant to land under the same eventual SharePoint
 * "Documents" library (see docs/DOCUMENTS.md's IT-ask #1), just under a
 * different top-level folder. There's exactly one KPI Result file per
 * recommendation and it's always a PDF, so the key is fixed and
 * predictable rather than `{documentId}-{fileName}` — nothing needs to
 * parse a filename back out of it. See docs/EMPLOYEE_RECOMMENDATION.md §7.
 *
 * The generated ERF has no storage key here — it's rendered client-side and
 * downloaded directly, never written to disk (see `employee-recommendation-pdf.ts`).
 */
export function kpiResultStorageKey(recommendationId: string): string {
  return `Documents/Employee Recommendation/${recommendationId}/kpi-result.pdf`;
}
