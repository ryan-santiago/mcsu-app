import type { EmploymentType } from "@/db/schema";

/** `formatEmployeeName({ lastName: "Dela Cruz", firstName: "Juan", middleName: "Fernandez" })` → "DELA CRUZ, Juan F." */
export function formatEmployeeName(person: {
  firstName: string;
  middleName?: string | null;
  lastName: string;
}): string {
  const middle = person.middleName?.trim();
  const initial = middle ? `${middle.charAt(0).toUpperCase()}.` : "";
  return `${person.lastName.trim().toUpperCase()}, ${person.firstName.trim()}${initial ? ` ${initial}` : ""}`;
}

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  regular: "Regular",
  probationary: "Probationary",
  contractual: "Contractual",
  project_based: "Project-based",
  consultant: "Consultant",
  intern: "Intern",
};

export function formatAddressSummary(
  address: { barangayName: string; cityName: string } | null | undefined,
): string {
  if (!address) return "—";
  return `${address.barangayName}, ${address.cityName}`;
}

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 2,
});

export function formatSalary(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const amount = typeof value === "string" ? Number(value) : value;
  return Number.isNaN(amount) ? "—" : currencyFormatter.format(amount);
}

const periodDateFormatter = new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "short", year: "numeric" });

/** `formatPeriod("2024-01-15", null)` → "15 Jan 2024 – Present" */
export function formatPeriod(startDate: string, endDate: string | null): string {
  const start = periodDateFormatter.format(new Date(`${startDate}T00:00:00`));
  const end = endDate ? periodDateFormatter.format(new Date(`${endDate}T00:00:00`)) : "Present";
  return `${start} – ${end}`;
}

export type HistorySortOrder = "latest" | "oldest";

/**
 * Sorts employment/deployment records by start date, with the open-ended
 * ("Present") record always treated as the most recent regardless of its
 * start date — matching how `listEmployees`/`getEmployeeById` already order
 * them server-side. Client-side because the sort direction is a view
 * preference, not something worth a round trip.
 */
export function sortHistoryRecords<T extends { startDate: string; endDate: string | null }>(
  records: T[],
  order: HistorySortOrder,
): T[] {
  const sorted = [...records].sort((a, b) => {
    if (!a.endDate && b.endDate) return -1;
    if (a.endDate && !b.endDate) return 1;
    return a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : 0;
  });
  return order === "latest" ? sorted : sorted.reverse();
}
