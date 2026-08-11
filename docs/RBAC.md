# RBAC — Roles, Permissions and Guards

Everything about access control lives in `src/lib/rbac.ts` and
`src/lib/session.ts`. This document explains the model and how to extend it.

---

## The model

Three orthogonal pieces:

1. **Status** — can this account be used at all? (`pending` / `active` / `suspended`)
2. **Role** — what job does this person do? (`admin` / `manager` / `engineer` / `viewer`)
3. **Permission** — what specific capability is being requested? (`users:approve`, …)

Status gates everything. **Only `active` users hold any permission at all**, so
a suspended administrator is exactly as powerless as a pending registrant.
Revoking access is a single status flip.

---

## Roles

| Role | Rank | Holds |
| ---- | ---- | ----- |
| **Administrator** | 40 | Everything, including role assignment, deletion, the audit trail and settings |
| **Manager** | 30 | Read users, approve, suspend, update |
| **Engineer** | 20 | Dashboard only |
| **Viewer** | 10 | Dashboard only |

Rank exists to stop lateral and upward attacks. It is **not** a permission
hierarchy — a manager does not automatically inherit engineer permissions;
each role lists what it holds. Engineer and Viewer currently hold the same
permission (`dashboard:view`) — their rank still differs, so an Engineer
outranks a Viewer the moment either gets a permission the other doesn't (the
first candidate is likely a services/tickets domain, see
[ROADMAP.md](./ROADMAP.md)).

**User Management is Administrator- and Manager-only.** `users:read` is
granted only to those two roles — an Engineer or Viewer who guesses the
`/admin/users` URL hits the `forbidden()` boundary, and the nav item never
renders for them in the first place.

**The Audit Trail is Administrator-only.** `audit:read` is granted only to
`admin` — not even Manager. It's the record of everything everyone did,
including Managers' own approvals and suspensions; a Manager auditing their
own actions isn't a useful control.

## Permissions

```
dashboard:view

users:read          see the directory
users:create        create an account directly
users:update        edit profile fields
users:approve       approve or reject a pending registration
users:suspend       suspend or reinstate
users:delete        permanently remove
users:assign_role   grant or change a role

audit:read
settings:manage
```

---

## The three rules

### 1. Permission check

```ts
can(principal, "users:approve")   // false unless status === "active"
```

**Never branch on `role` directly.** `user.role === "admin"` scattered through
the codebase means a new role requires a grep; `can()` means it requires one
edit to `ROLES` in `src/lib/rbac.ts`.

### 2. Rank rule — who may act on whom

`denyReasonForActingOn(actor, target)` returns a **reason string** when the
action is disallowed, `null` when permitted. It refuses when:

- The actor is the target. Nobody administers their own account through the
  admin tools — an admin cannot accidentally demote or delete themselves and
  lock the workspace.
- The target outranks the actor. A manager cannot suspend an administrator.

Returning the reason rather than a boolean is deliberate: the UI shows that
exact sentence in a tooltip on the disabled control, so a blocked action always
explains itself.

### 3. Grant rule — which roles may be handed out

`assignableRoles(actor)` returns only roles at or below the actor's own rank.
Without this a manager could promote a colleague to administrator and inherit
that access through them.

This applies to **approval too**, not just explicit role changes — approving is
granting a role.

---

## Enforcement points

| Layer | Helper | On failure |
| ----- | ------ | ---------- |
| `src/proxy.ts` | cookie presence only | redirect `/login` |
| Layout | `requireUser()` | redirect `/login` or `/pending` |
| Page | `requirePermission(p)` | render `forbidden.tsx` (403) |
| Server action | `authorize(p)` | return `{ ok: false, error }` |
| Query | `authorize(p)` | throws `AuthorizationError` |
| UI | `can()` / `canActOn()` | hide or disable with a reason |

**The UI layer is cosmetic.** Hiding a button is a courtesy; the server action
behind it re-checks unconditionally. Never rely on a hidden control.

Actions must not redirect — a server action that calls `redirect()` breaks the
mutation's response. That is why `authorize()` throws while
`requirePermission()` redirects.

---

## Lifecycle

```
register ──> pending ──approve(role)──> active ──suspend──> suspended
                │                          ▲                    │
                └──reject──> deleted       └────reinstate───────┘
```

- **Register** — always `pending`, always no role. Except the very first account
  in an empty database, which is bootstrapped to active admin.
- **Approve** — sets `active` and assigns a role in one step. An approved user
  without a role could sign in and see nothing.
- **Reject** — deletes the row rather than leaving a tombstone, so someone
  turned down by mistake can register again.
- **Suspend / role change** — deletes all of that user's sessions immediately.

Every transition writes to `audit_log` with actor, entity and a field-level
before/after diff — see below.

---

## Audit Trail

`/admin/audit`, Administrator-only. Every entry has: who (`actorId`/
`actorEmail`), what module and record (`module`, `entityId`, `entityLabel`),
what happened (`action`), a field-level diff (`changes: { field, label,
oldValue, newValue }[]`), and when (`createdAt`). Schema is in
`src/db/schema.ts`; the write API is `src/lib/audit.ts`.

**This is generic on purpose — it isn't User Management's audit log with a
page bolted on, it's the audit log every future module writes to.**
`module` and `action` are plain text, not DB enums, so a new module never
needs a migration just to start logging (same reasoning as `PERMISSIONS`
living in code, not a table — see above). `entityId` has no foreign key: one
column can't reference N different future tables, so it's a plain snapshot,
not a live reference — which is also why `entityLabel` is captured at write
time rather than joined live, so a row still reads correctly after the record
is renamed or deleted.

### The convention every future Edit/Delete follows

```ts
import { diffFields, recordAudit } from "@/lib/audit";

const changes = diffFields(before, after, { name: "Name", status: "Status" });
if (changes.length > 0) {
  await recordAudit({
    module: "clients",              // add to AUDIT_MODULES in src/lib/audit-registry.ts first
    action: "updated",              // or "created" / "deleted" / a domain-specific verb
    entityId: client.id,
    entityLabel: client.name,
    actorId: actor.id,
    actorEmail: actor.email,
    changes,
  });
}
```

`diffFields(before, after, labels)` compares two plain snapshots and returns
only the fields that actually changed. Pass `after: null` for a delete —
every field then reads as "value → (removed)". This one call is the entire
integration surface; nothing else needs to know the Audit Trail page exists.
See `src/server/users/actions.ts` for five worked examples (approve, reject,
suspend/reinstate, role change, delete).

---

## Extending

### Add a permission

1. Append to `PERMISSIONS` in `src/lib/rbac.ts`.
2. Add it to the roles that should hold it in `ROLES`.
3. Use it: `requirePermission("reports:export")` on the page,
   `authorize("reports:export")` in the action.

TypeScript will flag any `Permission` string that doesn't exist.

### Add a role

1. Add the value to the `userRole` pgEnum in `src/db/schema.ts`.
2. `npm run db:generate && npm run db:migrate`.
3. Add its entry to `ROLES` with a `rank` that places it correctly.
4. Add an icon in `ROLE_ICONS` (`src/components/users/user-badges.tsx`).

Pick the rank carefully — it decides who can manage and grant this role.

### Move permissions into the database

Worth doing when non-engineers need to edit them without a deploy. The shape:

1. Add `role`, `permission`, `role_permission` tables.
2. Load the matrix in `getCurrentUser()` and attach it to the principal.
3. Change `can()` to read from the principal's permission set instead of
   `ROLES`.

Call sites don't change — they already ask `can(user, "…")`. That is the payoff
for never branching on `role` directly.

---

## Deliberate gaps

- **No self-service password reset.** Needs an email provider; an admin resets
  out of band for now.
- **No rate limiting on sign-in.** Add before any public exposure —
  BetterAuth ships a `rateLimit` option.
- **No 2FA.** BetterAuth has a `twoFactor` plugin when it's wanted.
- **No permission caching.** The matrix is a constant, so there is nothing to
  cache — this only becomes a question if the matrix moves to the database.
