"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";

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
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { signIn } from "@/lib/auth-client";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";

/**
 * BetterAuth returns the message thrown by the session-create hook, so we can
 * recognise the approval and suspension cases and route the user somewhere more
 * useful than a red banner.
 */
const PENDING_HINT = /awaiting approval/i;
const SUSPENDED_HINT = /suspended/i;

/**
 * Only same-origin, absolute-path redirects are honoured. A `next` value like
 * `//evil.example` or `https://evil.example` would otherwise turn the login
 * screen into an open redirect.
 */
function safeRedirect(next: string | null): string {
  if (!next) return "/dashboard";
  if (!next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formError, setFormError] = React.useState<string | null>(null);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", rememberMe: true },
  });

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(values: LoginInput) {
    setFormError(null);

    const { error } = await signIn.email({
      email: values.email,
      password: values.password,
      rememberMe: values.rememberMe ?? true,
    });

    if (error) {
      const message = error.message ?? "We could not sign you in. Please try again.";

      if (PENDING_HINT.test(message)) {
        router.push("/pending");
        return;
      }

      setFormError(
        SUSPENDED_HINT.test(message)
          ? message
          : // Never disclose whether it was the address or the password that
            // was wrong — that difference is an account-enumeration oracle.
            "Those details don't match an account. Check your email and password.",
      );
      return;
    }

    // `refresh()` lets the server layouts re-read the new session cookie before
    // the destination renders, avoiding a flash of the signed-out state.
    router.push(safeRedirect(searchParams.get("next")));
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in to MCSU</h1>
        <p className="text-muted-foreground text-sm">
          Use your Questronix work email to continue.
        </p>
      </header>

      {formError ? (
        <Alert variant="destructive" role="alert">
          <AlertCircle className="size-4" />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

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

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between gap-3">
                  <FormLabel>Password</FormLabel>
                  <Link
                    href="/forgot-password"
                    className="text-primary text-xs font-medium underline-offset-4 hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <FormControl>
                  <PasswordInput
                    {...field}
                    autoComplete="current-password"
                    placeholder="••••••••••"
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
                Signing in…
              </>
            ) : (
              <>
                Sign in
                <ArrowRight className="size-4" aria-hidden />
              </>
            )}
          </Button>
        </form>
      </Form>

      <p className="text-muted-foreground text-center text-sm">
        Need access?{" "}
        <Link
          href="/register"
          className="text-primary font-medium underline-offset-4 hover:underline"
        >
          Request an account
        </Link>
      </p>
    </div>
  );
}
