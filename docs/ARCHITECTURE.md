# Architecture — MCSU Console

How the pieces fit, and why they were chosen. Read this before adding a feature.

---

## Stack

| Concern     | Choice                            | Why |
| ----------- | --------------------------------- | --- |
| Framework   | Next.js 16 (App Router, Turbopack) | Server components mean authorization runs before markup exists |
| UI          | React 19.2, Tailwind 4, shadcn/ui  | Tokens in CSS, components in our repo — no black-box theming |
| Icons       | Lucide                             | Consistent 24px grid, tree-shakeable |
| Database    | Neon Postgres                      | Serverless, scales to zero, branches per preview deploy |
| ORM         | Drizzle                            | SQL-shaped, fully typed, no runtime codegen step |
| Auth        | BetterAuth                         | Owns its tables in *our* database; hooks let us gate sign-in |
| Server state| TanStack Query                     | Cache, invalidation and request dedupe we'd otherwise hand-roll |
| Forms       | react-hook-form + Zod              | One schema validates on client and server |
| Hosting     | Vercel                             | First-party Next.js runtime |

---

## Directory map

```
src/
  app/
    (auth)/            Split-panel shell — login, register, pending, forgot-password
    (app)/             Authenticated shell — sidebar + topbar
      announcements/     Post-login landing page
      employees/       Directory, add, view/edit
      projects/        S3P directory, add, view/edit
      admin/users/
      admin/maintenance/
      admin/audit/
      admin/access-control/
    api/auth/[...all]/ BetterAuth request handler
    forbidden.tsx      403 boundary, rendered by forbidden()
    error.tsx          Top-level error boundary
  components/
    brand/             Logo, BrandMark
    auth/              Login and registration forms
    layout/            Sidebar, topbar, user menu, PageHeader, EmptyState
    users/             User Management table, badges, dialogs
    roles/             Access Control list, permission matrix, role dialog
    employees/         Directory table, profile form, employment/deployment history
    projects/          S3P directory table, project form, financial detail lines
    maintenance/       Generic lookup-list table reused by every Maintenance kind
    audit/             Audit Trail table, badges
    ui/                shadcn primitives + hand-built date-range-picker
  db/
    schema.ts          Drizzle tables, enums, relations
    index.ts           The `db` singleton
  hooks/
    use-debounced.ts   Shared by every filterable table's search box
  lib/
    auth.ts            BetterAuth server config  (server only)
    auth-client.ts     BetterAuth React client
    rbac.ts            Permissions, modules, rank rules  (isomorphic)
    session.ts         requireUser / requirePermission / authorize
    audit.ts           recordAudit() + diffFields()  (server only — see below)
    audit-registry.ts  Module/action lists + default date range  (isomorphic)
    navigation.ts      Sidebar definition, RBAC-filtered
    format.ts          Shared date formatting
    employee-format.ts Name/currency/period formatting shared by Employees & Projects
    validation/        Zod schemas shared by forms and actions
  server/
    users/             Queries, server actions, shared types
    roles/             Queries, server actions, shared types — Access Control
    employees/         Queries, server actions, shared types
    projects/          Queries, server actions, shared types — S3P
    maintenance/       Queries, server actions, shared types — every lookup kind
    audit/             Queries (read-only — nothing to mutate), shared types
  env.ts               Zod-validated environment
  proxy.ts             Optimistic redirect (Next 16's middleware successor)
scripts/
  build-brand-assets.mjs
  seed.ts
drizzle/               Generated SQL migrations — commit these
```

---

## Request flow

### Reading a protected page

```
Browser → proxy.ts            cookie present? no → redirect /login  (no DB hit)
        → (app)/layout.tsx    requireUser() → getCurrentUser() → BetterAuth → DB
        → page.tsx            requirePermission("users:read") → forbidden() if not
        → listUsers()         authorize("users:read") again, then query
        → HydrationBoundary   dehydrated cache streamed into the HTML
        → UsersView           TanStack Query adopts it — no loading flash
```

Authorization appears three times on purpose. `proxy.ts` is a UX optimisation
that only checks for a *cookie*; the layout is the real gate; the query guards
itself so it stays safe if called from anywhere else later.

### Mutating

```
UsersView → server action → authorize(permission)   who are you, can you do this
                          → loadTarget()            do you outrank the target
                          → db.update()
                          → revokeSessions()        if access narrowed
                          → recordAudit()
                          → revalidatePath()
          ← ActionResult  → toast + queryClient.invalidateQueries()
```

Actions return `{ ok: false, error }` rather than throwing. A refused action is
a normal outcome to render, not an exception to crash on.

---

## Decisions worth knowing

### Server components by default

Only components needing state, effects or event handlers get `"use client"`.
The sidebar is a client component (it reads `usePathname`); the layout that
renders it is not, so the session check never ships to the browser.

### Server actions as the only write path

There is no REST API for user management. TanStack Query's `mutationFn` calls a
server action directly. One code path, typed end to end, no route handlers to
keep in sync.

`fetchUsers` and `fetchAuditLog` are likewise server actions used as
`queryFn`s — the same `authorize()` guard applies to reads and writes alike.
Audit Trail has no `actions.ts` mutations of its own; it's read-only by
design, so `src/server/audit/` only has `queries.ts`.

### Neon HTTP driver — no transactions

`src/db/index.ts` uses `drizzle-orm/neon-http`: one round trip per query, no
pool, works in every Vercel runtime. The cost is **no interactive
transactions**. Nothing today needs one. If that changes, switch that file to
`drizzle-orm/neon-serverless` (WebSocket `Pool`); no other file changes.

### Session cookie cache, and why revocation is safe

Sessions are cached in a signed cookie for 5 minutes, which keeps the "who am
I" read off the database on most requests. That cache could in principle let a
just-suspended user linger — so **every action that narrows access deletes the
user's session rows** (`revokeSessions`). Suspension, deletion and role changes
all do this. A stale cache can never outlive a revocation.

Role *promotions* also revoke, even though they widen access. One rule is
easier to trust than two.

### Roles live in a table, permissions live in code

Which permissions exist (`PERMISSIONS`, `MODULES`, `ACTIONS` in
`src/lib/rbac.ts`) is a TypeScript constant — a new module or action is a code
change and a deploy, same reasoning as the audit log's module/action lists.
Which roles exist and **which permissions each one holds** is a `role` table
instead, editable at runtime from Access Control (`/admin/access-control`) —
this was a code object (`ROLES`) until an admin-editable matrix was asked for;
see [RBAC.md](./RBAC.md) for the resulting model. `can()` stays a pure,
synchronous check either way: the principal's permission set is loaded once
per request (`getCurrentUser()`, joined alongside the role) and handed to it
as plain data, so call sites never changed.

### The audit log is generic, not per-feature

`audit_log` has no `user_id`-shaped columns — it's `module` + `entityId` +
`entityLabel` + a field-level `changes[]` diff, deliberately shaped to fit any
future domain table, not just `user`. `module`/`action` are plain text rather
than DB enums for the same reason `PERMISSIONS` is a constant, not a table: a
new module (or a new action verb) should never require a migration just to
start being logged.
`entityId` has no foreign key — a single audit table can't reference N
different future tables, so it's a snapshot, not a live join. Role-change
diffs go a step further and store the role's *label* rather than its id, for
the same reason — the entry must still read correctly after the role itself
is renamed or deleted. The entire integration surface for a future module is
one call:
`recordAudit({ module, action, entityId, entityLabel, changes: diffFields(before, after, labels) })`.
See [RBAC.md](./RBAC.md#audit-trail) for the full convention.

### Registration cannot grant privilege

`roleId` and `status` are declared `input: false` in BetterAuth's
`additionalFields`, so they are stripped from the sign-up payload no matter what
the client posts. A registrant lands as `pending` with no effective permissions.

The **first** account to register is bootstrapped to active admin — otherwise
there would be nobody able to approve anyone.

### Sign-in is blocked at session creation

The `databaseHooks.session.create.before` hook throws for `pending` and
`suspended` users. They never receive a credential at all, which is stronger
than issuing one and asking every page to re-check.

### Audit writes never throw

`recordAudit()` swallows and logs its errors. A failing audit insert must not
roll back the action the user asked for, or break a login.

---

## Conventions

- **Never check roles directly.** `can(user, "users:approve")`, not
  `user.role === "admin"`.
- **`import "server-only"`** at the top of any module that must not reach the
  browser (`db/`, `lib/auth.ts`, `lib/session.ts`, `server/*/queries.ts`).
- **Validate at the boundary.** Zod-parse every server action input, even when
  the form already validated it.
- **Errors are user-facing.** Log the detail, return a sentence a person can act
  on. Never leak internals to the browser.
- **Comment the why.** The what is in the code.

---

## Testing

Not yet wired up — the first meaningful additions, in order:

1. `src/lib/rbac.ts` — pure functions, highest security value per line. Vitest.
2. Server actions against a Neon branch, asserting that a manager cannot suspend
   an admin and that a suspended user's sessions are gone.
3. Playwright for register → pending → approve → sign in.

See [ROADMAP.md](./ROADMAP.md).
