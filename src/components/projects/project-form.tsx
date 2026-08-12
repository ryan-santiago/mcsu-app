"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { projectProfileSchema, type ProjectProfileInput } from "@/lib/validation/project";
import { createProject, fetchProjectLookupOptions, updateProject } from "@/server/projects/actions";
import type { ProjectDetail } from "@/server/projects/types";

function toFormValues(detail: ProjectDetail | undefined): ProjectProfileInput {
  if (!detail) {
    return {
      s3pNumber: "",
      name: "",
      clientId: "",
      salesRepresentativeId: "",
      solutionsManagerId: "",
      engagementTypeId: "",
      startDate: "",
      endDate: "",
      clientNames: [],
    };
  }

  return {
    s3pNumber: detail.s3pNumber,
    name: detail.name,
    clientId: detail.clientId,
    salesRepresentativeId: detail.salesRepresentativeId ?? "",
    solutionsManagerId: detail.solutionsManagerId ?? "",
    engagementTypeId: detail.engagementTypeId ?? "",
    startDate: detail.startDate ?? "",
    endDate: detail.endDate ?? "",
    clientNames: detail.clientNames.map((entry) => entry.name),
  };
}

type ProjectFormProps =
  | { mode: "create"; readOnly?: false }
  | { mode: "edit"; projectId: string; initialData: ProjectDetail; readOnly: boolean };

export function ProjectForm(props: ProjectFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [newClientName, setNewClientName] = React.useState("");

  const clientOptions = useQuery({
    queryKey: ["project-lookup-options", "client"],
    queryFn: () => fetchProjectLookupOptions("client"),
  });
  const salesRepOptions = useQuery({
    queryKey: ["project-lookup-options", "sales_representative"],
    queryFn: () => fetchProjectLookupOptions("sales_representative"),
  });
  const solutionsManagerOptions = useQuery({
    queryKey: ["project-lookup-options", "solutions_manager"],
    queryFn: () => fetchProjectLookupOptions("solutions_manager"),
  });
  const engagementTypeOptions = useQuery({
    queryKey: ["project-lookup-options", "engagement_type"],
    queryFn: () => fetchProjectLookupOptions("engagement_type"),
  });

  const form = useForm<ProjectProfileInput>({
    resolver: zodResolver(projectProfileSchema),
    defaultValues: toFormValues(props.mode === "edit" ? props.initialData : undefined),
  });

  const readOnly = props.mode === "edit" && props.readOnly;
  const isSubmitting = form.formState.isSubmitting;
  const fieldDisabled = readOnly || isSubmitting;
  // `useWatch` rather than `form.watch()`: the latter returns a fresh function
  // each render, which opts the whole component out of React Compiler memoing.
  const clientNames = useWatch({ control: form.control, name: "clientNames" }) ?? [];

  function addClientName() {
    const value = newClientName.trim();
    if (!value) return;
    form.setValue("clientNames", [...clientNames, value], { shouldDirty: true });
    setNewClientName("");
  }

  function removeClientName(index: number) {
    form.setValue(
      "clientNames",
      clientNames.filter((_, i) => i !== index),
      { shouldDirty: true },
    );
  }

  async function onSubmit(values: ProjectProfileInput) {
    if (props.mode === "create") {
      const result = await createProject(values);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      router.push(`/projects/${result.data.id}`);
      return;
    }

    const result = await updateProject({ id: props.projectId, ...values });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message);
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
        <div className="bg-card space-y-6 rounded-xl border p-6">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">S3P Details</h3>
            <p className="text-muted-foreground text-sm">Sales Profit Projection identity and assignment.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="s3pNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>S3P Number</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={fieldDisabled} placeholder="e.g. 2025-09-57" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project Name</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={fieldDisabled} placeholder="Used by Employee deployment history" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="clientId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Client</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={fieldDisabled}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select client" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {clientOptions.data?.map((option) => (
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
              name="engagementTypeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Engagement Type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={fieldDisabled}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select engagement type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {engagementTypeOptions.data?.map((option) => (
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
              name="salesRepresentativeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sales Representative</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={fieldDisabled}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select sales representative" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {salesRepOptions.data?.map((option) => (
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
              name="solutionsManagerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Solutions Manager</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={fieldDisabled}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select solutions manager" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {solutionsManagerOptions.data?.map((option) => (
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
              name="startDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date Start</FormLabel>
                  <DatePicker value={field.value} onChange={field.onChange} disabled={fieldDisabled} />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="endDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Date End <span className="text-muted-foreground font-normal">(optional)</span>
                  </FormLabel>
                  <DatePicker value={field.value ?? ""} onChange={field.onChange} disabled={fieldDisabled} />
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="space-y-2">
            <FormLabel>
              Client Name(s) <span className="text-muted-foreground font-normal">(optional)</span>
            </FormLabel>
            <p className="text-muted-foreground text-xs">
              Alternate names this project is also known or invoiced under.
            </p>
            <div className="flex flex-wrap gap-2">
              {clientNames.map((name, index) => (
                <Badge key={`${name}-${index}`} variant="secondary" className="gap-1.5 font-normal">
                  {name}
                  {!readOnly ? (
                    <button
                      type="button"
                      onClick={() => removeClientName(index)}
                      aria-label={`Remove ${name}`}
                      className="hover:text-destructive"
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  ) : null}
                </Badge>
              ))}
              {clientNames.length === 0 ? <p className="text-muted-foreground text-sm">None added.</p> : null}
            </div>
            {!readOnly ? (
              <div className="flex gap-2">
                <Input
                  value={newClientName}
                  onChange={(event) => setNewClientName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addClientName();
                    }
                  }}
                  disabled={fieldDisabled}
                  placeholder="Add another name"
                  className="max-w-xs"
                />
                <Button type="button" variant="outline" size="sm" onClick={addClientName} disabled={fieldDisabled}>
                  <Plus className="size-4" aria-hidden />
                  Add
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        {!readOnly ? (
          <div className="flex justify-end gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {props.mode === "create" ? "Create project" : "Save changes"}
            </Button>
          </div>
        ) : null}
      </form>
    </Form>
  );
}
