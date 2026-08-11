"use client";

import { Loader2 } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { UserRole } from "@/db/schema";
import { ROLES } from "@/lib/rbac";
import type { ManagedUser } from "@/server/users/types";

type ApproveUserDialogProps = {
  user: ManagedUser | null;
  /** Roles the current actor is allowed to grant. */
  roles: UserRole[];
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (role: UserRole) => void;
};

/**
 * Approval and role assignment are one step, because an approved user with no
 * role is a dead end — they could sign in but see nothing.
 */
export function ApproveUserDialog({
  user,
  roles,
  pending,
  onOpenChange,
  onConfirm,
}: ApproveUserDialogProps) {
  return (
    <Dialog open={Boolean(user)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {user ? (
          // Keying on the user id remounts the body for each person, which
          // resets the role picker to the safest default. Without it, a role
          // chosen for one registrant would carry over to the next.
          <ApproveDialogBody
            key={user.id}
            user={user}
            roles={roles}
            pending={pending}
            onOpenChange={onOpenChange}
            onConfirm={onConfirm}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ApproveDialogBody({
  user,
  roles,
  pending,
  onOpenChange,
  onConfirm,
}: ApproveUserDialogProps & { user: ManagedUser }) {
  // Least privilege by default: Viewer when it is on offer, otherwise the
  // lowest-ranked role this actor may grant.
  const defaultRole = roles.includes("viewer") ? "viewer" : (roles[roles.length - 1] ?? "viewer");
  const [role, setRole] = React.useState<UserRole>(defaultRole);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Approve access</DialogTitle>
        <DialogDescription>
          Grant <span className="text-foreground font-medium">{user.name}</span> access to the MCSU
          console and choose the role they should hold.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <dl className="bg-muted/50 grid gap-2 rounded-lg border p-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Email</dt>
            <dd className="truncate font-medium">{user.email}</dd>
          </div>
          {user.jobTitle ? (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Job title</dt>
              <dd className="truncate font-medium">{user.jobTitle}</dd>
            </div>
          ) : null}
        </dl>

        <div className="space-y-2">
          <Label htmlFor="approve-role">Assign role</Label>
          <Select value={role} onValueChange={(value) => setRole(value as UserRole)}>
            <SelectTrigger id="approve-role" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roles.map((value) => (
                <SelectItem key={value} value={value}>
                  {ROLES[value].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">{ROLES[role].description}</p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
          Cancel
        </Button>
        <Button onClick={() => onConfirm(role)} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Approve as {ROLES[role].label}
        </Button>
      </DialogFooter>
    </>
  );
}
