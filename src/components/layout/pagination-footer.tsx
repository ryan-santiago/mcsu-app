import { Button } from "@/components/ui/button";

type PaginationFooterProps = {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  /** Singular noun for the count, e.g. "user", "employee", "client". */
  itemLabel: string;
};

/**
 * The Previous/Next pager shared by every paginated list in the console —
 * Users, Employees, each Maintenance lookup, and the Audit Trail. One
 * implementation means a future list gets consistent pagination for free
 * instead of a fifth copy of this markup.
 */
export function PaginationFooter({ total, page, pageSize, onPageChange, itemLabel }: PaginationFooterProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (total === 0) return null;

  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-muted-foreground text-sm">
        {total.toLocaleString()} {total === 1 ? itemLabel : `${itemLabel}s`}
      </p>
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground text-sm">
          Page {page} of {totalPages}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
