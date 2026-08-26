"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchGenderOptions, fetchJobPostingSourceOptions } from "@/server/talent-acquisition/candidate-actions";
import type { TaCandidateRow } from "@/server/talent-acquisition/candidate-types";

const candidateFormSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100, "That's too long"),
  middleName: z.string().optional(),
  lastName: z.string().trim().min(1, "Last name is required").max(100, "That's too long"),
  genderId: z.string().optional(),
  mobileNumber: z.string().optional(),
  personalEmail: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
  sourceId: z.string().optional(),
});
type CandidateFormInput = z.infer<typeof candidateFormSchema>;
export type CandidateFormValues = CandidateFormInput;

type CandidateFormDialogProps = {
  /** `"new"` for the add form, a `TaCandidateRow` to edit it, `null` to close. */
  target: TaCandidateRow | "new" | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CandidateFormValues) => void;
};

export function CandidateFormDialog({ target, pending, onOpenChange, onSubmit }: CandidateFormDialogProps) {
  const isEdit = target !== null && target !== "new";

  const genderOptions = useQuery({ queryKey: ["ta-candidates", "gender-options"], queryFn: fetchGenderOptions });
  const sourceOptions = useQuery({ queryKey: ["ta-candidates", "source-options"], queryFn: fetchJobPostingSourceOptions });

  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        {target ? (
          <CandidateForm
            key={isEdit ? target.id : "new-candidate"}
            isEdit={isEdit}
            genderOptions={genderOptions.data ?? []}
            sourceOptions={sourceOptions.data ?? []}
            defaultValues={
              isEdit
                ? {
                    firstName: target.firstName,
                    middleName: target.middleName ?? "",
                    lastName: target.lastName,
                    genderId: target.genderId ?? "",
                    mobileNumber: target.mobileNumber ?? "",
                    personalEmail: target.personalEmail ?? "",
                    sourceId: target.sourceId ?? "",
                  }
                : {
                    firstName: "",
                    middleName: "",
                    lastName: "",
                    genderId: "",
                    mobileNumber: "",
                    personalEmail: "",
                    sourceId: "",
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

function CandidateForm({
  isEdit,
  genderOptions,
  sourceOptions,
  defaultValues,
  pending,
  onOpenChange,
  onSubmit,
}: {
  isEdit: boolean;
  genderOptions: { id: string; name: string }[];
  sourceOptions: { id: string; name: string }[];
  defaultValues: CandidateFormInput;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CandidateFormValues) => void;
}) {
  const form = useForm<CandidateFormInput>({
    resolver: zodResolver(candidateFormSchema),
    defaultValues,
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit candidate" : "Add candidate"}</DialogTitle>
        <DialogDescription>
          {isEdit ? "Update this candidate's details." : "Capture what's known so far — CV and pipeline stages come after."}
        </DialogDescription>
      </DialogHeader>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((values) =>
            onSubmit({ ...values, firstName: values.firstName.trim(), lastName: values.lastName.trim() }),
          )}
          className="space-y-4"
          noValidate
        >
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

          <div className="grid grid-cols-2 gap-4">
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
                      {genderOptions.map((option) => (
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
            <FormField
              control={form.control}
              name="sourceId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Source</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={pending}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Where did they apply?" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {sourceOptions.map((option) => (
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
          </div>

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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {isEdit ? "Save changes" : "Add candidate"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}
