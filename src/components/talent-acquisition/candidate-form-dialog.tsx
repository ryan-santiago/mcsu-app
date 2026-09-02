"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Paperclip, Search, UserPlus, X } from "lucide-react";
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
import { formatEmployeeDisplayName } from "@/lib/employee-format";
import { fetchJobPostingSourceOptions } from "@/server/talent-acquisition/application-actions";
import type { TaApplicationRow } from "@/server/talent-acquisition/application-types";
import { fetchGenderOptions, fetchTaCandidatePool } from "@/server/talent-acquisition/candidate-actions";
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
  /** `"new"` for the add form, a `TaApplicationRow` to edit it, `null` to close. */
  target: TaApplicationRow | "new" | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  /** `file` is only ever set for the "new person" form — editing stays CV-free, see `CandidateForm`. */
  onSubmit: (values: CandidateFormValues, file?: File) => void;
  /** Adding someone already in the talent pool — bypasses the new-person form entirely. */
  onSelectExisting: (candidateId: string) => void;
};

export function CandidateFormDialog({ target, pending, onOpenChange, onSubmit, onSelectExisting }: CandidateFormDialogProps) {
  const genderOptions = useQuery({ queryKey: ["ta-candidates", "gender-options"], queryFn: fetchGenderOptions });
  const sourceOptions = useQuery({ queryKey: ["ta-candidates", "source-options"], queryFn: fetchJobPostingSourceOptions });

  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        {target === "new" ? (
          <AddCandidateContent
            key="new-candidate"
            genderOptions={genderOptions.data ?? []}
            sourceOptions={sourceOptions.data ?? []}
            pending={pending}
            onOpenChange={onOpenChange}
            onSubmit={onSubmit}
            onSelectExisting={onSelectExisting}
          />
        ) : target ? (
          <CandidateForm
            key={target.id}
            isEdit
            genderOptions={genderOptions.data ?? []}
            sourceOptions={sourceOptions.data ?? []}
            defaultValues={{
              firstName: target.firstName,
              middleName: target.middleName ?? "",
              lastName: target.lastName,
              genderId: target.genderId ?? "",
              mobileNumber: target.mobileNumber ?? "",
              personalEmail: target.personalEmail ?? "",
              sourceId: target.sourceId ?? "",
            }}
            pending={pending}
            onOpenChange={onOpenChange}
            onSubmit={onSubmit}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** The "new" flow's first step: search the talent pool before falling back to a brand-new person form. */
function AddCandidateContent({
  genderOptions,
  sourceOptions,
  pending,
  onOpenChange,
  onSubmit,
  onSelectExisting,
}: {
  genderOptions: { id: string; name: string }[];
  sourceOptions: { id: string; name: string }[];
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CandidateFormValues, file?: File) => void;
  onSelectExisting: (candidateId: string) => void;
}) {
  const [mode, setMode] = React.useState<"search" | "form">("search");
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const pool = useQuery({
    queryKey: ["ta-candidate-pool", debouncedSearch],
    queryFn: () => fetchTaCandidatePool(debouncedSearch),
  });

  if (mode === "form") {
    return (
      <CandidateForm
        isEdit={false}
        genderOptions={genderOptions}
        sourceOptions={sourceOptions}
        defaultValues={{ firstName: "", middleName: "", lastName: "", genderId: "", mobileNumber: "", personalEmail: "", sourceId: "" }}
        pending={pending}
        onOpenChange={onOpenChange}
        onSubmit={onSubmit}
        onBack={() => setMode("search")}
      />
    );
  }

  const results = pool.data ?? [];

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add candidate</DialogTitle>
        <DialogDescription>Search the talent pool first — someone may already be on file from a previous request.</DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden />
          <Input
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, email, or mobile number"
            className="pl-9"
            disabled={pending}
          />
        </div>

        <div className="max-h-64 space-y-1 overflow-y-auto">
          {pool.isFetching && results.length === 0 ? (
            <p className="text-muted-foreground p-3 text-sm">Searching…</p>
          ) : results.length === 0 ? (
            <p className="text-muted-foreground p-3 text-sm">
              {search.trim() ? "No one in the talent pool matches that search." : "No one in the talent pool yet."}
            </p>
          ) : (
            results.map((candidate: TaCandidateRow) => (
              <button
                key={candidate.id}
                type="button"
                disabled={pending}
                onClick={() => onSelectExisting(candidate.id)}
                className="hover:bg-accent flex w-full items-center justify-between gap-2 rounded-lg border p-2.5 text-left text-sm transition-colors disabled:opacity-50"
              >
                <span>
                  <span className="font-medium">{formatEmployeeDisplayName(candidate)}</span>
                  <span className="text-muted-foreground ml-2 text-xs">{candidate.mobileNumber || candidate.personalEmail || ""}</span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      <DialogFooter className="sm:justify-between">
        <Button type="button" variant="ghost" onClick={() => setMode("form")} disabled={pending}>
          <UserPlus className="size-4" aria-hidden />
          Not in the pool — add a new person
        </Button>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
          Cancel
        </Button>
      </DialogFooter>
    </>
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
  onBack,
}: {
  isEdit: boolean;
  genderOptions: { id: string; name: string }[];
  sourceOptions: { id: string; name: string }[];
  defaultValues: CandidateFormInput;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CandidateFormValues, file?: File) => void;
  /** Returns to the pool-search step — only present for the "new" flow. */
  onBack?: () => void;
}) {
  const form = useForm<CandidateFormInput>({
    resolver: zodResolver(candidateFormSchema),
    defaultValues,
  });

  const [file, setFile] = React.useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
  }

  function handleRemoveFile() {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit candidate" : "Add a new person"}</DialogTitle>
        <DialogDescription>
          {isEdit ? "Update this candidate's details." : "Capture what's known so far — pipeline stages come after."}
        </DialogDescription>
      </DialogHeader>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((values) =>
            onSubmit(
              { ...values, firstName: values.firstName.trim(), lastName: values.lastName.trim() },
              file ?? undefined,
            ),
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

          {!isEdit ? (
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
          ) : null}

          <DialogFooter className={onBack ? "sm:justify-between" : undefined}>
            {onBack ? (
              <Button type="button" variant="ghost" onClick={onBack} disabled={pending}>
                Back to search
              </Button>
            ) : null}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {isEdit ? "Save changes" : "Add candidate"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}
