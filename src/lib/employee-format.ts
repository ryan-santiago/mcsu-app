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

/**
 * First-and-last-only display name for identity-style UI (topbar, user
 * lists) — as opposed to `formatEmployeeName`'s "LASTNAME, First M." form
 * used in HR tables. No middle name, by design.
 * `formatEmployeeDisplayName({ firstName: "Juan", lastName: "Dela Cruz" })` → "Juan Dela Cruz"
 */
export function formatEmployeeDisplayName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName.trim()} ${person.lastName.trim()}`;
}


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
  const amount = typeof value === "string" ? Number(String(value).replace(/,/g, "")) : value;
  return Number.isNaN(amount) ? "—" : currencyFormatter.format(amount);
}

/**
 * Live thousands-grouping for a money `<Input>` as the user types — e.g.
 * `formatMoneyInput("4000000")` → `"4,000,000"`. Keeps at most one decimal
 * point and strips anything else non-numeric, so pasted or mid-edit input
 * never produces garbage. The comma-formatted string is what stays in
 * react-hook-form state; `moneySchema` (`src/lib/validation/project.ts`)
 * strips the commas back out on submit.
 */
export function formatMoneyInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const firstDot = cleaned.indexOf(".");
  const [wholePart, decimalPart] =
    firstDot === -1
      ? [cleaned, undefined]
      : [cleaned.slice(0, firstDot), cleaned.slice(firstDot + 1).replace(/\./g, "")];
  const grouped = wholePart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decimalPart === undefined ? grouped : `${grouped}.${decimalPart}`;
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
