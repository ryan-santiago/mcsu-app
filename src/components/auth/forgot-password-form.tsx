"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { requestPasswordReset } from "@/lib/auth-client";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/validation/auth";

export function ForgotPasswordForm() {
  const [submitted, setSubmitted] = React.useState(false);

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(values: ForgotPasswordInput) {
    // Always show the same outcome, whether or not the address has an
    // account — branching here would be an account-enumeration oracle, the
    // same reason login never says which of email/password was wrong.
    await requestPasswordReset({ email: values.email });
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="space-y-8">
        <header className="space-y-4">
          <span className="bg-muted text-muted-foreground inline-flex size-12 items-center justify-center rounded-full">
            <MailCheck className="size-6" aria-hidden />
          </span>

          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              If that address has an MCSU Console account, we&apos;ve sent a link to
              reset the password. It expires in one hour.
            </p>
          </div>
        </header>

        <Button asChild variant="outline" className="w-full" size="lg">
          <Link href="/login">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
        <p className="text-muted-foreground text-sm">
          Enter your work email and we&apos;ll send you a link to reset it.
        </p>
      </header>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Work email</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="email"
                    inputMode="email"
                    autoComplete="username"
                    autoFocus
                    placeholder="you@questronix.com.ph"
                    disabled={isSubmitting}
                    className="h-11"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Sending…
              </>
            ) : (
              <>
                Send reset link
                <ArrowRight className="size-4" aria-hidden />
              </>
            )}
          </Button>
        </form>
      </Form>

      <p className="text-muted-foreground text-center text-sm">
        <Link href="/login" className="text-primary font-medium underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
