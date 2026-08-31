"use client";

import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import type { Auth } from "@/lib/auth";

/**
 * `inferAdditionalFields` carries the MCSU-specific user columns (role, status…)
 * through to the client's types without duplicating the declaration.
 */
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<Auth>()],
});

export const { signIn, signUp, signOut, useSession, changePassword, requestPasswordReset, resetPassword, updateUser } =
  authClient;
