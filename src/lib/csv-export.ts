/**
 * The app's first CSV export — a small, generic, client-side utility. Same
 * "generate entirely in the browser, no server round trip beyond the row
 * data itself" pattern as `generateActivityReportPdf()`
 * (`src/lib/activity-report-pdf.ts`): CSV is just string-building plus a
 * Blob download, both browser-native, so no new dependency is needed.
 */

export type CsvColumn<T> = {
  header: string;
  /** Returns the raw cell value — escaping/quoting happens in `buildCsv`, not here. */
  accessor: (row: T) => string | number | null | undefined;
};

function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const UTF8_BOM = "﻿";

/**
 * Builds an RFC-4180-shaped CSV string (CRLF rows, quoted fields where
 * needed) from typed rows and a column spec. Leading UTF-8 BOM so Excel
 * opens accented/non-ASCII names correctly instead of mojibake.
 */
export function buildCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const headerLine = columns.map((c) => escapeCsvField(c.header)).join(",");
  const rowLines = rows.map((row) => columns.map((c) => escapeCsvField(String(c.accessor(row) ?? ""))).join(","));
  return UTF8_BOM + [headerLine, ...rowLines].join("\r\n");
}

/**
 * Triggers a browser download of a pre-built CSV string via an in-memory
 * Blob and a synthetic anchor click — no server involvement, same trigger
 * mechanism as jsPDF's own `pdf.save()`.
 */
export function downloadCsv(fileName: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
