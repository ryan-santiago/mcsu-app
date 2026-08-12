"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { Role } from "@/server/roles/types";

const roleFormSchema = z.object({
  label: z.string().trim().min(1, "Name is required").max(60, "That name is too long"),
  description: z.string().trim().max(200, "That description is too long").optional(),
  rank: z
    .number()
    .int("Rank must be a whole number")
    .min(1, "Rank must be at least 1")
    .max(999, "That rank is too high"),
});
type RoleFormInput = z.infer<typeof roleFormSchema>;

export type RoleFormValues = { label: string; description?: string; rank: number };

type CreateRoleDialogProps = {
  /** `"new"` for the create form, a `Role` to edit its details, `null` to close. */
  target: Role | "new" | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: RoleFormValues) => void;
};

/**
 * Handles both creating a role and editing one's name/description/rank —
 * permissions are a separate dialog (`RolePermissionMatrix`), same split as
 * Maintenance keeps renaming and activation as separate controls.
 */
export function CreateRoleDialog({ target, pending, onOpenChange, onSubmit }: CreateRoleDialogProps) {
  const isEdit = target !== null && target !== "new";

  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        {target ? (
          <RoleForm
            key={isEdit ? target.id : "new-role"}
            isEdit={isEdit}
            defaultValues={
              isEdit
                ? { label: target.label, description: target.description ?? "", rank: target.rank }
                : { label: "", description: "", rank: 25 }
            }
            pending={pending}
            onOpenChange={onOpenChange}
            onSubmit={onSubmit}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RoleForm({
  isEdit,
  defaultValues,
  pending,
  onOpenChange,
  onSubmit,
}: {
  isEdit: boolean;
  defaultValues: RoleFormInput;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: RoleFormValues) => void;
}) {
  const form = useForm<RoleFormInput>({
    resolver: zodResolver(roleFormSchema),
    defaultValues,
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit role" : "Add role"}</DialogTitle>
        <DialogDescription>
          {isEdit
            ? "Update this role's name, description and rank."
            : "New roles start with no permissions — grant them from the matrix afterward."}
        </DialogDescription>
      </DialogHeader>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((values) =>
            onSubmit({
              label: values.label.trim(),
              description: values.description?.trim() || undefined,
              rank: values.rank,
            }),
          )}
          className="space-y-4"
          noValidate
        >
          <FormField
            control={form.control}
            name="label"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input {...field} autoFocus disabled={pending} placeholder="e.g. Supervisor" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Description <span className="text-muted-foreground font-normal">(optional)</span>
                </FormLabel>
                <FormControl>
                  <Input {...field} disabled={pending} placeholder="What this role is for" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="rank"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Rank</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="number"
                    min={1}
                    max={999}
                    disabled={pending}
                    onChange={(event) => field.onChange(event.target.valueAsNumber)}
                  />
                </FormControl>
                <FormDescription>
                  Higher outranks lower — decides who can manage this role&apos;s users and grant it.
                  Administrator is 40, Manager is 30.
                </FormDescription>
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
              {isEdit ? "Save changes" : "Add role"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}
