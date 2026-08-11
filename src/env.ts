import { z } from "zod";

/**
 * Server-side environment. Imported only from server code — importing this from
 * a client component will (correctly) fail the build, since these values must
 * never reach the browser.
 */
const serverSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required — copy your Neon connection string into .env.local"),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "BETTER_AUTH_SECRET must be at least 32 characters — run `npx @better-auth/cli secret`"),
  BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

function loadServerEnv() {
  const parsed = serverSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  • ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment variables:\n${issues}\n\nSee SETUP.md for the full list.`);
  }

  return parsed.data;
}

export const env = loadServerEnv();
