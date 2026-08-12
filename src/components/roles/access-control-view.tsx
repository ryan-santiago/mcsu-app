"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Pencil, Plus, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/layout/empty-state";
import { CreateRoleDialog, type RoleFormValues } from "@/components/roles/create-role-dialog";
import { RolePermissionMatrix } from "@/components/roles/role-permission-matrix";
import { RoleBadge } from "@/components/users/user-badges";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ActionResult } from "@/lib/action-result";
import { createRole, deleteRole, fetchRoles, updateRoleMeta, updateRolePermissions } from "@/server/roles/actions";
import { rolesQueryKey } from "@/server/roles/query-key";
import type { Role } from "@/server/roles/types";

type AccessControlViewProps = {
  canWrite: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export function AccessControlView({ canWrite, canEdit, canDelete }: AccessControlViewProps) {
  const queryClient = useQueryClient();

  const { data, isPending, isFetching, isError, error, refetch } = useQuery<Role[]>({
    queryKey: rolesQueryKey(),
    queryFn: fetchRoles,
    placeholderData: (previous) => previous,
  });

  const [metaDialog, setMetaDialog] = React.useState<Role | "new" | null>(null);
  const [managingPermissions, setManagingPermissions] = React.useState<Role | null>(null);
  const [deleting, setDeleting] = React.useState<Role | null>(null);

  const mutation = useMutation({
    mutationFn: async (task: () => Promise<ActionResult<unknown>>) => task(),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        void queryClient.invalidateQueries({ queryKey: rolesQueryKey() });
        setMetaDialog(null);
        setManagingPermissions(null);
        setDeleting(null);
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const roles = data ?? [];

  function handleMetaSubmit(values: RoleFormValues) {
    if (metaDialog === "new") {
      mutation.mutate(() => createRole(values));
    } else if (metaDialog) {
      mutation.mutate(() => updateRoleMeta({ id: metaDialog.id, ...values }));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {roles.length} role{roles.length === 1 ? "" : "s"}
        </p>
        {canWrite ? (
          <Button size="sm" onClick={() => setMetaDialog("new")}>
            <Plus className="size-4" aria-hidden />
            Add role
          </Button>
        ) : null}
      </div>

      <div className="bg-card overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="min-w-60">Role</TableHead>
                <TableHead className="w-24">Rank</TableHead>
                <TableHead className="w-24">Users</TableHead>
                <TableHead className="w-12" aria-label="Actions" />
              </TableRow>
            </TableHeader>

            <TableBody>
              {isPending ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <TableRow key={index} className="hover:bg-transparent">
                    <TableCell>
                      <Skeleton className="h-5 w-40 rounded-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-3.5 w-8" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-3.5 w-8" />
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ))
              ) : roles.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4} className="p-0">
                    <EmptyState
                      icon={ShieldCheck}
                      title="No roles yet"
                      description="Roles appear here once created."
                      className="rounded-none border-0"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                roles.map((role) => (
                  <TableRow key={role.id} className={isFetching ? "opacity-70" : undefined}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <RoleBadge role={role} />
                        {role.isSystem ? (
                          <Badge variant="secondary" className="font-normal">
                            Required
                          </Badge>
                        ) : null}
                      </div>
                      {role.description ? (
                        <p className="text-muted-foreground mt-1 truncate text-xs">{role.description}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm tabular-nums">{role.rank}</TableCell>
                    <TableCell className="text-muted-foreground text-sm tabular-nums">{role.userCount}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={mutation.isPending}
                            aria-label={`Actions for ${role.label}`}
                          >
                            <MoreHorizontal className="size-4" aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setManagingPermissions(role)}>
                            <ShieldCheck className="size-4" aria-hidden />
                            {role.id === "admin" ? "View permissions" : "Manage permissions"}
                          </DropdownMenuItem>
                          {canEdit ? (
                            <DropdownMenuItem onSelect={() => setMetaDialog(role)}>
                              <Pencil className="size-4" aria-hidden />
                              Edit details
                            </DropdownMenuItem>
                          ) : null}
                          {canDelete && !role.isSystem ? (
                            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(role)}>
                              <Trash2 className="size-4" aria-hidden />
                              Delete
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
            {error instanceof Error ? error.message : "Could not load roles."}
          </p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            <RotateCcw className="size-4" aria-hidden />
            Retry
          </Button>
        </div>
      ) : null}

      <CreateRoleDialog
        target={metaDialog}
        pending={mutation.isPending}
        onOpenChange={(open) => !open && setMetaDialog(null)}
        onSubmit={handleMetaSubmit}
      />

      <RolePermissionMatrix
        role={managingPermissions}
        canEdit={canEdit}
        pending={mutation.isPending}
        onOpenChange={(open) => !open && setManagingPermissions(null)}
        onSave={(permissions) =>
          managingPermissions &&
          mutation.mutate(() => updateRolePermissions({ id: managingPermissions.id, permissions }))
        }
      />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this role?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? (
                <>
                  <span className="text-foreground font-medium">{deleting.label}</span> will be permanently
                  removed. If any user still holds it, deletion is blocked — reassign them first.
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
                mutation.mutate(() => deleteRole({ id: deleting.id }));
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
