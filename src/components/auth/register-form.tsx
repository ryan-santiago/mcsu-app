"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm, useWatch } from "react-hook-form";

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
import { signUp } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { passwordStrength, registerSchema, type RegisterInput } from "@/lib/validation/auth";

const STRENGTH_STYLES = [
  "bg-border",
  "bg-destructive",
  "bg-warning",
  "bg-brand-accent",
  "bg-success",
] as const;

function PasswordMeter({ value }: { value: string }) {
  const { score, label } = passwordStrength(value);

  if (!value) return null;

  return (
    <div className="space-y-1.5" aria-live="polite">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              step <= score ? STRENGTH_STYLES[score] : "bg-border",
            )}
          />
        ))}
      </div>
      <p className="text-muted-foreground text-xs">Password strength: {label}</p>
    </div>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const [formError, setFormError] = React.useState<string | null>(null);

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });

  const isSubmitting = form.formState.isSubmitting;
  // `useWatch` rather than `form.watch()`: the latter returns a fresh function
  // each render, which opts the whole component out of React Compiler memoing.
  const passwordValue = useWatch({ control: form.control, name: "password" }) ?? "";

  async function onSubmit(values: RegisterInput) {
    setFormError(null);

    const { error } = await signUp.email({
      name: values.name.trim(),
      email: values.email.trim().toLowerCase(),
      password: values.password,
    });

    if (error) {
      const message = error.message ?? "";

      if (/exist|already/i.test(message)) {
        form.setError("email", {
          message: "An account with this email already exists.",
        });
        return;
      }

      setFormError(message || "We could not create your account. Please try again.");
      return;
    }

    // `autoSignIn` is off and new accounts start pending, so there is no session
    // to land in — send them to the status screen instead.
    router.push("/pending?registered=1");
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Request MCSU access</h1>
        <p className="text-muted-foreground text-sm">
          Create your account, then an administrator will approve it and assign
          your role.
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
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full name</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    autoComplete="name"
                    autoFocus
                    placeholder="Juan Dela Cruz"
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
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <PasswordInput
                    {...field}
                    autoComplete="new-password"
                    placeholder="At least 10 characters"
                    disabled={isSubmitting}
                    className="h-11"
                  />
                </FormControl>
                <PasswordMeter value={passwordValue} />
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm password</FormLabel>
                <FormControl>
                  <PasswordInput
                    {...field}
                    autoComplete="new-password"
                    placeholder="Re-enter your password"
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
                Creating account…
              </>
            ) : (
              <>
                Create account
                <ArrowRight className="size-4" aria-hidden />
              </>
            )}
          </Button>
        </form>
      </Form>

      <p className="text-muted-foreground text-center text-sm">
        Already have an account?{" "}
        <Link href="/login" className="text-primary font-medium underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
