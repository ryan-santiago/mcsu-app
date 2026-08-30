import { z } from "zod";

const urlSchema = z.url();

/**
 * `credentialUrl` is optional here — a Certification record needs at least
 * one of "URL" or "an uploaded file" as proof, but the file itself isn't
 * part of this schema (it arrives via `FormData`, not JSON), so that
 * cross-field rule is enforced in the action layer, where the presence of an
 * uploaded/kept file is actually known.
 */
export const certificationFormSchema = z.object({
  title: z.string().trim().min(1, "Required").max(200, "That's too long"),
  dateAcquired: z.string().min(1, "Select a date"),
  credentialUrl: z
    .string()
    .trim()
    .max(2048, "That's too long")
    .refine((value) => value === "" || urlSchema.safeParse(value).success, "Enter a valid URL"),
});

export type CertificationFormInput = z.infer<typeof certificationFormSchema>;
