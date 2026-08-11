import "server-only";

import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { count, eq } from "drizzle-orm";

import { db } from "@/db";
import { account, session, user, verification } from "@/db/schema";
import { env } from "@/env";
import { diffFields, recordAudit } from "@/lib/audit";

/**
 * Shown when a registered-but-unapproved user tries to sign in. The login form
 * matches on this text to route them to the friendlier /pending screen.
 */
export const PENDING_APPROVAL_MESSAGE =
  "Your account is awaiting approval from an MCSU administrator.";

export const SUSPENDED_MESSAGE =
  "Your account has been suspended. Contact an MCSU administrator for help.";

export const auth = betterAuth({
  appName: "MCSU Console",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,

  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    // No inbox is wired up yet, so verification links would strand users.
    // Approval by an administrator is the gate instead. See docs/ROADMAP.md.
    requireEmailVerification: false,
    autoSignIn: false,
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh the expiry at most once a day
    cookieCache: {
      // Keeps the common "who am I" read off the database, at the cost of the
      // cached copy being up to 5 minutes stale. Anything that revokes access
      // (suspend, delete, role change) deletes the user's sessions outright, so
      // a stale cache cannot outlive a revocation.
      enabled: true,
      maxAge: 60 * 5,
    },
  },

  user: {
    additionalFields: {
      // `input: false` keeps these out of the sign-up payload — a registrant
      // must not be able to hand themselves a role or an active status.
      role: { type: "string", required: false, defaultValue: "viewer", input: false },
      status: { type: "string", required: false, defaultValue: "pending", input: false },
      jobTitle: { type: "string", required: false, input: true },
      approvedAt: { type: "date", required: false, input: false },
      approvedBy: { type: "string", required: false, input: false },
      lastLoginAt: { type: "date", required: false, input: false },
    },
  },

  advanced: {
    database: {
      generateId: () => crypto.randomUUID(),
    },
  },

  databaseHooks: {
    user: {
      create: {
        /**
         * Bootstrap: the very first account to register owns the workspace,
         * because otherwise there would be nobody able to approve anyone. Every
         * later registration lands in `pending` with no effective permissions.
         */
        before: async (newUser) => {
          const [{ value: existing }] = await db.select({ value: count() }).from(user);
          const isFirstUser = existing === 0;

          return {
            data: {
              ...newUser,
              role: isFirstUser ? "admin" : "viewer",
              status: isFirstUser ? "active" : "pending",
              approvedAt: isFirstUser ? new Date() : null,
            },
          };
        },
        after: async (createdUser) => {
          const created = createdUser as typeof createdUser & {
            role?: string;
            status?: string;
            jobTitle?: string | null;
          };

          await recordAudit({
            module: "users",
            action: "created",
            entityId: created.id,
            entityLabel: created.name,
            changes: diffFields(
              null,
              { name: created.name, email: created.email, jobTitle: created.jobTitle ?? null, role: created.role, status: created.status },
              { name: "Name", email: "Email", jobTitle: "Job Title", role: "Role", status: "Status" },
            ),
          });
        },
      },
    },

    session: {
      create: {
        /**
         * The real login gate. Refusing to create the session means a pending or
         * suspended user never holds a credential at all — safer than issuing a
         * session and relying on every page to check status.
         */
        before: async (newSession) => {
          const [record] = await db
            .select({ status: user.status, email: user.email })
            .from(user)
            .where(eq(user.id, newSession.userId))
            .limit(1);

          if (!record) {
            throw new APIError("UNAUTHORIZED", { message: "Account not found." });
          }

          if (record.status === "pending") {
            throw new APIError("FORBIDDEN", { message: PENDING_APPROVAL_MESSAGE });
          }

          if (record.status === "suspended") {
            throw new APIError("FORBIDDEN", { message: SUSPENDED_MESSAGE });
          }

          return { data: newSession };
        },

        after: async (createdSession) => {
          await db
            .update(user)
            .set({ lastLoginAt: new Date() })
            .where(eq(user.id, createdSession.userId));

          await recordAudit({
            module: "auth",
            action: "login",
            entityId: createdSession.userId,
            actorId: createdSession.userId,
            ipAddress: createdSession.ipAddress ?? null,
          });
        },
      },
    },
  },

  // Must stay last: it lets server actions and route handlers set auth cookies.
  plugins: [nextCookies()],
});

export type Auth = typeof auth;
export type AuthSession = Auth["$Infer"]["Session"];
export type AuthUser = AuthSession["user"];
