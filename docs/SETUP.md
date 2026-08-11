# Setup & Deployment

From a fresh clone to a running console, then to Vercel.

---

## Do I need Docker?

**No.** Nothing in this stack wants a container:

- Neon is hosted Postgres — you get a connection string, not a server to run.
- Vercel builds and runs Next.js natively; a Dockerfile there is slower and
  loses ISR, image optimisation and edge routing.
- Local dev is `npm run dev` against the same Neon database (or a branch of it).

Docker only becomes worth it if you later want a fully offline local database,
or you move off Vercel to a container platform. Neither is on the roadmap. If
you do want offline Postgres one day, `docker run postgres:17` and point
`DATABASE_URL` at it — no application code changes.

---

## Prerequisites

- Node.js 20.9+ (22 LTS recommended — this project was built on 22.17)
- npm 10+
- A [Neon](https://neon.tech) account (free tier is enough)

---

## 1. Install

```bash
npm install
```

## 2. Create the database

1. Sign in to [console.neon.tech](https://console.neon.tech) → **New Project**.
2. Name it `mcsu`, pick the region closest to your users
   (`Asia Pacific (Singapore)` for Manila).
3. **Connect** → copy the **pooled** connection string. It looks like:

   ```
   postgresql://neondb_owner:xxxx@ep-cool-name-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```

   Use the **pooled** endpoint (`-pooler` in the host). Serverless functions
   open many short-lived connections; the pooler is what keeps that from
   exhausting the database.

## 3. Configure environment

```bash
cp .env.example .env.local
```

Fill in:

| Variable | Notes |
| -------- | ----- |
| `DATABASE_URL` | The pooled Neon string from step 2. Must include `?sslmode=require`. |
| `BETTER_AUTH_SECRET` | ≥32 chars. Generate: `npx @better-auth/cli@latest secret` |
| `PORT` | Port `next dev`/`next start` listen on. Optional, defaults to 3000 — avoid 5432, Postgres's standard port, which is often already bound locally even though this app talks to Neon, not a local DB. |
| `BETTER_AUTH_URL` | Must match `PORT` above, e.g. `http://localhost:4000` locally; your real origin in production. |

`src/env.ts` validates these at startup with Zod, so a typo fails immediately
with a readable message rather than at the first query.

> `.env.local` is gitignored. Never commit it. Use a **different**
> `BETTER_AUTH_SECRET` in production — rotating it invalidates all sessions.

## 4. Create the tables

```bash
npm run db:migrate
```

This applies the SQL in `drizzle/`. To inspect the result:

```bash
npm run db:studio     # Drizzle Studio in the browser
```

<details>
<summary>Changing the schema later</summary>

```bash
# 1. edit src/db/schema.ts
npm run db:generate -- add_service_table   # writes drizzle/0001_add_service_table.sql
npm run db:migrate                         # applies it
```

The name after `--` becomes the migration's filename (`0001_add_service_table.sql`)
instead of drizzle-kit's auto-generated one (`0001_dark_lily_hollister.sql`).
It's required — running `db:generate` with no name fails on purpose, so a
migration never ships without a name that says what it does.

Commit the generated SQL. `db:push` skips migration files entirely — handy while
prototyping against a throwaway branch, never against production.
</details>

## 5. Create the first administrator

Two ways. Pick one.

**A — register through the UI (simplest).**
`npm run dev`, open <http://localhost:4000/register>, sign up. The first account
in an empty database is automatically an active **Administrator** — because
otherwise nobody could approve anyone. Every later registration lands in
`pending`.

**B — seed it non-interactively.**

```bash
npm run db:seed
```

Reads `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME`, defaulting
to `admin@questronix.com.ph` / `ChangeMe!MCSU2026`. **Change that password after
first sign-in.**

To also populate User Management with realistic rows to work against:

```bash
npm run db:seed -- --with-demo-users
```

Six demo accounts spanning every role and status, including two pending ones so
you can exercise the approval flow. Re-running is safe — existing emails are
skipped.

## 6. Run

```bash
npm run dev
```

<http://localhost:4000> (or whatever `PORT` is set to in `.env.local`)

---

## Everyday commands

| Command | Does |
| ------- | ---- |
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run check` | Typecheck + lint — run before every commit |
| `npm run db:generate` | Generate a migration from schema changes |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:studio` | Browse the database |
| `npm run db:seed` | Seed the admin (`-- --with-demo-users` for more) |
| `npm run brand:build` | Re-derive `public/brand/*` from the master logo |

---

## Deploying to Vercel

### First deploy

1. Push to GitHub.
2. [vercel.com/new](https://vercel.com/new) → import the repo. Framework
   detection and build settings need no changes.
3. **Environment Variables** — add all three before the first build:

   | Name | Value |
   | ---- | ----- |
   | `DATABASE_URL` | Your Neon pooled string |
   | `BETTER_AUTH_SECRET` | A **fresh** secret, not the local one |
   | `BETTER_AUTH_URL` | `https://<your-project>.vercel.app` |

4. Deploy.
5. Run the migration against production once:

   ```bash
   DATABASE_URL="<production string>" npm run db:migrate
   ```

6. Visit `/register` and create the first administrator.

### After adding a custom domain

Update `BETTER_AUTH_URL` to the real origin and redeploy. Auth callbacks and
cookie domains are derived from it — a stale value breaks sign-in.

### Preview deployments

Neon **database branching** pairs well with Vercel previews: branch the database
per PR so preview deploys never touch production data. Neon's Vercel integration
wires this up automatically. Worth doing before more than one person is
committing.

### Region

Set the Vercel function region near your Neon region (Project → Settings →
Functions). Singapore/`sin1` for a Manila-hosted Neon project. Cross-region
adds ~200ms to every query.

---

## Troubleshooting

**`Invalid environment variables` on start**
`.env.local` is missing or a value failed validation. The message names the
variable and what was wrong.

**`password authentication failed`**
The Neon string was truncated on copy, or the role was rotated. Re-copy from
Neon → Connect.

**Sign-in returns "awaiting approval" for an account you approved**
Approval assigns a role and sets `active`, and deliberately deletes that user's
sessions. Sign in again — the old session is gone by design.

**Everything 500s right after deploy**
Migrations haven't run against the production database. See step 5 above.

**`npm audit` reports moderate issues**
They come from `drizzle-kit`'s bundled esbuild and affect only its local dev
server. `drizzle-kit` is a devDependency and never ships. Nothing to do.
