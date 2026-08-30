"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, Paperclip, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { formatBytes } from "@/lib/format";
import { certificationFormSchema, type CertificationFormInput } from "@/lib/validation/certification";
import { createMyCertification, updateMyCertification } from "@/server/certifications/actions";
import type { CertificationDetail } from "@/server/certifications/types";

function toFormValues(detail: CertificationDetail | undefined): CertificationFormInput {
  if (!detail) return { title: "", dateAcquired: "", credentialUrl: "" };
  return { title: detail.title, dateAcquired: detail.dateAcquired, credentialUrl: detail.credentialUrl ?? "" };
}

type CertificationFormProps =
  | { mode: "create"; storageAvailable: boolean }
  | { mode: "edit"; certificationId: string; initialData: CertificationDetail; storageAvailable: boolean };

/** "keep" (default) leaves any existing file untouched — same field name/values `updateMyCertification` expects. */
type FileAction = "keep" | "replace" | "remove";

export function CertificationForm(props: CertificationFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const form = useForm<CertificationFormInput>({
    resolver: zodResolver(certificationFormSchema),
    defaultValues: toFormValues(props.mode === "edit" ? props.initialData : undefined),
  });

  const existingFile = props.mode === "edit" ? { name: props.initialData.fileName, size: props.initialData.fileSize } : null;
  const [file, setFile] = React.useState<File | null>(null);
  const [fileAction, setFileAction] = React.useState<FileAction>("keep");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const isSubmitting = form.formState.isSubmitting;
  const hasFileAttached = fileAction === "remove" ? false : file !== null || (fileAction === "keep" && Boolean(existingFile?.name));

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0] ?? null;
    setFile(picked);
    setFileAction(picked ? "replace" : "keep");
  }

  function handleRemoveFile() {
    setFile(null);
    setFileAction("remove");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function onSubmit(values: CertificationFormInput) {
    if (!values.credentialUrl && !hasFileAttached) {
      form.setError("credentialUrl", { message: "Add a certificate URL, an uploaded file, or both." });
      return;
    }

    const formData = new FormData();
    formData.set("title", values.title);
    formData.set("dateAcquired", values.dateAcquired);
    formData.set("credentialUrl", values.credentialUrl);
    if (file) formData.set("file", file);

    if (props.mode === "create") {
      const result = await createMyCertification(formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: ["certifications"] });
      router.push(`/certifications/${result.data.id}`);
      return;
    }

    formData.set("id", props.certificationId);
    formData.set("fileAction", fileAction);
    const result = await updateMyCertification(formData);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message);
    void queryClient.invalidateQueries({ queryKey: ["certifications"] });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
        <div className="bg-card space-y-4 rounded-xl border p-6">
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Badge / Certificate title</FormLabel>
                <FormControl>
                  <Input {...field} disabled={isSubmitting} placeholder="e.g. AWS Certified Solutions Architect" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="dateAcquired"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date acquired</FormLabel>
                <DatePicker value={field.value} onChange={field.onChange} disabled={isSubmitting} />
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="credentialUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Badge / Certificate URL <span className="text-muted-foreground font-normal">(optional)</span>
                </FormLabel>
                <FormControl>
                  <Input {...field} disabled={isSubmitting} placeholder="https://www.credly.com/badges/..." />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="space-y-2">
            <p className="text-sm leading-none font-medium">
              Upload certificate <span className="text-muted-foreground font-normal">(optional)</span>
            </p>

            {!props.storageAvailable ? (
              <p className="text-muted-foreground text-sm">
                File upload isn&apos;t available in this environment right now — you can still save this record with
                just a URL.
              </p>
            ) : (
              <>
                {fileAction !== "remove" && !file && existingFile?.name ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2 text-sm">
                      <Paperclip className="text-muted-foreground size-4 shrink-0" aria-hidden />
                      <span className="truncate">{existingFile.name}</span>
                      <span className="text-muted-foreground shrink-0">{formatBytes(existingFile.size)}</span>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {props.mode === "edit" ? (
                        <Button variant="ghost" size="sm" type="button" asChild>
                          <a href={`/api/certifications/${props.certificationId}/file?download=1`}>
                            <Download className="size-4" aria-hidden />
                          </a>
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        disabled={isSubmitting}
                        onClick={handleRemoveFile}
                      >
                        <X className="size-4" aria-hidden />
                        Remove
                      </Button>
                    </div>
                  </div>
                ) : file ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2 text-sm">
                      <Paperclip className="text-muted-foreground size-4 shrink-0" aria-hidden />
                      <span className="truncate">{file.name}</span>
                      <span className="text-muted-foreground shrink-0">{formatBytes(file.size)}</span>
                    </div>
                    <Button variant="ghost" size="sm" type="button" disabled={isSubmitting} onClick={handleRemoveFile}>
                      <X className="size-4" aria-hidden />
                      Remove
                    </Button>
                  </div>
                ) : (
                  <Input ref={fileInputRef} type="file" disabled={isSubmitting} onChange={handleFileChange} />
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {props.mode === "create" ? "Add certification" : "Save changes"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
