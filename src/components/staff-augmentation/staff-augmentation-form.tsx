"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { staffAugmentationFormSchema, type StaffAugmentationFormInput } from "@/lib/validation/staff-augmentation";
import { createStaffAugmentationEngagement } from "@/server/staff-augmentation/actions";

export function StaffAugmentationForm() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const form = useForm<StaffAugmentationFormInput>({
    resolver: zodResolver(staffAugmentationFormSchema),
    defaultValues: { name: "" },
  });

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(values: StaffAugmentationFormInput) {
    const result = await createStaffAugmentationEngagement(values);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message);
    void queryClient.invalidateQueries({ queryKey: ["staff-augmentation"] });
    router.push(`/staff-augmentation/${result.data.id}`);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
        <div className="bg-card space-y-4 rounded-xl border p-6">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input {...field} disabled={isSubmitting} placeholder="e.g. Acme Corp — Staff Augmentation" autoFocus />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Add engagement
          </Button>
        </div>
      </form>
    </Form>
  );
}
