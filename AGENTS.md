<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# MCSU Console — working notes

Internal console for the Managed Cloud Services Unit at Questronix Corporation.

## Read first

| Doc | For |
| --- | --- |
| `docs/ARCHITECTURE.md` | How the pieces fit and why |
| `docs/RBAC.md` | Permissions, roles, guards |
| `docs/DESIGN.md` | Tokens, brand rules, accessibility |
| `docs/SETUP.md` | Environment and deployment |
| `docs/ROADMAP.md` | What's next and what's deliberately missing |
| `docs/DOCUMENTS.md` | One-Lot Project Docs — local-disk storage now, SharePoint plan, IT asks |

## Rules that are easy to get wrong

- **Never branch on `role`.** Use `can(user, "permission")` from `src/lib/rbac.ts`.
  Role checks scattered in components are the thing this codebase is built to avoid.
- **Guard on the server, always.** Pages use `requirePermission()`, actions and
  queries use `authorize()`. Hiding a button in the UI is cosmetic.
- **Server actions never `redirect()`** — it breaks the mutation response. They
  return `{ ok: false, error }`; only layouts and pages redirect.
- **`import "server-only"`** in any module that must not reach the browser.
- **Semantic tokens only.** `bg-primary`, never `bg-[#000FBE]`.
- **Orange (`#FE4F00`) is never text on a light surface** — 3.32:1, fails AA.
- **Anything that narrows access must call `revokeSessions()`** — the session
  cookie cache is 5 minutes, so without it a suspended user lingers.
- **Don't hand-edit `public/brand/*`.** Change `scripts/build-brand-assets.mjs`
  and run `npm run brand:build`.
- **Any future module's Edit/Delete must call `diffFields()` + `recordAudit()`**
  (`src/lib/audit.ts`) so it appears in Audit Trail automatically — see
  `docs/RBAC.md#audit-trail`. Don't build a one-off logging path.
- **`src/lib/audit.ts` is server-only; `src/lib/audit-registry.ts` isn't.**
  Client components (badges, filters) import the module/action lists from
  `audit-registry.ts`, never from `audit.ts` — importing a `"server-only"`
  module from a client component throws at runtime, not at build time.
- **One-Lot Project Docs stores files on local disk, and only works there.**
  Vercel serverless functions don't persist writes between requests — never
  remove `isDocumentStorageAvailable()`'s guard in `src/lib/document-storage.ts`
  without replacing the storage backend first. See `docs/DOCUMENTS.md`.

## Before committing

```bash
npm run check     # typecheck + lint, both must be clean
```

The lint config enforces React Compiler rules — no `setState` inside an effect,
and use `useWatch()` rather than `form.watch()` in react-hook-form.
