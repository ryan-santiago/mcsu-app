# RBAC — Roles, Permissions and Guards

Everything about access control lives in `src/lib/rbac.ts`, `src/lib/session.ts`
and `src/server/roles/`. This document explains the model and how to extend it.

---

## The model

Three orthogonal pieces:

1. **Status** — can this account be used at all? (`pending` / `active` / `suspended`)
2. **Role** — a row in the `role` table, admin-editable through Access Control
   (`/admin/access-control`), not a fixed enum.
3. **Permission** — what specific capability is being requested? Named
   `module:action` (e.g. `users:edit`), and *always* one of the fixed
   `PERMISSIONS` in `src/lib/rbac.ts` — modules and actions are code-defined,
   only which roles hold which permission is admin-editable.

Status gates everything. **Only `active` users hold any permission at all**, so
a suspended administrator is exactly as powerless as a pending registrant.
Revoking access is a single status flip.

---

## Roles are data, not code

Roles live in the `role` table (`src/db/schema.ts`): `id` (a slug, e.g.
`"admin"`), `label`, `description`, `rank`, `isSystem`, and `permissions`
(`Permission[]`, stored as `jsonb`). `user.roleId` is a foreign key to it
(`onDelete: "restrict"` — a role in use can't be deleted).

An administrator manages every role's permissions from **Access Control**
(`/admin/access-control`, gated on `access_control:*`) — the Read/Write/Edit/
Delete/All matrix per module. No deploy required to change what a role can do.

| Role | Rank | isSystem | Default permissions |
| ---- | ---- | -------- | -------------------- |
| **Administrator** | 40 | yes, **locked** | Every permission, forever — see below |
| **Manager** | 30 | yes | Dashboard, Employees & Projects: full · Users & Access: read + edit · Maintenance/Device Inventory/Audit Trail/Settings/Access Control: read only |
| **Engineer** | 20 | no | Dashboard: read only |
| **Viewer** | 10 | no | Dashboard: read only |

**Administrator's permissions are locked** two ways, not just seeded that way:
`can()` (`src/lib/rbac.ts`) short-circuits to `true` for `principal.roleId ===
"admin"` regardless of what's stored in its `role.permissions` row, and
`updateRolePermissions()` (`src/server/roles/actions.ts`) separately
hard-refuses any change to the `"admin"` row (the matrix UI renders it checked
and disabled). The `can()` check is what actually matters day to day: it
means Administrator automatically holds a **newly added** permission — a new
module, a new action — the moment it exists in `PERMISSIONS`, with no data
migration required to backfill its stored row. Every other role's access
comes entirely from what's actually stored in its `permissions` array, so
adding a new module (see "Add a permission" below) still means deciding what
Manager/Engineer/Viewer/custom roles should get, and, for an already-running
database, writing that into their existing rows.

**Manager and Administrator are `isSystem`** — `deleteRole()` refuses to
remove them. Manager's permissions, unlike Administrator's, are ordinary data:
an admin can widen or narrow them from Access Control like any other role.

**Engineer and Viewer are ordinary roles** seeded with their historical
single permission. They can be edited, renamed, or (once no user holds them)
deleted, exactly like a role created from scratch. **Any number of new roles
can be created** from Access Control — "Add role" takes a name, description
and rank; new roles start with zero permissions and are granted from the
matrix.

Rank exists to stop lateral and upward attacks. It is **not** a permission
hierarchy — a role does not automatically inherit a lower-ranked role's
permissions; each role's `permissions` column is authoritative on its own.
Creating a role means choosing a rank that places it correctly relative to
the roles it should (and shouldn't) be able to manage.

**User Management is Administrator- and Manager-only** by default (`users:read`
in each role's matrix) — an Engineer or Viewer who guesses the `/admin/users`
URL hits the `forbidden()` boundary, and the nav item never renders for them.
Because this is now data, it's a matrix edit away from changing, not a
deploy.

## Permissions

9 modules × 4 actions = 36 permissions, all always defined (`PERMISSIONS` in
`src/lib/rbac.ts`), whether or not every cell is wired to a real guard yet:

```
dashboard      read / write / edit / delete   (only `read` has a guard today)
users          read / write / edit / delete   (edit covers approve/reject,
                                                 suspend/reinstate, role change)
employees      read / write / edit / delete   (read includes salary visibility)
projects       read / write / edit / delete   (edit covers S3P detail lines
                                                 and their team assignments)
maintenance    read / write / edit / delete
devices        read / write / edit / delete   (edit covers deployment history —
                                                 assigning/returning a device)
audit          read / write / edit / delete   (write/edit/delete permanently
                                                 inert — the log is immutable)
settings       read / write / edit / delete   (screen not built yet)
access_control read / write / edit / delete   (governs Access Control itself)
```

`ACTIONS` and `MODULES` (also in `src/lib/rbac.ts`) are what the Access
Control matrix iterates to draw its rows and columns — see
`src/components/roles/role-permission-matrix.tsx`. "All" in that UI is never
itself a stored permission; it's derived (checked when the row's other four
are) and, when toggled, sets or clears all four at once.

---

## The three rules

### 1. Permission check

```ts
can(principal, "users:edit")   // false unless status === "active"
```

`principal.permissions` is loaded once per request from the user's role
(`getCurrentUser()` in `src/lib/session.ts` joins `user` ⋈ `role`) — `can()`
itself stays a pure, synchronous array-includes check, safe to call from
client components, unchanged from when it read a static object.

**Never branch on a role id directly.** `user.roleId === "admin"` scattered
through the codebase means a new role requires a grep; `can()` means it
requires an edit in Access Control, no code change at all. (The one
deliberate exception is the Administrator-lock check in
`updateRolePermissions()` — see above.)

### 2. Rank rule — who may act on whom

`denyReasonForActingOn(actor, target)` returns a **reason string** when the
action is disallowed, `null` when permitted. It refuses when:

- The actor is the target. Nobody administers their own account through the
  admin tools — an admin cannot accidentally demote or delete themselves and
  lock the workspace.
- The target's role outranks the actor's. A manager cannot suspend an
  administrator.

Returning the reason rather than a boolean is deliberate: the UI shows that
exact sentence in a tooltip on the disabled control, so a blocked action always
explains itself.

### 3. Grant rule — which roles may be handed out

`assignableRoles(actor, allRoles)` returns only roles at or below the actor's
own rank, from the full role list fetched server-side
(`listRoleOptions()` in `src/server/roles/queries.ts`) and passed down as a
prop. Without this a manager could promote a colleague to administrator and
inherit that access through them.

This applies to **approval too**, not just explicit role changes — approving is
granting a role.

---

## Enforcement points

| Layer | Helper | On failure |
| ----- | ------ | ---------- |
| `src/proxy.ts` | cookie presence only | redirect `/login` |
| Layout | `requireUser()` | redirect `/login` or `/pending` |
| Page | `requirePermission(p)` | render `forbidden.tsx` (403) |
| Server action | `authorize(p)` / `authorizeAny([p, …])` | return `{ ok: false, error }` |
| Query | `authorize(p)` / `authorizeAny([p, …])` | throws `AuthorizationError` |
| UI | `can()` / `canAny()` / `canActOn()` | hide or disable with a reason |

**The UI layer is cosmetic.** Hiding a button is a courtesy; the server action
behind it re-checks unconditionally. Never rely on a hidden control.

Actions must not redirect — a server action that calls `redirect()` breaks the
mutation's response. That is why `authorize()`/`authorizeAny()` throw while
`requirePermission()` redirects.

---

## Lifecycle

```
register ──> pending ──approve(role)──> active ──suspend──> suspended
                │                          ▲                    │
                └──reject──> deleted       └────reinstate───────┘
```

- **Register** — always `pending`, always no effective role. Except the very
  first account in an empty database, which is bootstrapped to active admin.
- **Approve** — sets `active` and assigns a role in one step. An approved user
  without a role could sign in and see nothing.
- **Reject** — deletes the row rather than leaving a tombstone, so someone
  turned down by mistake can register again.
- **Suspend / role change** — deletes all of that user's sessions immediately.
- **A role's permissions change** — deletes the sessions of *every* user
  holding that role (`revokeSessionsForRole()` in
  `src/server/roles/actions.ts`). Editing a role can narrow many people's
  access at once; the 5-minute session cookie cache must not let any of them
  outlive that change.

Every transition writes to `audit_log` with actor, entity and a field-level
before/after diff — see below.

---

## Display identity (name & position)

`CurrentUser.name` (what the registrant typed at registration) and
`CurrentUser.displayName` (what the UI shows) are not the same field.
`getCurrentUser()` matches the account's email against `employee.workEmail`
(case-insensitively, via `getEmployeeIdentityByEmail()` in
`src/server/employees/identity.ts`) and, if a match exists, uses that
Employee's name and latest Level/Position instead:

- `displayName` — the matched Employee's full name, else `name` as typed at
  registration.
- `position` — `"<Level> - <Position>"` from the Employee's current (or most
  recent) `employeeEmployment` row, else `null`.

Registration no longer collects a job title — `position` is always derived,
never typed. `listUsers`/`getUserById` (`src/server/users/queries.ts`) run the
same match, so User Management shows the identical identity. The lookup is
deliberately ungated (no `employees:read` check) because it only ever
resolves the caller's own email, never an arbitrary one a client could supply.

---

## Audit Trail

`/admin/audit`, Administrator-only by default. Every entry has: who (`actorId`/
`actorEmail`), what module and record (`module`, `entityId`, `entityLabel`),
what happened (`action`), a field-level diff (`changes: { field, label,
oldValue, newValue }[]`), and when (`createdAt`). Schema is in
`src/db/schema.ts`; the write API is `src/lib/audit.ts`.

**This is generic on purpose — it isn't User Management's audit log with a
page bolted on, it's the audit log every future module writes to.**
`module` and `action` are plain text, not DB enums, so a new module never
needs a migration just to start logging. `entityId` has no foreign key: one
column can't reference N different future tables, so it's a plain snapshot,
not a live reference — which is also why `entityLabel` is captured at write
time rather than joined live, so a row still reads correctly after the record
is renamed or deleted. Role-change diffs follow the same rule: they store the
role's **label** at write time, not its id, so the audit trail still reads
correctly after a role is later renamed or deleted.

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
suspend/reinstate, role change, delete) and `src/server/roles/actions.ts` for
role create/update/permissions-change/delete.

---

## Extending

### Add a permission

1. Append to `PERMISSIONS` in `src/lib/rbac.ts` — and to `MODULES` if it's an
   entirely new module, so it gets its own row in the Access Control matrix.
2. Administrator gets it automatically (`can()`'s admin special-case — see
   above). Grant it to whichever other roles should hold it from
   `/admin/access-control` — no code change, no deploy, for any database
   created after this point. For an **already-running** database, seed a
   data migration that appends the new permission(s) to the existing rows of
   whichever roles should have it (see `drizzle/0005_seed_roles.sql` and the
   Projects module's role-permission migration for the pattern) — Access
   Control can't grant a permission that doesn't exist in a role's stored
   array yet if nobody's opened the matrix and saved it.
3. Use it: `requirePermission("reports:export")` on the page,
   `authorize("reports:export")` in the action.

TypeScript will flag any `Permission` string that doesn't exist.

### Add a role

Use **Access Control** (`/admin/access-control`) → "Add role": name,
description, rank. It starts with zero permissions — grant them from the
matrix. No migration, no deploy.

Pick the rank carefully — it decides who can manage and grant this role.
Built-in roles keep dedicated icons in `ROLE_ICONS`
(`src/components/users/user-badges.tsx`); any other role gets a generic
fallback icon automatically.

---

## Deliberate gaps

- **No self-service password reset.** Needs an email provider; an admin resets
  out of band for now.
- **No rate limiting on sign-in.** Add before any public exposure —
  BetterAuth ships a `rateLimit` option.
- **No 2FA.** BetterAuth has a `twoFactor` plugin when it's wanted.
- **No permission caching.** Permissions load once per request alongside the
  session (`getCurrentUser()`'s `cache()` wrapper already dedupes that per
  render pass) — worth revisiting only if that join shows up as a real cost.
