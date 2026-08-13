import { z } from "zod";

/**
 * Shared by the client forms and the server actions. Validating in both places
 * is intentional: the client copy gives instant feedback, the server copy is
 * the one that actually protects the database.
 */

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .max(254, "That email is too long")
  .pipe(z.email("Enter a valid email address"))
  .transform((value) => value.toLowerCase());

/**
 * Length is the requirement that actually matters; composition rules mostly
 * push people toward predictable substitutions. 10 characters matches the
 * `minPasswordLength` configured on BetterAuth.
 */
export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128, "Passwords cannot exceed 128 characters");

export const nameSchema = z
  .string()
  .trim()
  .min(2, "Enter your full name")
  .max(80, "That name is too long");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().default(true),
});

export const registerSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type LoginInput = z.input<typeof loginSchema>;
export type RegisterInput = z.input<typeof registerSchema>;
export type ChangePasswordInput = z.input<typeof changePasswordSchema>;

/**
 * A coarse strength signal for the registration meter. This is guidance for the
 * user, not a gate — `passwordSchema` is what actually enforces the policy.
 */
export function passwordStrength(password: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!password) return { score: 0, label: "" };

  let score = 0;
  if (password.length >= 10) score++;
  if (password.length >= 14) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password) && /[^\w\s]/.test(password)) score++;

  const labels = ["Too short", "Weak", "Fair", "Good", "Strong"] as const;
  const clamped = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;

  return { score: clamped, label: labels[clamped] };
}
