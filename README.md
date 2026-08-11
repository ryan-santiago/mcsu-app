<div align="center">
  <img src="public/brand/logo.png" alt="QNX Questronix — QSERV-MCSU" width="440" />

  <h1>MCSU Console</h1>

  <p><strong>Managed Cloud Services Unit</strong> — Questronix Corporation</p>
</div>

---

Internal console for running the MCSU: the people, the access, and — as it
grows — the services the unit delivers.

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind 4 · shadcn/ui · Lucide ·
Neon Postgres · Drizzle ORM · BetterAuth · TanStack Query · Vercel

## Quick start

```bash
npm install
cp .env.example .env.local     # add your Neon URL + a generated auth secret
npm run db:migrate
npm run dev
```

Open <http://localhost:4000/register>. **The first account to register becomes
the administrator** — every account after that lands in a pending queue until an
admin approves it.

Full instructions, including Vercel deployment: **[docs/SETUP.md](docs/SETUP.md)**

## What's here

| | |
| --- | --- |
| **Authentication** | Email + password, sessions, pending-approval gate |
| **RBAC** | 4 roles · 10 permissions · rank rules · guarded at every layer |
| **User Management** | Approve, assign roles, suspend, reinstate, remove |
| **Audit Trail** | Admin-only. Date range, module/action filters, field-level old→new diff. Generic — every future module's Edit/Delete appears here automatically |
| **Dashboard** | Frame and guard in place; content to come |

## Roles

| Role | Can |
| ---- | --- |
| **Administrator** | Everything, including roles, deletion, the audit trail and settings |
| **Manager** | Approve access, suspend |
| **Engineer** | Dashboard only |
| **Viewer** | Dashboard only |

## Documentation

| Doc | Read it when |
| --- | ------------ |
| [SETUP.md](docs/SETUP.md) | Setting up locally or deploying to Vercel |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Adding a feature — how the pieces fit and why |
| [RBAC.md](docs/RBAC.md) | Touching permissions, roles or guards |
| [DESIGN.md](docs/DESIGN.md) | Building UI — tokens, brand rules, accessibility |
| [ROADMAP.md](docs/ROADMAP.md) | Deciding what to build next |

## Commands

```bash
npm run dev            # dev server
npm run check          # typecheck + lint — run before committing
npm run build          # production build
npm run db:generate    # create a migration from schema changes
npm run db:migrate     # apply migrations
npm run db:studio      # browse the database
npm run db:seed        # seed the admin (-- --with-demo-users for sample data)
npm run brand:build    # re-derive public/brand/* from the master logo
```

## Conventions worth knowing before your first commit

- **Never branch on `role`.** Ask `can(user, "users:approve")`. One edit to the
  matrix beats a grep across the codebase.
- **The UI is not a security boundary.** Hiding a button is a courtesy; the
  server action behind it re-checks unconditionally.
- **Use semantic tokens**, not hex. `bg-primary`, never `bg-[#000FBE]`.
- **Orange is never text on a light surface** — it fails contrast. See
  [DESIGN.md](docs/DESIGN.md).
- `import "server-only"` in anything that must not reach the browser.

---

<sub>© Questronix Corporation · QSERV-MCSU · QNX Services</sub>
