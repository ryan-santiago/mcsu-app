"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, Users } from "lucide-react";
import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { EmptyState } from "@/components/layout/empty-state";
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
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ActionResult } from "@/lib/action-result";
import { formatRelative, initialsOf } from "@/lib/format";
import { oneLotProjectMemberSchema, type OneLotProjectMemberInput } from "@/lib/validation/one-lot-project";
import {
  addOneLotProjectMember,
  fetchOneLotProjectMemberOptions,
  removeOneLotProjectMember,
} from "@/server/one-lot-projects/actions";
import type { OneLotProjectMemberRow } from "@/server/one-lot-projects/types";

type OneLotProjectMembersTableProps = {
  projectId: string;
  members: OneLotProjectMemberRow[];
  canEdit: boolean;
  canDelete: boolean;
};

export function OneLotProjectMembersTable({ projectId, members, canEdit, canDelete }: OneLotProjectMembersTableProps) {
  const [adding, setAdding] = React.useState(false);
  const [removing, setRemoving] = React.useState<OneLotProjectMemberRow | null>(null);

  const mutation = useMutation({
    mutationFn: async (task: () => Promise<ActionResult<unknown>>) => task(),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        setAdding(false);
        setRemoving(null);
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Members</CardTitle>
        <CardAction>
          {canEdit ? (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="size-4" aria-hidden />
              Add member
            </Button>
          ) : null}
        </CardAction>
      </CardHeader>
      <CardContent>
        {members.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No members yet"
            description={
              canEdit ? "Add the first member to give them visibility into this project." : "Members will appear here once one is added."
            }
            action={
              canEdit ? (
                <Button size="sm" onClick={() => setAdding(true)}>
                  <Plus className="size-4" aria-hidden />
                  Add member
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Member</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Added</TableHead>
                  {canDelete ? <TableHead className="w-12" aria-label="Actions" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Avatar size="sm">
                          <AvatarImage src={member.image ?? undefined} alt="" />
                          <AvatarFallback>{initialsOf(member.name)}</AvatarFallback>
                        </Avatar>
                        {member.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{member.email}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatRelative(member.addedAt)}</TableCell>
                    {canDelete ? (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={mutation.isPending}
                          aria-label={`Remove ${member.name}`}
                          onClick={() => setRemoving(member)}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <AddMemberDialog
        open={adding}
        projectId={projectId}
        pending={mutation.isPending}
        onOpenChange={setAdding}
        onSubmit={(values) => {
          mutation.mutate(() => addOneLotProjectMember({ projectId, ...values }));
        }}
      />

      <AlertDialog open={Boolean(removing)} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this member?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing ? (
                <>
                  <span className="text-foreground font-medium">{removing.name}</span> will no longer be able to see
                  this project.
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
                if (!removing) return;
                mutation.mutate(() => removeOneLotProjectMember({ id: removing.id, projectId }));
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

type AddMemberDialogProps = {
  open: boolean;
  projectId: string;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: OneLotProjectMemberInput) => void;
};

function AddMemberDialog({ open, projectId, pending, onOpenChange, onSubmit }: AddMemberDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open ? <AddMemberForm projectId={projectId} pending={pending} onOpenChange={onOpenChange} onSubmit={onSubmit} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function AddMemberForm({
  projectId,
  pending,
  onOpenChange,
  onSubmit,
}: {
  projectId: string;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: OneLotProjectMemberInput) => void;
}) {
  const userOptions = useQuery({
    queryKey: ["one-lot-project-member-options", projectId],
    queryFn: () => fetchOneLotProjectMemberOptions(projectId),
  });

  const form = useForm<OneLotProjectMemberInput>({
    resolver: zodResolver(oneLotProjectMemberSchema),
    defaultValues: { userId: "" },
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add member</DialogTitle>
        <DialogDescription>Give a user visibility into this project without granting them module-wide access.</DialogDescription>
      </DialogHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormField
            control={form.control}
            name="userId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>User</FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={pending}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select user" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {userOptions.data?.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Add member
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}
