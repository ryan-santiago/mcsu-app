import { z } from "zod";

/** Shared by the employee form and its server actions, like `validation/auth.ts`. */

export const phMobileSchema = z
  .string()
  .trim()
  .regex(/^(?:\+63|0)9\d{9}$/, "Enter a valid PH mobile number (e.g. 09171234567)");

export const phMobileOptionalSchema = z
  .string()
  .trim()
  .regex(/^(?:\+63|0)9\d{9}$/, "Enter a valid PH mobile number (e.g. 09171234567)")
  .optional()
  .or(z.literal(""));

export const employeeCodeSchema = z
  .string()
  .trim()
  .min(1, "Employee code is required")
  .regex(/^(?:PH)?\d{6,10}$/i, "Use a code like PH00123456 or 123456")
  .transform((value) => value.toUpperCase());

export const addressSchema = z.object({
  regionCode: z.string().min(1, "Select a region"),
  regionName: z.string().min(1),
  provinceCode: z.string().trim().optional().or(z.literal("")),
  provinceName: z.string().trim().optional().or(z.literal("")),
  cityCode: z.string().min(1, "Select a city or municipality"),
  cityName: z.string().min(1),
  barangayCode: z.string().min(1, "Select a barangay"),
  barangayName: z.string().min(1),
  addressLine: z
    .string()
    .trim()
    .min(1, "Enter the house/unit number and street")
    .max(200, "That address is too long"),
});

export type AddressInput = z.infer<typeof addressSchema>;

/**
 * The address's field keys, in the order they cascade. Used to copy one
 * address onto another field-by-field — react-hook-form's `setValue` on a
 * *parent* path with a whole object doesn't reliably reach every already-
 * mounted descendant `Controller`/`FormField` in one call, but setting each
 * leaf path individually does. See `PhAddressPicker`'s `mirror()` and the
 * "Same as current address" checkbox in `EmployeeForm`.
 */
export const ADDRESS_FIELD_KEYS = [
  "regionCode",
  "regionName",
  "provinceCode",
  "provinceName",
  "cityCode",
  "cityName",
  "barangayCode",
  "barangayName",
  "addressLine",
] as const satisfies readonly (keyof AddressInput)[];
