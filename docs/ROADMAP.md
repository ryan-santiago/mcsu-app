# Roadmap

What is built, what is deliberately missing, and what to build next.

---

## Shipped

- Split-panel login, registration and pending-approval screens
- BetterAuth email/password with sessions, sign-in blocked for
  pending/suspended accounts
- Drizzle schema on Neon: user, session, account, verification, audit_log
- RBAC: admin-editable roles and permissions (Access Control), rank rules,
  guards on layout, page, action and query — see [RBAC.md](./RBAC.md)
- App shell: RBAC-filtered sidebar, topbar, mobile drawer, light/dark/system
- Dashboard (intentionally empty — the frame and guard are in place)
- User Management: search, status filters, approve with role assignment,
  reject, role change, suspend/reinstate, remove
- Employees: directory, profile, employment and deployment history
- Projects (S3P): directory, project identity/assignments, financial detail
  lines with per-line team assignment and computed totals
- Maintenance: admin-editable lookup lists (Client, Position, Level, Gender,
  Team, Sales Representative, Solutions Manager, Engagement Type)
- Audit Trail: Administrator-only page under Administration — date range,
  module and action filters, actor/entity search, expandable field-level
  diff, pagination. Generic across modules by design: any future module's
  Edit/Delete calls `recordAudit()` + `diffFields()` once and it shows up
  here automatically — see [RBAC.md](./RBAC.md#audit-trail)
- Brand asset pipeline deriving all logo variants from the master artwork

---

## Deliberately missing

Each of these is a decision, not an oversight.

| Gap | Why | Cost to add |
| --- | --- | ----------- |
| Email verification | No transactional sender configured; verification links would strand users. Admin approval is the gate instead. | ~half a day with Resend |
| Password reset | Same reason. `/forgot-password` says so plainly rather than pretending. | Ships with the email provider |
| Sign-in rate limiting | Internal-only for now | ~1 hour — BetterAuth's `rateLimit` option |
| Two-factor auth | Not requested | ~1 day — BetterAuth `twoFactor` plugin |
| Tests | Speed of the first milestone | See below |
| Pagination | 500-row cap is well beyond a department's headcount | ~half a day when it bites |

---

## Next up

### 1. Email provider — unblocks three things at once

Wire [Resend](https://resend.com) into BetterAuth's `sendResetPassword` and
`sendVerificationEmail`. That gives you password reset, email verification, and
a channel to tell someone their access was approved — right now they have to
guess and try signing in.

### 2. Tests

In value order:

1. **Vitest on `src/lib/rbac.ts`.** Pure functions, highest security value per
   line. Assert a manager cannot act on an admin, `assignableRoles` never
   exceeds the actor's rank, and suspended users hold nothing.
2. **Server actions against a Neon test branch.** Assert suspension actually
   deletes sessions and that role changes are refused across rank.
3. **Playwright** (already a devDependency) for register → pending → approve →
   sign in.

### 3. Finish the dashboard

The frame exists; it needs content. Likely first cards: open tickets by
severity, service availability this month, pending access requests, recent audit
activity. The `dataviz` conventions in [DESIGN.md](./DESIGN.md) cover chart
colour — series 1 is brand blue, series 2 brand orange.

### 4. User profile screen

Users currently cannot change their own name, avatar or password. `users:update`
exists; the screen does not. Note the rank rule bars acting on your *own*
account through the admin tools — this is the intended escape hatch.

Display name and position are no longer typed at registration — see
[RBAC.md](./RBAC.md) (or `src/server/employees/identity.ts`) for how they're
now derived by matching the account email against Employee's `workEmail`.

---

## Later

- **Invitations** — admin sends a link instead of the person self-registering.
  Removes the "who are you?" step from approval.
- **Microsoft Entra ID SSO** — most likely the right long-term answer for
  Questronix staff. BetterAuth supports it as a generic OIDC provider; needs an
  app registration from your tenant admin.
- **Neon branching per PR** — do this before more than one person is committing.
- **Sentry** — `error.tsx` already surfaces a digest; Sentry makes it traceable.
- **Bulk actions** — approve several pending users at once.
- **CSV export** of the user directory and the Audit Trail (deferred when the
  Audit Trail shipped — "Standard" scope, not "Comprehensive").
- **Audit entry detail drawer** — IP address and other request metadata are
  already captured (`auditLog.ipAddress`) but not surfaced in the UI yet.

---

## Beyond user management

The console exists to run MCSU, and users are only the substrate. Natural
next domains, roughly in dependency order:

1. **Clients & Services** — who you manage cloud services for, and which.
2. **Assets / Inventory** — the subscriptions, instances and licences under
   management.
3. **Tickets & Requests** — the actual operational work, linked to clients.
4. **SLA tracking** — response and resolution against contract, the thing the
   dashboard should really be about.
5. **Reports** — monthly service reviews, generated rather than assembled by
   hand.

Each is a new permission group in `src/lib/rbac.ts` and a new nav group in
`src/lib/navigation.ts`. The RBAC and shell work is already done — adding a
domain should not require touching auth again.
