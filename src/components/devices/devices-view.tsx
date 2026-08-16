"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Laptop, MoreHorizontal, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DeviceStatusBadge, DeviceTypeBadge } from "@/components/devices/device-badges";
import { EmptyState } from "@/components/layout/empty-state";
import { PaginationFooter } from "@/components/layout/pagination-footer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DeviceStatus, DeviceType } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { DEVICE_STATUS_LABELS, DEVICE_TYPE_LABELS } from "@/lib/device-format";
import { formatDate } from "@/lib/format";
import { useDebounced } from "@/hooks/use-debounced";
import { cn } from "@/lib/utils";
import { deleteDevice, fetchDevices } from "@/server/devices/actions";
import { devicesQueryKey } from "@/server/devices/query-key";
import type { DeviceFilters, DeviceListResult, DeviceListRow } from "@/server/devices/types";

const PAGE_SIZE = 20;

const DEVICE_TYPE_OPTIONS = Object.entries(DEVICE_TYPE_LABELS) as [DeviceType, string][];
const DEVICE_STATUS_OPTIONS = Object.entries(DEVICE_STATUS_LABELS) as [DeviceStatus, string][];

type DevicesViewProps = {
  initialFilters: DeviceFilters;
  canCreate: boolean;
  canDelete: boolean;
};

export function DevicesView({ initialFilters, canCreate, canDelete }: DevicesViewProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState(initialFilters.search ?? "");
  const [deviceTypeFilter, setDeviceTypeFilter] = React.useState(initialFilters.deviceType ?? "all");
  const [statusFilter, setStatusFilter] = React.useState(initialFilters.status ?? "all");
  const [page, setPage] = React.useState(1);
  const debouncedSearch = useDebounced(search);

  const filters = React.useMemo<DeviceFilters>(
    () => ({
      search: debouncedSearch || undefined,
      deviceType: deviceTypeFilter === "all" ? undefined : (deviceTypeFilter as DeviceType),
      status: statusFilter === "all" ? undefined : (statusFilter as DeviceStatus),
      page,
      pageSize: PAGE_SIZE,
    }),
    [debouncedSearch, deviceTypeFilter, statusFilter, page],
  );

  // A new search (or any filter) should snap back to page 1 — same pattern as
  // the Employees/User Management/Audit Trail lists.
  const filterSignature = `${debouncedSearch}|${deviceTypeFilter}|${statusFilter}`;
  const [previousSignature, setPreviousSignature] = React.useState(filterSignature);
  if (previousSignature !== filterSignature) {
    setPreviousSignature(filterSignature);
    if (page !== 1) setPage(1);
  }

  const { data, isPending, isFetching, isError, error, refetch } = useQuery<DeviceListResult>({
    queryKey: devicesQueryKey(filters),
    queryFn: () => fetchDevices(filters),
    placeholderData: (previous) => previous,
  });

  const [deleting, setDeleting] = React.useState<DeviceListRow | null>(null);

  const mutation = useMutation({
    mutationFn: async (task: () => Promise<ActionResult>) => task(),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        void queryClient.invalidateQueries({ queryKey: ["devices"] });
        setDeleting(null);
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const devices = data?.devices ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search brand, model, OS or serial number"
              aria-label="Search devices"
              className="pl-9"
            />
          </div>

          <Select value={deviceTypeFilter} onValueChange={setDeviceTypeFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {DEVICE_TYPE_OPTIONS.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {DEVICE_STATUS_OPTIONS.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {canCreate ? (
          <Button asChild className="shrink-0">
            <Link href="/admin/devices/new">
              <Plus className="size-4" aria-hidden />
              Add device
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="bg-card overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="min-w-[100px]">Type</TableHead>
                <TableHead className="min-w-[200px]">Brand / Model</TableHead>
                <TableHead className="min-w-[140px]">Serial number</TableHead>
                <TableHead className="min-w-[120px]">OS</TableHead>
                <TableHead className="min-w-[120px]">Status</TableHead>
                <TableHead className="min-w-[180px]">Deployed to</TableHead>
                <TableHead className="min-w-[120px]">Purchase date</TableHead>
                <TableHead className="w-12" aria-label="Actions" />
              </TableRow>
            </TableHeader>

            <TableBody>
              {isPending ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <TableRow key={index} className="hover:bg-transparent">
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-40" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-28" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ))
              ) : devices.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={8} className="p-0">
                    <EmptyState
                      icon={Laptop}
                      title={search ? "No matching devices" : "No devices yet"}
                      description={
                        search
                          ? "Try a different brand, model, OS or serial number."
                          : "Add your first device to start building the inventory."
                      }
                      className="rounded-none border-0"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                devices.map((row) => (
                  <TableRow key={row.id} className={cn(isFetching && "opacity-70")}>
                    <TableCell>
                      <DeviceTypeBadge deviceType={row.deviceType} />
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/devices/${row.id}`} className="font-medium hover:underline">
                        {row.brand} {row.model}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{row.serialNumber}</TableCell>
                    <TableCell className="text-sm">{row.os}</TableCell>
                    <TableCell>
                      <DeviceStatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="text-sm">{row.currentEmployeeName ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(row.purchaseDate)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={mutation.isPending}
                            aria-label={`Actions for ${row.brand} ${row.model}`}
                          >
                            <MoreHorizontal className="size-4" aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/devices/${row.id}`}>View / edit</Link>
                          </DropdownMenuItem>
                          {canDelete ? (
                            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(row)}>
                              <Trash2 className="size-4" aria-hidden />
                              Remove
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {isError ? (
        <div className="border-destructive/30 bg-destructive/5 flex items-center justify-between gap-4 rounded-lg border p-4">
          <p className="text-destructive text-sm">
            {error instanceof Error ? error.message : "Could not load devices."}
          </p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            <RotateCcw className="size-4" aria-hidden />
            Retry
          </Button>
        </div>
      ) : null}

      <PaginationFooter total={total} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="device" />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this device?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? (
                <>
                  <span className="text-foreground font-medium">
                    {deleting.brand} {deleting.model} ({deleting.serialNumber})
                  </span>{" "}
                  will be permanently removed along with its deployment history. This cannot be undone.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={mutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (!deleting) return;
                mutation.mutate(() => deleteDevice({ id: deleting.id }));
              }}
            >
              Remove device
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
