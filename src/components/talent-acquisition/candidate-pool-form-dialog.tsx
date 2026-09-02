"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Paperclip, X } from "lucide-react";
import * as React from "react";
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchGenderOptions } from "@/server/talent-acquisition/candidate-actions";

const candidatePoolFormSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100, "That's too long"),
  middleName: z.string().optional(),
  lastName: z.string().trim().min(1, "Last name is required").max(100, "That's too long"),
  genderId: z.string().optional(),
  mobileNumber: z.string().optional(),
  personalEmail: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
});
export type CandidatePoolFormValues = z.infer<typeof candidatePoolFormSchema>;

type CandidatePoolFormDialogProps = {
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CandidatePoolFormValues, file: File | null) => void;
};

/**
 * Standalone "Add candidate" — no pool-search step, since this page *is* the
 * pool, and no `sourceId` field, since that's request-specific (see
 * `candidate-form-dialog.tsx`'s request-scoped version for that flow).
 * The caller remounts this (via a changing `key`) each time it reopens
 * rather than this component resetting its own form/file state in an
 * effect — same reset-via-remount convention `candidate-form-dialog.tsx`
 * already uses for its own forms.
 */
export function CandidatePoolFormDialog({ open, pending, onOpenChange, onSubmit }: CandidatePoolFormDialogProps) {
  const genderOptions = useQuery({ queryKey: ["ta-candidates", "gender-options"], queryFn: fetchGenderOptions });

  const [file, setFile] = React.useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const form = useForm<CandidatePoolFormValues>({
    resolver: zodResolver(candidatePoolFormSchema),
    defaultValues: { firstName: "", middleName: "", lastName: "", genderId: "", mobileNumber: "", personalEmail: "" },
  });

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
  }

  function handleRemoveFile() {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add candidate</DialogTitle>
          <DialogDescription>Add someone straight to the talent pool, independent of any request.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((values) => onSubmit(values, file))} className="space-y-4" noValidate>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First name</FormLabel>
                    <FormControl>
                      <Input {...field} autoFocus disabled={pending} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last name</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={pending} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="middleName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Middle name <span className="text-muted-foreground font-normal">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input {...field} disabled={pending} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="genderId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Gender</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={pending}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select gender" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(genderOptions.data ?? []).map((option) => (
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

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="mobileNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Mobile number <span className="text-muted-foreground font-normal">(optional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input {...field} disabled={pending} placeholder="09XX XXX XXXX" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="personalEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Personal email <span className="text-muted-foreground font-normal">(optional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input {...field} type="email" disabled={pending} placeholder="candidate@example.com" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm leading-none font-medium">
                CV <span className="text-muted-foreground font-normal">(optional)</span>
              </p>
              {file ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2 text-sm">
                    <Paperclip className="text-muted-foreground size-4 shrink-0" aria-hidden />
                    <span className="truncate">{file.name}</span>
                  </div>
                  <Button variant="ghost" size="sm" type="button" disabled={pending} onClick={handleRemoveFile}>
                    <X className="size-4" aria-hidden />
                    Remove
                  </Button>
                </div>
              ) : (
                <Input ref={fileInputRef} type="file" disabled={pending} onChange={handleFileChange} />
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Add candidate
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
