"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CircleSlash,
  MoreHorizontal,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
  Users as UsersIcon,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/layout/empty-state";
import { ApproveUserDialog } from "@/components/users/approve-user-dialog";
import { RoleBadge, StatusBadge } from "@/components/users/user-badges";
import { initialsOf } from "@/components/layout/user-menu";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { UserRole, UserStatus } from "@/db/schema";
import { useDebounced } from "@/hooks/use-debounced";
import { formatDate, formatRelative } from "@/lib/format";
import {
  assignableRoles,
  can,
  denyReasonForActingOn,
  ROLES,
  STATUS_LABELS,
  type Principal,
} from "@/lib/rbac";
import { cn } from "@/lib/utils";
import {
  approveUser,
  changeUserRole,
  deleteUser,
  fetchUsers,
  rejectUser,
  setUserStatus,
} from "@/server/users/actions";
import { usersQueryKey } from "@/server/users/query-key";
import type { ActionResult, ManagedUser, UserFilters, UserListResult } from "@/server/users/types";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const STATUS_TABS: Array<{ value: UserStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
];

function emptyTitleFor(status: UserStatus | "all"): string {
  return status === "all" ? "No users yet" : `No ${STATUS_LABELS[status].toLowerCase()} users`;
}

/* -------------------------------------------------------------------------- */
/*  View                                                                      */
/* -------------------------------------------------------------------------- */

type UsersViewProps = {
  /** The signed-in administrator, used to gate every control. */
  actor: Principal;
  initialFilters: UserFilters;
};

export function UsersView({ actor, initialFilters }: UsersViewProps) {
  const queryClient = useQueryClient();

  const [search, setSearch] = React.useState(initialFilters.search ?? "");
  const [status, setStatus] = React.useState<UserStatus | "all">(initialFilters.status ?? "all");
  const debouncedSearch = useDebounced(search);

  const filters = React.useMemo<UserFilters>(
    () => ({ search: debouncedSearch || undefined, status, role: "all" }),
    [debouncedSearch, status],
  );

  const { data, isPending, isFetching, isError, error, refetch } = useQuery<UserListResult>({
    queryKey: usersQueryKey(filters),
    queryFn: () => fetchUsers(filters),
    placeholderData: (previous) => previous,
  });

  const [approving, setApproving] = React.useState<ManagedUser | null>(null);
  const [confirming, setConfirming] = React.useState<
    { user: ManagedUser; intent: "reject" | "delete" } | null
  >(null);

  /**
   * All mutations share one handler: invalidate on success, surface the message
   * either way. The server is the authority on whether an action was allowed,
   * so a `{ ok: false }` result is a normal outcome, not an exception.
   */
  const mutation = useMutation({
    mutationFn: async (task: () => Promise<ActionResult>) => task(),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        void queryClient.invalidateQueries({ queryKey: ["users"] });
        setApproving(null);
        setConfirming(null);
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const users = data?.users ?? [];
  const counts = data?.counts;
  const grantableRoles = assignableRoles(actor);

  const mayApprove = can(actor, "users:approve");
  const maySuspend = can(actor, "users:suspend");
  const mayAssignRole = can(actor, "users:assign_role");
  const mayDelete = can(actor, "users:delete");

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------------------ */}
      {/* Toolbar                                                            */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="tablist"
          aria-label="Filter by status"
          className="bg-muted flex w-full gap-1 overflow-x-auto rounded-lg p-1 sm:w-auto"
        >
          {STATUS_TABS.map((tab) => {
            const active = status === tab.value;
            const badgeCount = counts?.[tab.value];

            return (
              <button
                key={tab.value}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setStatus(tab.value)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
                {badgeCount !== undefined && badgeCount > 0 ? (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[0.6875rem] leading-none font-semibold tabular-nums",
                      tab.value === "pending" && badgeCount > 0
                        ? "bg-warning/15 text-warning"
                        : "bg-muted-foreground/15 text-muted-foreground",
                    )}
                  >
                    {badgeCount}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:max-w-xs">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, email or title"
            aria-label="Search users"
            className="pl-9"
          />
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Table                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-card overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="min-w-[240px]">User</TableHead>
                <TableHead className="min-w-[150px]">Role</TableHead>
                <TableHead className="min-w-[160px]">Status</TableHead>
                <TableHead className="min-w-[120px]">Last sign-in</TableHead>
                <TableHead className="min-w-[120px]">Joined</TableHead>
                <TableHead className="w-12" aria-label="Actions" />
              </TableRow>
            </TableHeader>

            <TableBody>
              {isPending ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <TableRow key={index} className="hover:bg-transparent">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Skeleton className="size-9 rounded-full" />
                        <div className="space-y-1.5">
                          <Skeleton className="h-3.5 w-32" />
                          <Skeleton className="h-3 w-44" />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-24 rounded-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-28 rounded-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-3.5 w-16" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-3.5 w-20" />
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ))
              ) : users.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="p-0">
                    <EmptyState
                      icon={UsersIcon}
                      title={search ? "No matching users" : emptyTitleFor(status)}
                      description={
                        search
                          ? "Try a different name, email or job title."
                          : "Users appear here once they request access."
                      }
                      className="rounded-none border-0"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                users.map((row) => {
                  const denial = denyReasonForActingOn(actor, row);
                  const isSelf = row.id === actor.id;

                  return (
                    <TableRow key={row.id} className={cn(isFetching && "opacity-70")}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="size-9 shrink-0">
                            <AvatarImage src={row.image ?? undefined} alt="" />
                            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                              {initialsOf(row.name)}
                            </AvatarFallback>
                          </Avatar>

                          <div className="min-w-0">
                            <p className="flex items-center gap-2 truncate text-sm font-medium">
                              {row.name}
                              {isSelf ? (
                                <span className="text-muted-foreground text-xs font-normal">
                                  (you)
                                </span>
                              ) : null}
                            </p>
                            <p className="text-muted-foreground truncate text-xs">{row.email}</p>
                            {row.jobTitle ? (
                              <p className="text-muted-foreground/80 truncate text-xs">
                                {row.jobTitle}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>
                        {row.status === "pending" ? (
                          <span className="text-muted-foreground text-sm">Not assigned</span>
                        ) : (
                          <RoleBadge role={row.role} />
                        )}
                      </TableCell>

                      <TableCell>
                        <StatusBadge status={row.status} />
                      </TableCell>

                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {formatRelative(row.lastLoginAt)}
                      </TableCell>

                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {formatDate(row.createdAt)}
                      </TableCell>

                      <TableCell>
                        <RowActions
                          row={row}
                          denial={denial}
                          grantableRoles={grantableRoles}
                          permissions={{ mayApprove, maySuspend, mayAssignRole, mayDelete }}
                          pending={mutation.isPending}
                          onApprove={() => setApproving(row)}
                          onReject={() => setConfirming({ user: row, intent: "reject" })}
                          onDelete={() => setConfirming({ user: row, intent: "delete" })}
                          onRoleChange={(role) =>
                            mutation.mutate(() => changeUserRole({ userId: row.id, role }))
                          }
                          onStatusChange={(next) =>
                            mutation.mutate(() => setUserStatus({ userId: row.id, status: next }))
                          }
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {isError ? (
        <div className="border-destructive/30 bg-destructive/5 flex items-center justify-between gap-4 rounded-lg border p-4">
          <p className="text-destructive text-sm">
            {error instanceof Error ? error.message : "Could not load users."}
          </p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            <RotateCcw className="size-4" aria-hidden />
            Retry
          </Button>
        </div>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Dialogs                                                            */}
      {/* ------------------------------------------------------------------ */}
      <ApproveUserDialog
        user={approving}
        roles={grantableRoles}
        pending={mutation.isPending}
        onOpenChange={(open) => !open && setApproving(null)}
        onConfirm={(role) =>
          approving && mutation.mutate(() => approveUser({ userId: approving.id, role }))
        }
      />

      <AlertDialog
        open={Boolean(confirming)}
        onOpenChange={(open) => !open && setConfirming(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming?.intent === "reject" ? "Reject this request?" : "Remove this user?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming?.intent === "reject" ? (
                <>
                  The access request from{" "}
                  <span className="text-foreground font-medium">{confirming.user.name}</span> will be
                  deleted. They can register again later.
                </>
              ) : confirming ? (
                <>
                  <span className="text-foreground font-medium">{confirming.user.name}</span> will be
                  permanently removed along with their sessions. This cannot be undone.
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
                if (!confirming) return;
                const { user: target, intent } = confirming;
                mutation.mutate(() =>
                  intent === "reject"
                    ? rejectUser({ userId: target.id })
                    : deleteUser({ userId: target.id }),
                );
              }}
            >
              {confirming?.intent === "reject" ? "Reject request" : "Remove user"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Row actions                                                               */
/* -------------------------------------------------------------------------- */

type RowActionsProps = {
  row: ManagedUser;
  /** Why this row cannot be acted on, or null when it can. */
  denial: string | null;
  grantableRoles: UserRole[];
  permissions: {
    mayApprove: boolean;
    maySuspend: boolean;
    mayAssignRole: boolean;
    mayDelete: boolean;
  };
  pending: boolean;
  onApprove: () => void;
  onReject: () => void;
  onDelete: () => void;
  onRoleChange: (role: UserRole) => void;
  onStatusChange: (status: "active" | "suspended") => void;
};

function RowActions({
  row,
  denial,
  grantableRoles,
  permissions,
  pending,
  onApprove,
  onReject,
  onDelete,
  onRoleChange,
  onStatusChange,
}: RowActionsProps) {
  const { mayApprove, maySuspend, mayAssignRole, mayDelete } = permissions;

  // Nothing to offer: either the actor outranks nobody here, or they hold no
  // write permissions at all. Explain rather than render a menu that does
  // nothing when opened.
  const hasAnyPermission = mayApprove || maySuspend || mayAssignRole || mayDelete;

  if (denial || !hasAnyPermission) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Button variant="ghost" size="icon" disabled aria-label="Actions unavailable">
              <MoreHorizontal className="size-4" aria-hidden />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {denial ?? "You don't have permission to manage users."}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" disabled={pending} aria-label={`Actions for ${row.name}`}>
          <MoreHorizontal className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        {row.status === "pending" && mayApprove ? (
          <>
            <DropdownMenuItem onSelect={onApprove}>
              <UserCheck className="size-4" aria-hidden />
              Approve &amp; assign role
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={onReject}>
              <UserX className="size-4" aria-hidden />
              Reject request
            </DropdownMenuItem>
          </>
        ) : null}

        {row.status !== "pending" && mayAssignRole && grantableRoles.length > 0 ? (
          <>
            <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="size-3.5" aria-hidden />
                Role
              </span>
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={row.role}
              onValueChange={(value) => onRoleChange(value as UserRole)}
            >
              {grantableRoles.map((role) => (
                <DropdownMenuRadioItem key={role} value={role}>
                  {ROLES[role].label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        ) : null}

        {row.status !== "pending" && maySuspend ? (
          <>
            <DropdownMenuSeparator />
            {row.status === "active" ? (
              <DropdownMenuItem onSelect={() => onStatusChange("suspended")}>
                <CircleSlash className="size-4" aria-hidden />
                Suspend access
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => onStatusChange("active")}>
                <UserCheck className="size-4" aria-hidden />
                Reinstate access
              </DropdownMenuItem>
            )}
          </>
        ) : null}

        {mayDelete && row.status !== "pending" ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 className="size-4" aria-hidden />
              Remove user
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
