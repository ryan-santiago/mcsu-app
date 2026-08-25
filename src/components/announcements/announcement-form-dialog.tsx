"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ANNOUNCEMENT_TYPE_LABELS, ANNOUNCEMENT_TYPES, type AnnouncementRow } from "@/server/announcements/types";

const announcementFormSchema = z.object({
  announcementDate: z.string().min(1, "Pick a date"),
  type: z.enum(ANNOUNCEMENT_TYPES as [string, ...string[]]),
  title: z.string().trim().min(1, "Title is required").max(200, "That title is too long"),
  description: z.string().optional(),
});
type AnnouncementFormInput = z.infer<typeof announcementFormSchema>;

export type AnnouncementFormValues = AnnouncementFormInput;

type AnnouncementFormDialogProps = {
  /** `"new"` for the create form, an `AnnouncementRow` to edit it, `null` to close. */
  target: AnnouncementRow | "new" | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: AnnouncementFormValues) => void;
};

export function AnnouncementFormDialog({ target, pending, onOpenChange, onSubmit }: AnnouncementFormDialogProps) {
  const isEdit = target !== null && target !== "new";

  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        {target ? (
          <AnnouncementForm
            key={isEdit ? target.id : "new-announcement"}
            isEdit={isEdit}
            defaultValues={
              isEdit
                ? {
                    announcementDate: target.announcementDate,
                    type: target.type,
                    title: target.title,
                    description: target.description ?? "",
                  }
                : {
                    announcementDate: format(new Date(), "yyyy-MM-dd"),
                    type: "news",
                    title: "",
                    description: "",
                  }
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

function AnnouncementForm({
  isEdit,
  defaultValues,
  pending,
  onOpenChange,
  onSubmit,
}: {
  isEdit: boolean;
  defaultValues: AnnouncementFormInput;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: AnnouncementFormValues) => void;
}) {
  const form = useForm<AnnouncementFormInput>({
    resolver: zodResolver(announcementFormSchema),
    defaultValues,
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit announcement" : "Create announcement"}</DialogTitle>
        <DialogDescription>
          {isEdit ? "Update this announcement's details." : "Post a new announcement for everyone to see."}
        </DialogDescription>
      </DialogHeader>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((values) => onSubmit({ ...values, title: values.title.trim() }))}
          className="space-y-4"
          noValidate
        >
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="announcementDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Announcement date</FormLabel>
                  <FormControl>
                    <DatePicker value={field.value} onChange={field.onChange} disabled={pending} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={pending}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ANNOUNCEMENT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {ANNOUNCEMENT_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <Input {...field} autoFocus disabled={pending} placeholder="What's the headline?" />
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
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <RichTextEditor
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    disabled={pending}
                    placeholder="Add the announcement details..."
                  />
                </FormControl>
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
              {isEdit ? "Save changes" : "Post announcement"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}
