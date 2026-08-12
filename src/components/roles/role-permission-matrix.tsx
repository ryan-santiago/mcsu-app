"use client";

import { Loader2 } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ACTIONS, MODULES, permissionFor, type ModuleId, type Permission } from "@/lib/rbac";
import type { Role } from "@/server/roles/types";

const ACTION_LABELS: Record<(typeof ACTIONS)[number], string> = {
  read: "Read",
  write: "Write",
  edit: "Edit",
  delete: "Delete",
};

type RolePermissionMatrixProps = {
  role: Role | null;
  /** Whether the viewer holds `access_control:edit` — false renders a read-only matrix (e.g. Manager's default). */
  canEdit: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (permissions: Permission[]) => void;
};

/**
 * The Read/Write/Edit/Delete/All grid, one row per module. "All" is derived,
 * never stored — checked when the other four already are, and checking it
 * sets (or clears) all four at once.
 */
export function RolePermissionMatrix({ role, canEdit, pending, onOpenChange, onSave }: RolePermissionMatrixProps) {
  return (
    <Dialog open={Boolean(role)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        {role ? (
          <MatrixBody
            key={role.id}
            role={role}
            canEdit={canEdit}
            pending={pending}
            onOpenChange={onOpenChange}
            onSave={onSave}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function MatrixBody({
  role,
  canEdit,
  pending,
  onOpenChange,
  onSave,
}: {
  role: Role;
  canEdit: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (permissions: Permission[]) => void;
}) {
  // The Administrator role always has full access — enforced server-side too
  // (`updateRolePermissions` in src/server/roles/actions.ts), so this can
  // never accidentally lock the workspace out of its own admin tools.
  const locked = role.id === "admin";
  // The UI gate is a courtesy — `updateRolePermissions` re-checks
  // `access_control:edit` unconditionally — but rendering an enabled Save
  // button for a read-only viewer (e.g. Manager) would just fail silently
  // with a toast, which is worse than not offering it at all.
  const readOnly = locked || !canEdit;
  const [granted, setGranted] = React.useState<Set<Permission>>(() => new Set(role.permissions));

  function toggle(permission: Permission, checked: boolean) {
    setGranted((current) => {
      const next = new Set(current);
      if (checked) next.add(permission);
      else next.delete(permission);
      return next;
    });
  }

  function toggleAll(moduleId: ModuleId, checked: boolean) {
    setGranted((current) => {
      const next = new Set(current);
      for (const action of ACTIONS) {
        const permission = permissionFor(moduleId, action);
        if (checked) next.add(permission);
        else next.delete(permission);
      }
      return next;
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Permissions — {role.label}</DialogTitle>
        <DialogDescription>
          {locked
            ? "The Administrator role always has full access to every module. This cannot be changed."
            : readOnly
              ? "You have read-only access to Access Control, so this can't be changed here."
              : "Choose what this role can do in each area of the console. Saving signs out everyone who currently holds it."}
        </DialogDescription>
      </DialogHeader>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="min-w-[160px]">Module</TableHead>
              {ACTIONS.map((action) => (
                <TableHead key={action} className="w-20 text-center">
                  {ACTION_LABELS[action]}
                </TableHead>
              ))}
              <TableHead className="w-16 text-center">All</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {MODULES.map((module) => {
              const cellChecked = ACTIONS.map((action) =>
                locked ? true : granted.has(permissionFor(module.id, action)),
              );
              const allChecked = cellChecked.every(Boolean);

              return (
                <TableRow key={module.id}>
                  <TableCell className="font-medium">{module.label}</TableCell>
                  {ACTIONS.map((action, index) => (
                    <TableCell key={action} className="text-center">
                      <Checkbox
                        checked={cellChecked[index]}
                        disabled={readOnly || pending}
                        onCheckedChange={(checked) => toggle(permissionFor(module.id, action), checked === true)}
                        aria-label={`${ACTION_LABELS[action]} — ${module.label}`}
                      />
                    </TableCell>
                  ))}
                  <TableCell className="text-center">
                    <Checkbox
                      checked={allChecked}
                      disabled={readOnly || pending}
                      onCheckedChange={(checked) => toggleAll(module.id, checked === true)}
                      aria-label={`All — ${module.label}`}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
          {readOnly ? "Close" : "Cancel"}
        </Button>
        {readOnly ? null : (
          <Button onClick={() => onSave(Array.from(granted))} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Save permissions
          </Button>
        )}
      </DialogFooter>
    </>
  );
}
