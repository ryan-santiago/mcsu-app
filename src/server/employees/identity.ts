import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { formatEmployeeDisplayName } from "@/lib/employee-format";

import { employeeIdentitySubquery } from "./queries";

export type EmployeeIdentity = {
  id: string;
  displayName: string;
  position: string | null;
};

/**
 * Matches a signed-in user to their HR record by work email, so the console
 * can show the name and latest Level-Position Employees maintains instead of
 * what the registrant typed at sign-up. Deliberately not gated behind
 * `employees:read` — it only ever resolves the caller's own email, never an
 * arbitrary lookup a client could point at someone else.
 */
export async function getEmployeeIdentityByEmail(email: string): Promise<EmployeeIdentity | null> {
  const identity = employeeIdentitySubquery();

  const [row] = await db
    .select({
      id: identity.id,
      firstName: identity.firstName,
      lastName: identity.lastName,
      levelName: identity.levelName,
      positionName: identity.positionName,
    })
    .from(identity)
    .where(eq(identity.workEmailLower, email.trim().toLowerCase()))
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    displayName: formatEmployeeDisplayName(row),
    position: row.levelName && row.positionName ? `${row.levelName} - ${row.positionName}` : null,
  };
}
