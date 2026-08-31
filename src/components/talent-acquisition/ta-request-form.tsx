"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createTaRequest,
  fetchClientOptions,
  fetchEmploymentTypeOptionsForRequest,
  fetchJobProfileOptions,
  fetchTeamOptionsForRequest,
} from "@/server/talent-acquisition/actions";

const requestFormSchema = z.object({
  jobProfileId: z.string().min(1, "Select a job profile"),
  clientId: z.string().min(1, "Select a client"),
  employmentTypeId: z.string().min(1, "Select an employment type"),
  teamId: z.string().min(1, "Select a team"),
  headcountNeeded: z
    .string()
    .min(1, "Required")
    .refine((value) => Number.isInteger(Number(value)) && Number(value) >= 1, "Must be at least 1"),
  workArrangement: z.string().trim().min(1, "Describe the work arrangement"),
  notes: z.string().optional(),
});
type RequestFormInput = z.infer<typeof requestFormSchema>;

export function TaRequestForm() {
  const router = useRouter();

  const jobProfileOptions = useQuery({
    queryKey: ["ta-requests", "job-profile-options"],
    queryFn: fetchJobProfileOptions,
  });
  const clientOptions = useQuery({
    queryKey: ["ta-requests", "client-options"],
    queryFn: fetchClientOptions,
  });
  const teamOptions = useQuery({
    queryKey: ["ta-requests", "team-options"],
    queryFn: fetchTeamOptionsForRequest,
  });
  const employmentTypeOptions = useQuery({
    queryKey: ["ta-requests", "employment-type-options"],
    queryFn: fetchEmploymentTypeOptionsForRequest,
  });

  const form = useForm<RequestFormInput>({
    resolver: zodResolver(requestFormSchema),
    defaultValues: {
      jobProfileId: "",
      clientId: "",
      employmentTypeId: "",
      teamId: "",
      headcountNeeded: "1",
      workArrangement: "",
      notes: "",
    },
  });

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(values: RequestFormInput) {
    const result = await createTaRequest({
      jobProfileId: values.jobProfileId,
      clientId: values.clientId,
      employmentTypeId: values.employmentTypeId,
      teamId: values.teamId,
      headcountNeeded: Number(values.headcountNeeded),
      workArrangement: values.workArrangement,
      notes: values.notes,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message);
    router.push(`/talent-acquisition/${result.data.id}`);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
        <div className="bg-card space-y-4 rounded-xl border p-6">
          <FormField
            control={form.control}
            name="jobProfileId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Job profile</FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a Position — Level" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {jobProfileOptions.data?.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {jobProfileOptions.data?.length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    No Job Profiles yet — add one from Administration → Maintenance → Job Profiles first.
                  </p>
                ) : null}
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="clientId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Client</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
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
              name="teamId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Team</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select team" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {teamOptions.data?.map((option) => (
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
              name="employmentTypeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Employment type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select employment type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {employmentTypeOptions.data?.map((option) => (
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
              name="headcountNeeded"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Headcount needed</FormLabel>
                  <FormControl>
                    <Input {...field} type="number" min={1} step={1} disabled={isSubmitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="workArrangement"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Work arrangement</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    disabled={isSubmitting}
                    rows={2}
                    placeholder="e.g. Hybrid — onsite Mon/Wed, remote the rest of the week"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Notes <span className="text-muted-foreground font-normal">(optional)</span>
                </FormLabel>
                <FormControl>
                  <Textarea {...field} disabled={isSubmitting} placeholder="Anything Talent Acquisition should know upfront" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Create request
          </Button>
        </div>
      </form>
    </Form>
  );
}
