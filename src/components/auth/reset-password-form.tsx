"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, KeyRound, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { PasswordInput } from "@/components/ui/password-input";
import { resetPassword } from "@/lib/auth-client";
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/validation/auth";

export function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [formError, setFormError] = React.useState<string | null>(null);

  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(values: ResetPasswordInput) {
    if (!token) return;

    setFormError(null);

    const { error } = await resetPassword({ newPassword: values.newPassword, token });

    if (error) {
      setFormError("This reset link is invalid or has expired. Request a new one.");
      return;
    }

    toast.success("Password reset. Sign in with your new password.");
    router.push("/login");
  }

  if (!token) {
    return (
      <div className="space-y-8">
        <header className="space-y-4">
          <span className="bg-muted text-muted-foreground inline-flex size-12 items-center justify-center rounded-full">
            <KeyRound className="size-6" aria-hidden />
          </span>

          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Invalid reset link</h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              This link is missing its reset token. Request a new one to continue.
            </p>
          </div>
        </header>

        <Button asChild className="w-full" size="lg">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="text-muted-foreground text-sm">
          This also signs you out everywhere else.
        </p>
      </header>

      {formError ? (
        <Alert variant="destructive" role="alert">
          <AlertCircle className="size-4" />
          <AlertDescription>
            {formError}{" "}
            <Link href="/forgot-password" className="font-medium underline-offset-4 hover:underline">
              Request a new link
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <FormField
            control={form.control}
            name="newPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New password</FormLabel>
                <FormControl>
                  <PasswordInput
                    {...field}
                    autoComplete="new-password"
                    autoFocus
                    disabled={isSubmitting}
                    className="h-11"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm new password</FormLabel>
                <FormControl>
                  <PasswordInput {...field} autoComplete="new-password" disabled={isSubmitting} className="h-11" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Reset password
          </Button>
        </form>
      </Form>
    </div>
  );
}
