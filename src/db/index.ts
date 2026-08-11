import "server-only";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { env } from "@/env";

import * as schema from "./schema";

/**
 * Neon's HTTP driver: one round trip per query, no connection pool to manage,
 * and it works in every Vercel runtime. The trade-off is no interactive
 * transactions — `db.transaction()` is unavailable. Nothing in the app needs
 * one today; if that changes, switch this file to `drizzle-orm/neon-serverless`
 * (WebSocket `Pool`) and the rest of the codebase stays unchanged.
 */
const sql = neon(env.DATABASE_URL);

export const db = drizzle(sql, { schema });

export { schema };
export * from "./schema";
