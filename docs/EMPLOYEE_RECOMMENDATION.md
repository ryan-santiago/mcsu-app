# Employee Recommendation — implementation plan

Status: **Everything in this document is built and browser-verified —
Phases 1–6 (see §12), §12 step 7 in full (data layer + the unified
`/admin/approvals` inbox UI, both 2026-08-27), this feature's own
email-notification trigger wiring (§13, 2026-08-27, though it can't
actually send anything until Microsoft Graph credentials exist), and the
related Talent Acquisition fix in §14 (2026-08-27).** The only work left
un-started is a change-request notification-bell source (§12 step 7's tail
note) and resolving §2's open questions with real usage feedback — neither
blocks anything else. This document is the
spec to implement against, and the record of what's actually shipped and
why — work can resume from a different machine without re-deriving the
decisions below. Keep it updated as decisions change; don't let it drift
from what's actually built.

Digitizes the paper "QSERV – MCSU Employee Recommendation Form" (ERF) and
the manual process around it: monitoring contract/probationary expirations,
letting a Manager fill out and submit a recommendation, routing it through
Unit Manager → Department Head approval, and letting the Talent Acquisition
Manager (TAM) generate the final ERF PDF once approved.

Out of scope (explicitly, per the source conversation):
- Generating the KPI itself — only uploading the finished KPI Result PDF.
- Actually emailing the ERF + KPI to HRD — TAM still does that by hand.
- SharePoint integration going live — this plan uses the **same seam**
  `docs/DOCUMENTS.md` already established (local disk now, swap later), not
  a new storage strategy.

---

## 1. Decisions already made (confirmed with the user 2026-08-26)

| Decision | Choice |
| --- | --- |
| Menu placement | **Workforce** group, next to Employees/Projects — it's employee-lifecycle data, not purely an admin function. |
| Approval architecture | Build a **generic, polymorphic approval engine** now (`approvalRequest`/`approvalStep`), not a one-off status enum on the recommendation table. Employee Recommendation is the first consumer; the existing `/admin/approvals` change-request flow migrates onto it in a later phase (not part of this build). |
| Approver resolution | Add `unitManagerUserId` / `departmentHeadUserId` to the **`team`** table, FK → `user` (not `employee` — see §12 step 4's round-2 correction). Explicit, admin-editable — no assumption that approvers share a `teamId` with the employees they approve for. |
| File storage (KPI Result upload, generated ERF copy) | Same pattern as One-Lot Project Docs: **local disk today, SharePoint later**, via a generalized `document-storage.ts`. **Not** Vercel Blob — the user confirmed SharePoint is the intended long-term destination for these files too, so bouncing through Blob first would just be thrown-away work. See §7. |

---

## 2. Open questions — resolve before or during Phase 3/4 build

These are genuine gaps found while researching the codebase; the plan below
makes a reasonable default choice for each but flags them so they don't get
silently baked in wrong.

1. **Approval chain length.** The user said *"some approval needs Manager,
   Unit Manager and Department Head approval but some only requires 1 or
   2."* The paper form always has two approval boxes (Recommending =
   Unit Manager, Final = Department Head). What rule decides when only one
   is required? Candidates: trigger type (manual/regular vs. PH/Probationary),
   size of the change (e.g. salary delta above a threshold), or it's simply
   always both and the "1 or 2" comment was about the *generic* Approval
   Workflow module in general (other future modules using it may only need
   one approver), not Employee Recommendation specifically. **Default
   implemented here: always Unit Manager → Department Head (2 steps)** for
   Employee Recommendation, expressed as a small pluggable resolver function
   (see §5) so the rule can change without a schema migration.
2. ~~Talent Acquisition Manager role~~ **Resolved 2026-08-26.** A Talent
   Acquisition module landed on `main` since this plan was first drafted,
   seeding exactly this role: `talent_acquisition_manager`
   (`drizzle/0047_seed_talent_acquisition_roles.sql`), rank 32 — between
   Manager (30) and Unit Manager (35) — with full CRUD over the hiring
   pipeline plus the one action nobody else may hold
   (`talent_acquisition:migrate`, candidate → Employee). Grant
   `employee_recommendations:generate_erf` (§9) to this role rather than
   inventing a new one. Also note `talent_acquisition_staff` (rank 22,
   between Engineer/20 and Manager/30) now exists too — irrelevant to this
   feature but extends the rank ladder to be aware of.
3. **Probationary badge thresholds.** The user gave two thresholds for PH
   (orange at 60 days, red at 30 days) but only one for Probationary ("30
   days before expiration"). Default implemented here: amber/`warning`
   badge once within 30 days of the probationary end date, `destructive`/red
   only once the end date has actually passed. Confirm if a second
   probationary threshold (e.g. 15 days) is wanted.
4. **"Manager" field semantics.** The paper form's "Manager" field and
   "Submitted by" are both filled with the requestor's name today. Confirmed
   reading: they're the same person for now (a Manager always submits for
   their own report). If TAM or someone else ever submits on a Manager's
   behalf, these two fields would need to diverge — not building for that
   unless it comes up.
5. **Department/Division fields.** There's no `department`/`division` table
   in the schema at all — only a flat `team` lookup. The user said Department
   is always "QSERV-MCSU" (store as a constant, not user input) and Division
   Change is rarely used (freetext FROM/TO, not modeled against real data).
   Confirm this is fine long-term, since it means "Division Change" on the
   form doesn't actually change anything else in the system — it's a
   record-only note for HRD.
6. **Talent Acquisition's migrate-to-Employee flow never sets a contract/
   probation end date.** Checked 2026-08-26 against the newly-landed Talent
   Acquisition module: `migrateCandidate` (`src/server/talent-acquisition/migrate-actions.ts:217-228`)
   inserts the new hire's first `employeeEmployment` row with
   `endDate: null` unconditionally — there's no contract-length or
   probation-period field anywhere in `migrate-to-employee-form.tsx`. The
   Employees module *does* already support setting `endDate` on an
   employment record (`addEmploymentRecord`/`updateEmploymentRecord`,
   `src/server/employees/actions.ts:422-441`), so the capability exists —
   but nothing wires TA's hire step to it. **Practical effect: a newly
   migrated PH or Probationary hire will not appear in §6's monitoring
   queue until someone manually edits their employment record in the
   Employees module to add an end date** — an easy-to-miss manual step this
   plan doesn't control. Two ways to close this: (a) leave it as a manual
   Employees-module step and document it as a process requirement, or
   (b) add a contract-length/probation-length field to TA's migrate form as
   a small follow-up change in that module.

   **Resolved 2026-08-26, checked against live data.** Queried the actual
   database rather than guessing: only 2 employees currently have PH or
   Probationary as their latest employment type, and **both already have an
   end date set** — but both were entered directly through the Employees
   module, predating Talent Acquisition. Exactly 1 employee has been hired
   through TA's new migrate flow so far; her employment row is
   `employmentTypeId: "consultant"`, `endDate: null` — confirming the gap is
   real (TA's migrate step skips the end date regardless of employment type
   chosen), even though her specific type happens not to be PH/Probationary.
   So the org's actual habit is "set the end date at data-entry time," and
   that habit holds for direct Employees-module entries but not for TA
   migrations — nobody's hit it yet only because TA is brand new. **Decision:
   go with (b)** — add a contract-length/probation-length field to
   `migrate-to-employee-form.tsx` (Talent Acquisition) rather than relying on
   a follow-up step nothing currently prompts anyone to take. Scoped as a
   small follow-up change to the Talent Acquisition module, not blocking
   Employee Recommendation's own build — but should land before or alongside
   Phase 2 (§12) so the monitoring queue has real data to show once it ships.

---

## 3. Where this plugs into the existing app

Grounded in the current codebase (see file references throughout) — nothing
here should require re-deriving from scratch when implementation starts.

- **Stack**: Next.js App Router, Drizzle ORM (`src/db/schema.ts`, one file,
  no transactions — `neon-http` driver), BetterAuth, TanStack Query,
  react-hook-form + Zod, shadcn/ui + Tailwind semantic tokens.
- **Per-feature shape to follow** (`src/app/(app)/<feature>/`,
  `src/components/<feature>/`, `src/server/<feature>/{queries,actions,types,query-key}.ts`,
  `src/lib/validation/<feature>.ts`) — same shape `employees`,
  `staff-augmentation`, `change-requests` already use.
- **RBAC**: never branch on role — `can(user, "module:action")`
  (`src/lib/rbac.ts`). Pages call `requirePermission()`
  (`src/lib/session.ts`), actions/queries call `authorize()`. Rank-based
  "can actor act on target" checks go through `denyReasonForActingOn()` —
  this is the exact primitive the approval engine's per-step gate should
  reuse (§5), same as `change-requests/actions.ts`'s
  `checkReviewerOutranksRequester()` already does today.
- **RBAC.md already names this feature**: Department Head and Unit Manager
  roles (rank 38 and 35) were seeded specifically as *"the planned Employee
  Recommendation module, where a Manager submits a recommendation for a team
  member and one of these roles approves it"* — confirms rank 30 (Manager) →
  35 (Unit Manager) → 38 (Department Head) is the intended chain.
- **Audit**: every create/edit/approve/reject must call `recordAudit()` +
  `diffFields()` (`src/lib/audit.ts`), registered via `AUDIT_MODULES`/
  `AUDIT_ACTIONS` in `src/lib/audit-registry.ts` (client-safe, no
  `"server-only"`). This is a hard rule per `AGENTS.md`, not optional.
- **Design tokens**: reuse the existing status-badge pattern verbatim
  (`src/components/users/user-badges.tsx`) — `<Badge variant="outline">` +
  icon + `border-X/30 bg-X/10 text-X` using `--warning`/`--destructive`/
  `--success` semantic tokens. **Do not** reach for `--brand-orange` for the
  60-day badge — that token is reserved for graphics/indicators, not status
  text, and fails AA as text on light surfaces anyway. Use `--warning` (which
  renders as an amber/orange hue) instead.
- **Rich text**: the "Accomplishments, Contributions & Final Recommendation"
  field should reuse the rich-text editor component already added for the
  One-Lot Project description field (see recent commit
  `3bd0a22 update one-lot project - added richtext editor for description`)
  rather than adding a second rich-text dependency.
- **PDF generation precedent**: `src/lib/activity-report-pdf.ts` +
  `activity-report-pdf-template.ts` — dynamically imports `html2canvas` +
  `jspdf` on click, renders an HTML template into an off-screen iframe
  (needed because `html2canvas` chokes on this app's `oklch()`/`color-mix()`
  CSS without real ancestors), rasterizes, slices to A4, `pdf.save()`. This
  is a pure client-side download with **no server storage involved** — use
  this exact pattern to lay out the ERF PDF from `employeeRecommendation`
  data. (A saved copy of the generated PDF for the record is a separate,
  deliberate step — see §7.)

---

## 4. Data model

All new tables in `src/db/schema.ts`, alongside the existing employee
tables. Names below are proposals — keep camelCase table/column convention
already used throughout the file.

### 4.1 `team` — add approver assignment

```
team (existing table, add columns)
  ...
  unitManagerUserId    text, FK -> user, nullable, onDelete: set null
  departmentHeadUserId text, FK -> user, nullable, onDelete: set null
```

**References `user`, not `employee`** (changed 2026-08-27 — see §12 step
4's "Correction, round 2" note; originally planned and briefly built as
`unitManagerEmployeeId`/`departmentHeadEmployeeId` FK -> `employee`). A
Department Head/Unit Manager is identified by the account that logs in and
clicks Approve, not by an HR record — requiring one turned out to exclude
real accounts that hold these roles.

Admin-editable from a "Recommendation approvers" panel on Maintenance →
Teams — resolves "who approves for this team" without assuming org
structure from `teamId` matching alone. Nullable because not every team
will have both assigned immediately; the approval engine surfaces a clear
error ("no Unit Manager configured for this team") rather than silently
skipping a step if one is missing and required.

### 4.2 Generic approval engine

```
approvalEntityType enum: 'employee_recommendation' | 'employee_change_request'
  -- employee_change_request migrated onto this 2026-08-27 — see §12 step 7

approvalRequestStatus enum: 'pending' | 'approved' | 'rejected' | 'cancelled'
approvalStepStatus    enum: 'pending' | 'approved' | 'rejected' | 'skipped'

approvalRequest
  id                  uuid, pk
  entityType          approvalEntityType
  entityId            uuid            -- polymorphic, no DB-level FK (same intentional
                                       -- tradeoff as auditLog.entityId — enforce at app layer)
  requestedByUserId   FK -> user, set null
  requestedByLabel    text            -- name snapshot, survives account deletion
  requesterRank       integer         -- snapshot, for the rank-check on each step
  status              approvalRequestStatus, default 'pending'
  currentStepOrder    integer         -- which step is currently actionable
  createdAt, updatedAt

approvalStep
  id                  uuid, pk
  approvalRequestId   FK -> approvalRequest, cascade
  stepOrder           integer         -- 1-based
  requiredRoleId      FK -> role, restrict   -- e.g. unit_manager, department_head
  approverUserId      FK -> user, restrict -- resolved concrete approver at creation time
                                            -- (snapshotted: a later team reassignment
                                            -- doesn't retroactively change history).
                                            -- FK -> user, not employee (changed 2026-08-27,
                                            -- same reason as team.unitManagerUserId in §4.1)
  status              approvalStepStatus, default 'pending'
  decidedByUserId      FK -> user, set null
  decidedAt           timestamp, nullable
  note                text, nullable
  createdAt
```

`approvalRequest`/`approvalStep` are deliberately entity-agnostic: nothing
in either table mentions "recommendation." This is what "we will revise
this to be Approval Workflow — a generic approval where all approvals will
be placed here" is built against from day one, per §1. The `/admin/approvals`
page becomes (in a later phase) a query across `approvalRequest` joined
by `entityType`, rendering a type-specific preview component per row on
expand — build only the `employee_recommendation` preview now, leave the
join/dispatch structure obviously extensible.

### 4.3 `employeeRecommendation`

```
recommendationTriggerType enum: 'ph_contract_expiring' | 'probationary_expiring' | 'manual_regular'
recommendationStatus      enum: 'draft' | 'submitted' | 'approved' | 'rejected'
                                 | 'erf_generated' | 'applied' | 'cancelled'
  -- submitted/approved/rejected mirror the linked approvalRequest's status
  -- (kept denormalized on this table too, for fast list/filter queries without a join)
  -- erf_generated / applied are post-approval, TAM-only steps with no approvalStep of their own

employeeRecommendation
  id                        uuid, pk
  employeeId                FK -> employee, restrict
  triggerType                recommendationTriggerType
  sourceEmploymentId        FK -> employeeEmployment, nullable
                             -- the specific employment row that triggered this
                             -- (the expiring PH/probationary record), null for manual_regular
  approvalRequestId         FK -> approvalRequest, nullable
                             -- null while status = 'draft', set on submit
  status                     recommendationStatus, default 'draft'

  -- General Information (snapshotted at creation, not live-joined —
  -- so the ERF PDF reflects what was true when filed, matching the paper form)
  submittedByUserId         FK -> user, set null
  submittedByName           text
  employeeNumberSnapshot    text
  departmentSnapshot        text        -- constant "QSERV-MCSU" per current process
  positionSnapshot          text        -- "Level - Position", e.g. "Mid - API Developer"
  managerNameSnapshot       text        -- = submittedByName today, see open question 4

  -- Actions Requested — one jsonb blob, Zod-typed in code, mirroring the
  -- existing employeeChangeRequest.proposedProfile convention rather than
  -- ~20 mostly-empty discrete columns (most requests only touch 1-2 of these)
  requestedActions          jsonb
    -- shape (Zod schema in src/lib/validation/employee-recommendations.ts):
    -- {
    --   supervisorChange?:  { fromTeamId, toTeamId }
    --   departmentChange?:  { from: text, to: text }
    --   jobTitleChange?:    { fromLevelId, fromPositionId, fromLabel, toLevelId, toPositionId, toLabel }
    --   divisionChange?:    { from: text, to: text }
    --   salaryChange?:      { fromSalary, fromCommunicationAllowance, fromTransportationAllowance, toSalary, toCommunicationAllowance, toTransportationAllowance }
    --     -- three separate figures, matching employeeEmployment's own columns and the paper form — not one combined "allowances" number (this was wrong in the first Phase 3 build, fixed 2026-08-26)
    --   categoryChange?:    { fromEmploymentTypeId, fromEmploymentTypeName, toEmploymentTypeId, toEmploymentTypeName, toLabel }
    -- }
    -- every `to*Id` field is paired with a resolved `to*Name`/`toLabel` display
    -- string captured at selection time (like `toTeamName` always was) — not
    -- just an id to re-resolve live later. jobTitleChange/categoryChange were
    -- missing theirs in the first Phase 3 build; fixed 2026-08-27 while
    -- building the ERF PDF (§3/§7), which needs readable text without a live
    -- lookup, same reason every other `from*`/`to*` pair already worked this way.
    -- every key optional — only checked sections are present, matching the paper form's checkboxes
    -- no per-section `effectiveDate` (removed 2026-08-27): the real effective
    -- date is whichever date Department Head approval lands on, or for
    -- Project-Hired/Probationary/contractual staff whichever date the new
    -- contract/record starts — not something the requester fills in up front.
    -- The printed ERF still has an "Effective Date" column (matches the paper
    -- form) but it's always rendered blank now — see §7/ERF template.

  accomplishmentsAndRecommendation  text  -- rich text HTML, see §3

  kpiResultStorageKey       text, nullable   -- see §7
  erfStorageKey             text, nullable   -- generated PDF, saved for the record
  erfGeneratedAt            timestamp, nullable
  erfGeneratedByUserId      FK -> user, set null, nullable

  appliedToEmploymentHistoryAt   timestamp, nullable
  appliedByUserId                FK -> user, set null, nullable
  resultingEmploymentId          FK -> employeeEmployment, nullable
                                   -- set once TAM applies the approved change as a new
                                   -- employeeEmployment row, closing the loop the user
                                   -- described: "after this we will have option to add
                                   -- this to specific employee employment history"

  createdAt, updatedAt
```

Important: **the approved recommendation does not auto-apply to
`employeeEmployment`.** Applying is a distinct, explicit TAM action after
ERF generation (per the described process — HRD processes it externally
first), unlike `employeeChangeRequest` where approval applies the proposed
profile immediately. Don't copy that part of the change-request pattern.

### 4.4 Reused query building blocks

`latestEmploymentSubquery()` (`src/server/employees/queries.ts`) already
does a `selectDistinctOn` per employee ordered by `endDate IS NULL DESC,
startDate DESC` — this is the exact subquery to extend (add `endDate` to
its selected columns if not already there) and filter for the monitoring
queries in §5. Employment type values to filter on
(`drizzle/0023_seed_employment_types.sql`): `project_based` = "Project
Hired" (PH), `probationary` = "Probationary".

---

## 5. Workflow / state machine

### 5.1 Recommendation lifecycle

```
draft ──(Manager submits)──► submitted ──► [approval engine runs] ──┬─► approved ──► erf_generated ──► applied
                                                                      └─► rejected
```

`draft` exists so a Manager can start filling the form (e.g. attach KPI
result, write recommendation text) before formally submitting — matches
the paper process where the form is filled out over time before being
routed. `cancelled` (recommendation withdrawn before a decision) should
also be reachable from `draft`/`submitted`.

### 5.2 Approval chain resolution (default rule — see open question 1)

```ts
// src/server/employee-recommendations/approval-chain.ts
function resolveApprovalChain(recommendation): { roleId: string }[] {
  return [{ roleId: "unit_manager" }, { roleId: "department_head" }];
}
```

Called once, at submit time, to create the `approvalRequest` +
`approvalStep` rows. For each step, resolve the concrete
`approverUserId` from the employee's `team.unitManagerUserId` /
`team.departmentHeadUserId` — if either is unset, **block submission**
with a clear error ("This team has no Unit Manager assigned — contact an
administrator") rather than creating a step with no possible approver.

### 5.3 Per-step approval action

Model directly on `src/server/change-requests/actions.ts`'s
`approveChangeRequest`/`rejectChangeRequest`, which already establishes the
pattern this needs:

```
approveApprovalStep({ approvalRequestId, note? })
  1. authorize("employee_recommendations:approve")  -- new permission, or reuse
     an existing one if the RBAC design ends up unifying this with change-requests
  2. load approvalRequest + current step (status must be 'pending' and
     stepOrder === approvalRequest.currentStepOrder)
  3. verify current user's id === step.approverUserId
     (or falls back to "anyone holding requiredRoleId with sufficient rank" if the
     assigned approver's account is inactive — same escape hatch
     checkReviewerOutranksRequester() already has for missing requesters)
  4. mark step approved, decidedByUserId, decidedAt, note
  5. if more steps remain: advance currentStepOrder, next step becomes actionable
     if no steps remain: approvalRequest.status = 'approved',
       employeeRecommendation.status = 'approved'
  6. recordAudit({ module: "employee_recommendations", action: "recommendation_step_approved", ... })
  7. revalidatePath() for the recommendation detail page, the approvals inbox,
     and (once unified) /admin/approvals
```

`rejectApprovalStep` is the same shape but short-circuits: any rejection at
any step immediately sets both `approvalRequest.status` and
`employeeRecommendation.status` to `'rejected'` — later steps don't run.

### 5.4 Rank check

Reuse `denyReasonForActingOn()`/rank comparison exactly as
`checkReviewerOutranksRequester()` (`src/server/change-requests/actions.ts`)
does today — the approver's rank must be above the requester's snapshot
rank (`approvalRequest.requesterRank`). This is the "we will still follow
the Rank System for approval" requirement; don't hardcode role-name checks
(`role === "unit_manager"`) — compare rank numbers, consistent with the
rest of the RBAC design. A second, more recently-added precedent for this
exact shape is Talent Acquisition's `assertOutranksRequester`
(`src/server/talent-acquisition/actions.ts`), gating `approveTaRequest`/
`rejectTaRequest` — its permission grant is the same tier this plan targets
(`talent_acquisition:approve` → Admin/Department Head/Unit Manager only,
deliberately excluding the requester's own peer role,
`drizzle/0050_grant_talent_acquisition_approve_permission.sql`), which is
good validation that this plan's approver tier matches current codebase
direction. Worth reading both before implementing, since it's the newer of
the two.

---

## 6. Monitoring / triggers (the part that runs without user action)

Three ways a recommendation gets created — only one is automatic-with-no-cron:

1. **PH contract expiring** — computed **on page load/query**, not via a
   background job (no cron infrastructure exists in this app at all — see
   §8). The Employee Recommendation list page runs a query for employees
   whose latest `employeeEmployment` row has `employmentTypeId =
   'project_based'` and `endDate` within 60 days, with **no existing
   `employeeRecommendation` row already open for that employment record**
   (avoid duplicate flags). These render as a **"needs recommendation"**
   queue item with a badge — they are not rows in `employeeRecommendation`
   until a Manager actually starts one from that queue (`triggerType:
   'ph_contract_expiring'`, `sourceEmploymentId` set).
2. **Probationary expiring** — same mechanism, `employmentTypeId =
   'probationary'`, within 30 days.
3. **Manual (regular employee, annual KPI)** — Manager clicks "New
   Recommendation," picks any employee in their scope directly,
   `triggerType: 'manual_regular'`, no `sourceEmploymentId`.

Badge thresholds (§2 open question 3 covers the probationary specifics):

| Trigger | Threshold | Badge |
| --- | --- | --- |
| PH expiring | ≤ 60 days | `warning` (amber/orange), label "Renewal due" |
| PH expiring | ≤ 30 days | `destructive` (red), label "Renewal urgent" |
| Probationary expiring | ≤ 30 days | `warning`, label "Review due" |
| Probationary expiring | past end date | `destructive`, label "Overdue" |

Row-level scoping: same convention as `listEmployees()` — non-admin actors
without `hasUnrestrictedAccess` only see employees on their own `teamId`.

---

## 7. File storage (KPI Result upload)

Follows `docs/DOCUMENTS.md` exactly — **read that file in full before
touching this.** One file per recommendation, not a folder tree, so this
is simpler than One-Lot Docs:

- **KPI Result** — Manager uploads a PDF while filling the form. This one
  genuinely needs storage: it's a real upload, not something that can be
  regenerated.

Path convention (mirrors the existing One-Lot pattern so the eventual
SharePoint migration is uniform across features):

```
storage/Documents/Employee Recommendation/{recommendationId}/kpi-result.pdf
```

Implementation:
- `src/lib/document-storage.ts`'s `saveDocumentFile`/`readDocumentFile`/
  `deleteDocumentFile` are storage-root-relative, not One-Lot-specific —
  `isDocumentStorageAvailable()` is feature-agnostic too.
- Authenticated route handler,
  `src/app/api/employee-recommendations/[id]/kpi-result/route.ts`,
  same shape as the One-Lot download route: re-check session + scope on
  every request, stream from disk.
- Upload goes through a Server Action (small PDF, well under the 1MB
  default — shouldn't need the `bodySizeLimit` override One-Lot needed for
  large files).
- Keep the `isDocumentStorageAvailable()` guard — if this app is ever
  deployed to Vercel before either SharePoint or a persistent host is in
  place, this feature must degrade to "unavailable," never silently drop a
  KPI file.

**The generated ERF is deliberately *not* stored (decision reversed
2026-08-27, see §12 step 5's addendum).** It was originally saved
server-side too, for the same "durable record of what was sent" reason KPI
Result needs storage. Reversed once the user weighed that against the
practical cost: it's the only thing in this module gated on
`isDocumentStorageAvailable()` purely for its own sake (KPI Result needs
that guard regardless), so it was the one piece of this feature that would
silently break the moment this app ever runs somewhere without persistent
local disk (Vercel serverless, per `AGENTS.md`) — ahead of the SharePoint
migration `docs/DOCUMENTS.md` describes for exactly that reason. Generating
the ERF now only rasterizes the PDF client-side and triggers a direct
`pdf.save()` download (`generateEmployeeRecommendationErfPdf` in
`src/lib/employee-recommendation-pdf.ts`) — the bytes never leave the
browser. `erfGeneratedAt`/`erfGeneratedBy` on `employeeRecommendation` stay
(migration `0062_drop_erf_storage_key.sql` only dropped `erfStorageKey`),
so the app still knows *that* an ERF was generated, by whom, and when —
enough to drive `canApply` and the audit trail — just not a copy of the
file itself. **Generation is repeatable, not one-time** (revised same day,
right after the no-storage decision above): `canGenerateErf` stays true for
the ERF handler through `approved`/`erf_generated`/`applied`, not just
`approved`, and `markErfGenerated` only advances `status` on the *first*
call (the one that unlocks Apply) — later calls just re-render from current
data, re-download, and log another `erf_generated` audit entry, so getting
another copy later is "click the button again," not a dead end. **Known
tradeoff, still accepted deliberately**: each download only ever reaches
the one person who clicked it *at that moment* — there's no durable copy
anyone else can pull up independently, and no proof besides the audit trail
that a given regeneration exactly matches an earlier one (the live data
could technically have moved between clicks, e.g. team name changes,
though `requestedActions` itself stays a frozen snapshot). If that turns
out to matter in practice, the fix is re-adding server-side storage (the
original version of this section, preserved in git history), not
rebuilding the generation flow.

---

## 8. What doesn't exist yet and has to be built new

Called out explicitly so they aren't assumed to already exist mid-build.
**Revised 2026-08-26** — a Talent Acquisition module landed on `main` since
this plan was first drafted and changed one of these:

- ~~No notification system~~ **Now exists** — `src/server/notifications/`
  (added alongside the Talent Acquisition rework, `drizzle/0055_add_notification_read.sql`).
  Pattern: a `NotificationSource = (actor: CurrentUser) => Promise<NotificationItem[]>`
  function per module, computed on read from live data and never stored
  (`pendingUserSource()` in `src/server/notifications/queries.ts` is the only
  source today — gates on the same permission as the action it notifies
  about, same "if you can't act on it, you don't get notified" rule this
  plan should follow). A `notification_read` table tracks only which items a
  user has dismissed (`user_id, module, entity_id` → `read_at`), so a
  resolved item just stops being produced rather than needing cleanup.
  **Employee Recommendation should add its own source function(s) to
  `NOTIFICATION_SOURCES`** in that file — one for "an approval step is
  waiting on you" (mirrors `pendingUserSource`, gate on
  `employee_recommendations:approve` + the viewer being the resolved
  approver), and optionally one surfacing the §6 expiring-contract queue to
  Managers. This removes what was previously flagged as prerequisite infra
  to build — it already exists, reuse it. Still no outbound **email**
  (Resend remains unimplemented, per `docs/ROADMAP.md`) — the bell is
  in-app only, which matches what this plan assumed either way.
  **Correction, checked 2026-08-26**: despite `notification_read` landing
  in the same Talent Acquisition rework, TA itself registers **no**
  `NotificationSource` — its own `pending_approval` requisitions aren't
  surfaced through the bell today. So `pendingUserSource` remains the
  *only* real example to model against, not two; TA is a gap in the bell's
  coverage, not a second precedent to copy.
- **A second single-step approval precedent now exists**: `ta_request`
  (Talent Acquisition requisitions) gained `pending_approval` status with
  `approved_by`/`approved_at`/`review_note` columns directly on the entity,
  gated by a new `talent_acquisition:approve` permission granted only to
  Admin/Department Head/Unit Manager — deliberately **not** granted to
  Talent Acquisition Manager, so a TA Manager can't approve their own
  team's requisition (`drizzle/0049_add_talent_acquisition_approval.sql`,
  `0050_grant_talent_acquisition_approve_permission.sql`). Unlike
  `employeeChangeRequest`, this one is single-step, not multi-step — but it's
  a second bespoke approval implementation added *after* this plan proposed
  building a generic engine (§1/§4.2). **Update 2026-08-27**: `employeeChangeRequest`
  migrated onto the generic engine (§12 step 7's data-layer piece) — `ta_request`
  hasn't, so there are now two bespoke shapes left to reconcile if/when a
  true unified inbox gets built, not three.
- **No department/division/org-hierarchy model** — see open question 5.
  Not building one; Department/Division stay constant/freetext.
- **No reporting-line data** (`employee.supervisorId` doesn't exist) — the
  `team.unitManagerUserId`/`departmentHeadUserId` columns in §4.1 are what
  stand in for it here. Don't assume a general "who is X's manager's
  manager" capability exists beyond that.

---

## 9. Navigation & permissions

**Nav** (`src/lib/navigation.ts`): new `NavItem` under the existing
**Workforce** group (alongside Employees, Projects/S3P):

```ts
{ label: "Employee Recommendation", href: "/employee-recommendations",
  permissions: ["employee_recommendations:read"], icon: "..." }
```

Checked against the newly-landed Talent Acquisition module (`src/lib/navigation.ts`):
it's its own top-level group (not nested in Workforce), sitting immediately
after Workforce and before Engagement. No conflict with putting Employee
Recommendation inside Workforce — the two modules serve different primary
audiences (TA Staff/Manager sourcing candidates vs. line Managers managing
their own reports' contracts), so staying visually adjacent but structurally
separate is fine as-is; revisit only if product direction wants them to
read as one connected "hire → manage" flow.

**Permissions** (`src/lib/rbac.ts`): append `employee_recommendations` to
`MODULES`/`PERMISSIONS` — `read`, `edit` (create/submit, gates the whole
page like `employees:edit` gates Approvals today), `approve` (act on an
approval step — or fold into `edit` if a separate permission proves
redundant with the per-step rank/assignment check), `generate_erf`
(TAM-only, see open question 2). Seed into existing roles via a migration
following the `drizzle/0005_seed_roles.sql` pattern — Manager gets
`read`+`edit` (can submit for their team), Unit Manager/Department Head get
`read`+`approve`, Administrator gets everything by default (admin
short-circuits `can()` regardless).

---

## 10. Audit trail integration

Add to `src/lib/audit-registry.ts`:

```ts
AUDIT_MODULES += { value: "employee_recommendations", label: "Employee Recommendations" }
AUDIT_ACTIONS += "recommendation_submitted", "recommendation_step_approved",
                 "recommendation_step_rejected", "erf_generated",
                 "recommendation_applied"
```

Call `recordAudit()` from every action in §5.3 plus create/submit/
generate-ERF/apply-to-employment-history — no module is exempt from this
per `AGENTS.md`.

---

## 11. UI / pages / components (new)

- `src/app/(app)/employee-recommendations/page.tsx` — list/queue view:
  tabs or filters for "Needs recommendation" (computed, §6), "In progress"
  (draft/submitted), "Completed" (approved/rejected/applied). Guarded
  `requirePermission("employee_recommendations:read")`.
- `src/app/(app)/employee-recommendations/[id]/page.tsx` — detail view:
  form (draft/editable pre-submit), read-only summary + approval timeline
  post-submit, "Generate ERF" button (TAM, post-approval), "Apply to
  Employment History" button (TAM, post-ERF).
- `src/components/employee-recommendations/recommendation-form.tsx` —
  the ERF form itself: General Information (mostly read-only/derived),
  six optional Action Requested sections (checkbox reveals FROM/TO/
  Effective Date), rich text editor, KPI Result upload.
- `src/components/employee-recommendations/recommendation-badges.tsx` —
  expiry badges (§6) and status badges, following
  `src/components/users/user-badges.tsx`'s exact pattern.
- `src/components/employee-recommendations/approval-timeline.tsx` —
  renders `approvalStep` rows as a vertical stepper (pending/approved/
  rejected per step, who, when, note) — this component is also the natural
  "preview on expand" the user described for the generic Approval Workflow
  inbox, so build it to be embeddable there too, not employee-recommendation-specific in its props shape.
- `src/lib/employee-recommendation-pdf.ts` +
  `employee-recommendation-pdf-template.ts` — ERF generation, mirroring
  `activity-report-pdf.ts` (§3).

---

## 12. Phased build order

Suggested sequencing — each phase should be independently shippable/testable:

1. **Schema + RBAC** — DONE (2026-08-26). All tables in §4, `team` approver
   columns, migration `0056_add_employee_recommendation.sql`, permissions
   seeded.
2. **Monitoring queue (read-only)** — DONE (2026-08-26). The expiring-PH/
   expiring-probationary query + badges (§6), list page.
3. **Manual add + draft form** — DONE (2026-08-26). Manual creation, the
   from-queue "Start recommendation" flow, the full draft form (General
   Information snapshot, six toggleable Action Requested sections, rich
   text Accomplishments, KPI Result PDF upload/download), all verified
   end-to-end in a real browser. The Salary Change section was corrected
   the same day to three separate fields (Salary, Communication Allowance,
   Transportation Allowance) instead of one combined "allowances" number —
   see the `salaryChange` shape note under §4.3.
4. **Approval engine + submission** — DONE (2026-08-27). Built and
   browser-verified end-to-end:
   - `resolveApprovalChain()` (`src/server/employee-recommendations/approval-chain.ts`) —
     still the fixed Unit Manager → Department Head default from open
     question 1; not yet revisited.
   - `submitRecommendation`, `approveRecommendationStep`,
     `rejectRecommendationStep` (`src/server/employee-recommendations/actions.ts`) —
     resolves approvers from `team.unitManagerUserId`/`departmentHeadUserId`
     (renamed from `*EmployeeId` in the round-2 correction below),
     blocks submission with a clear error if either is unset, rejects
     short-circuit the whole request (later steps stay untouched/pending
     forever, matching §5.3), and reviewers cannot act on their own
     submission — verified this holds even for an Administrator account,
     matching `denyReasonForActingOn`'s existing "nobody acts on their own"
     convention.
   - **New prerequisite that wasn't in the original plan**: nothing existed
     to actually *set* `team.unitManagerUserId`/`departmentHeadUserId`
     — added a "Recommendation approvers" panel to Maintenance → Teams
     (`src/components/maintenance/team-approvers-panel.tsx`,
     `listTeamApprovers`/`setTeamApprovers` in the `maintenance` server
     module) rather than extending the generic `LookupTable` component
     (shared by 9 other lookup kinds) with a one-off special case.
     - **Correction, round 1 (2026-08-27)**: the picker's first version
       listed every active employee org-wide — including employees with no
       `user` account, or whose account's role lacks
       `employee_recommendations:approve`. Assigning one of those as Unit
       Manager/Department Head would create a dead-end step nobody could
       ever actually approve, since `approveRecommendationStep`/
       `rejectRecommendationStep` gated on that permission and then matched
       `approvalStep.approverEmployeeId` back to the *signed-in* user's own
       Employee record (work-email match, same lookup
       `getEmployeeIdentityByEmail` does at login — there's no formal
       `user`/`employee` FK). First fix: filter the picker to employees
       whose linked `user` account's role holds the permission.
     - **Correction, round 2 (2026-08-27, supersedes round 1)**: browser
       verification of round 1 immediately surfaced the deeper problem —
       two *real* accounts holding the Unit Manager/Department Head roles
       (not test data) turned out to have **no Employee record at all**, by
       email or by name. Round 1's filter correctly hid them (they could
       never have approved anything under the old design), but that's a
       real dead end for the org, not a fixable data-entry gap: a
       Department Head/Unit Manager is a role held by a *user account*, and
       nothing requires that account to also be tracked as an "employee" in
       the HR sense. Forcing an Employee record just to satisfy this lookup
       was the wrong constraint. Reworked instead — approver identity now
       points at `user` directly, not `employee`:
       - `team.unitManagerEmployeeId`/`departmentHeadEmployeeId` →
         `unitManagerUserId`/`departmentHeadUserId`, FK → `user.id` (was
         `employee.id`). `approvalStep.approverEmployeeId` →
         `approverUserId`, FK → `user.id` (was `employee.id`) — see §4.1/§4.2.
       - `drizzle/0058_approvers_reference_user.sql`: drops the old FKs,
         renames both columns on both tables, adds new FKs to `user`. Safe
         to apply directly (no data migration needed) because
         `approval_step` was still empty in every environment this shipped
         to. `team`'s existing CyberSecurity assignment (Unit
         Manager/Department Head, both real employees with no `user`
         account) is **nulled out** by the migration, since an `employee.id`
         can never be reinterpreted as a `user.id` — re-assign it from
         Maintenance → Teams once the right people's *user accounts* hold
         those roles.
       - `listRecommendationApproverOptions()` (`src/server/maintenance/queries.ts`)
         simplified to query `user` joined to `role` directly — no more
         `employee`/work-email join at all, since the picker's candidate
         *is* the account now, not something resolved from it.
       - `assertCurrentStepActionable()`/`isActorTheApprover()`
         (`src/server/employee-recommendations/{actions,queries}.ts`) now
         compare `approverUserId`/`decidedBy` against `actor.id` directly,
         not `actor.employeeId` — removes the email-match indirection from
         the hot path of every approve/reject action.
       - Meta snapshot note: `drizzle/meta/0058_snapshot.json` was produced
         via `drizzle-kit generate --custom` (same TTY workaround as 0057),
         which does **not** diff schema — it's a copy of 0057's snapshot,
         not an accurate reflection of the post-migration `team`/`approval_step`
         shape. Same known limitation as 0056's original stale-snapshot
         bug; the next real (non-custom) `db:generate` will need to
         reconcile it interactively.
     - **Correction, round 3 (2026-08-27)**: found by the round-2 fix
       actually being used for real — a real Unit Manager (JC Husmillo, no
       Employee record, exactly the case round 2 exists for) clicked their
       "Recommendation needs your approval" notification and got
       "Recommendation not found." Cause: `getRecommendationById`
       (`src/server/employee-recommendations/queries.ts`) gated *all*
       visibility — not just edit/submit — on `row.employeeTeamId ===
       actor.teamId`. A Unit Manager/Department Head is routinely not on
       the recommended employee's own team (that's the point of the role),
       so this 404'd the exact people the notification just routed here,
       every time. Fixed: visibility is now `inScope` (unchanged
       team-match, still gates `canEdit`/`canSubmit`/`canGenerateErf`) **or**
       assigned any step of the approval request — new helper
       `isAnyStepApprover(approvalRequestId, actorId)` checks
       `approvalStep.approverUserId` directly, so an approver can see
       (though not edit) a recommendation the moment a step names them,
       regardless of team. Also added: a pending-approval-count badge on
       the "Employee Recommendation" nav item, matching the existing
       `/admin/users` badge pattern — `countPendingApprovalsForActor()`
       (co-located with `listPendingApprovalsForActor()`, same query as a
       `COUNT` instead of a row list, same `getCurrentUser()`+`can()` guard
       returning 0 instead of throwing since it runs unconditionally on
       every page load) wired into `app/(app)/layout.tsx`'s `navBadges`.
   - `ApprovalTimeline` (`src/components/employee-recommendations/approval-timeline.tsx`) —
     built as a standalone component (only prop is the approval data) so
     it's embeddable in the future generic Approval Workflow inbox per §1,
     not wired to this module specifically.
   - A "Needs your approval" tab was added to the list page, and a
     notification-bell source (`src/server/notifications/queries.ts`) reusing
     that same query — see §8's note, now with two real sources instead of
     one. **Known scoping detail**: both are keyed off `actor.id` matching
     `approvalStep.approverUserId` exactly (updated 2026-08-27 — was
     `actor.employeeId` before the round-2 rework in this step's note
     above), so an Administrator not personally assigned a step won't see
     their own admin-bypass-actionable steps listed there — they still see
     and can act on them from the recommendation's own detail page.
     Intentional: the tab is "your assigned work," not "everything you're
     allowed to override."
5. **ERF generation** — DONE (2026-08-27). Client-side PDF via the
   `activity-report-pdf.ts` pattern, saved server-side copy, TAM-gated
   (`talent_acquisition_manager`, granted `generate_erf` in the migration
   below). Browser-verified end-to-end: create → fill → submit → approve
   both steps → Generate ERF → real download captured and visually
   inspected against the reference form image — General Information,
   Actions Requested (only the checked row filled in, others show em
   dashes), Accomplishments, and the three-way Endorsed by/Recommending
   Approval/Final Approval signature block with correct names, dates, and
   "Approved" badges all matched.
   - `src/lib/pdf-render.ts` — extracted the isolated-iframe rendering trick
     (`createIsolatedDocument`/`waitForImages`) out of `activity-report-pdf.ts`
     into a shared helper once this became the second consumer, rather than
     duplicating ~30 lines of non-trivial logic.
   - `src/lib/employee-recommendation-pdf-template.ts` /
     `employee-recommendation-pdf.ts` — the template and the
     html2canvas/jsPDF generator (portrait A4, `.output("blob")` rather than
     `.save()` directly, since the same bytes need both a browser download
     and a server-side upload).
   - `saveGeneratedErf` (`actions.ts`) — TAM-only, requires `status ===
     'approved'`, writes `erfStorageKey`/`erfGeneratedAt`/`erfGeneratedBy`,
     moves status to `erf_generated`.
   - **Two real bugs caught and fixed while building this, both worth
     recording**:
     1. `jobTitleChange`/`categoryChange` in `requestedActions` only stored
        the new level/position/employment-type **ids**, not a resolved
        display name — every other section already stored `to*Name`/`toLabel`
        alongside its id (e.g. `toTeamName`). Without the name, the ERF
        would have nothing readable to print without a live lookup,
        breaking the "snapshot stays stable" principle every other field
        follows. Fixed in the validation schema and the form's `onValueChange`
        handlers — see §4.3's shape note.
     2. `kpiResultStorageKey`/`erfStorageKey` were missing the `Documents/`
        root prefix this section always said they should have (mirroring
        `one-lot-project-document-format.ts`'s `projectDocumentsPrefix()`,
        both meant to land under the same eventual SharePoint "Documents"
        library). Files were landing in `storage/Employee Recommendation/...`
        instead of `storage/Documents/Employee Recommendation/...`. Fixed;
        no real files existed yet at the wrong path to migrate.
   - **Also discovered and fixed while testing this phase**: no migration
     had ever granted this module's permissions to any role except the
     implicit Administrator bypass — Manager, Unit Manager, Department
     Head, and Talent Acquisition Manager could do nothing here in
     practice. `drizzle/0057_grant_employee_recommendations_permissions.sql`
     grants `read`+`edit` to Manager, `read`+`approve` to Unit
     Manager/Department Head, and `read`+`generate_erf` to Talent
     Acquisition Manager — same pattern as
     `0048_grant_talent_acquisition_permissions.sql`. `write`/`delete` are
     granted nowhere — nothing in this module's action layer ever checks
     either.
   - **Post-Phase-5 change (2026-08-27)**: removed the per-section
     `effectiveDate` field from all six Action Requested sections (both the
     Zod schema and the form UI, including the `EffectiveDateField`
     component and its `DatePicker` import). Reason: the real effective
     date is whichever date Department Head approval lands on, or — for
     Project-Hired/Probationary/contractual staff — whichever date the new
     contract/record starts; it isn't something the requester can fill in
     accurately at request time. The printed ERF keeps its "Effective
     Date" column (unchanged paper-form layout) but every row now renders
     it blank instead of reading a field that no longer exists. Section
     grids were narrowed accordingly (3→2 cols for Supervisor/Department/
     Division, 4→3 for Job Title/Category; Salary's 6 fields still divide
     evenly at 3 cols, unchanged). See §4.3's shape note for the current
     `requestedActions` shape.
   - **Post-Phase-5 fix (2026-08-27)**: a real `submitted` recommendation
     got permanently stuck — submitted via the Administrator account (rank
     40), so neither Unit Manager (35) nor Department Head (38) could pass
     `assertApproverOutranksRequester`'s rank check, and there was no way to
     withdraw anything past `draft` (`cancelRecommendationDraft` explicitly
     rejected non-draft status). This is expected behavior for the rank
     rule itself (an approver must never be outranked by who they're
     reviewing — normal when a real Manager, rank 30, submits), but the
     *lack of an escape hatch* for a submission that can never clear that
     chain was a real gap matching §5.1's own state diagram, which already
     showed `cancelled` reachable from `submitted`, not just `draft`.
     Fixed: `cancelRecommendationDraft` → `cancelRecommendation`
     (`src/server/employee-recommendations/actions.ts`), now accepts
     `draft` or `submitted`; cancelling a `submitted` one also sets its
     `approvalRequest.status = 'cancelled'` and skips (`approvalStepStatus:
     'skipped'`) any still-`pending` `approvalStep` rows, so it stops
     appearing in "Needs your approval," the notification bell, and the nav
     badge. New `canCancel` on `RecommendationDetail` (same `inScope` +
     `employee_recommendations:edit` gate as `canEdit`, but allows either
     status) drives a "Withdraw recommendation" button shown for a
     `submitted` recommendation the viewer may act on (separate from
     `draft`'s existing "Cancel this draft" button, which keeps its own
     label/copy). Browser-verified against the real stuck row: withdrew it,
     confirmed `employee_recommendation.status`, `approval_request.status`,
     and both `approval_step.status` values all landed correctly.
   - **Post-Phase-5 fix (2026-08-27) — Letter page + full-page fit + no
     server-side storage.** Three related corrections to the ERF PDF itself,
     found while testing the letter-size fix against a real generated file:
     1. Format was A4; changed to `letter` to match the paper form.
     2. A one-page recommendation (the common case) rendered shorter than
        the page, leaving dead space below the signature block — fixed by
        stretching the image to the full page height when it renders
        shorter than one page (`employee-recommendation-pdf.ts`).
     3. Separately, the captured canvas was ~300px wider than the actual
        `.qnx-erf-page` content (`html2canvas(body, ...)` captured the full
        1200px-wide isolated iframe, not the 900px-wide content div), so
        that same stretch was also pulling blank right-margin into the
        page — fixed by capturing the `.qnx-erf-page` element directly
        instead of `body`.
     4. **Decision reversed while verifying the above**: stopped storing
        the generated PDF server-side at all — see §7's addendum for the
        full reasoning (compliance/audit tradeoff accepted deliberately;
        it also removes ERF generation's dependence on
        `isDocumentStorageAvailable()`, which nothing else in this fix
        needed to touch). `saveGeneratedErf` → `markErfGenerated(id)`,
        no longer takes a file; `erfStorageKey` column dropped
        (`0062_drop_erf_storage_key.sql`); the
        `/api/employee-recommendations/[id]/erf` download route deleted;
        `generateEmployeeRecommendationErfPdf` now calls `pdf.save()`
        directly instead of returning a `Blob` for the caller to both
        download and upload.
     5. **Follow-up (2026-08-27, same day)**: made generation repeatable
        instead of one-time, once "nobody can get it back later" from #4
        turned out to matter — see §7's addendum for the updated reasoning.
        `canGenerateErf` now covers `approved`/`erf_generated`/`applied`,
        not just `approved`; the ERF card simplified to a single "Generate
        ERF" button with no separate "already generated" state.
6. **Apply to employment history** — DONE (2026-08-27). `applyRecommendation()`
   (`src/server/employee-recommendations/actions.ts`) — TAM-only
   (`employee_recommendations:generate_erf`, same permission that already
   covers Generate ERF per its RBAC label "Generate ERF / Apply to
   Employment History"), only once `status === 'erf_generated'`.
   - Creates a new `employeeEmployment` row starting on a TAM-supplied
     **effective date** (`applyRecommendationSchema`) — not read from the
     recommendation, since the per-section `effectiveDate` field was
     removed (§4.3's note). Only the fields a checked section actually
     specifies are overridden (`jobTitleChange` → level/position,
     `salaryChange` → salary/allowances, `categoryChange` → employment
     type); everything else carries forward from the employee's **live**
     current employment record (`loadEmployeeDetail`, not a snapshot) —
     correct since Apply is a deliberately later, separate step per §4.3's
     "does not auto-apply" note. `supervisorChange` updates `employee.teamId`
     directly (not `employeeEmployment` — team lives on `employee`).
     `departmentChange`/`divisionChange` are still never applied anywhere
     (record-only notes for HRD, per open question 5 — unchanged).
   - Reuses `closeOtherOpenEmployments()` (`src/server/employees/actions.ts`,
     exported for this) rather than duplicating the "close the prior open
     row" invariant the Employees module already has — same reasoning as
     every other cross-module reuse in this build.
   - UI: an "Employment History" card (shown once `canApply` or already
     `applied`) with a From→To summary of only the sections that actually
     change an employment record (`ApplyChangesSummary` — Department/
     Division deliberately excluded, since they change nothing), an
     "Apply to Employment History" button opening a confirm dialog with a
     `DatePicker` defaulted to today, and — once applied — a "View employee
     record" link plus the applied timestamp.
   - **Found and fixed while building this**: `canGenerateErf` (and now
     `canApply`) were still `inScope`-gated (team match), the same class of
     bug as round 3's Unit Manager/Department Head visibility gap. Checked
     the real Talent Acquisition Manager account (Jazel Loterina) the same
     way JC Husmillo/Dan Dizon were checked for round 3: **no Employee
     record at all**. Fixed: `getRecommendationById` now also grants
     visibility to anyone holding `employee_recommendations:generate_erf`
     (for any non-`draft` status — a manager's draft stays private), and
     `canGenerateErf`/`canApply` no longer require `inScope` — the TAM's
     job is inherently org-wide, same reasoning as approvers not being
     team-scoped. This means Phase 5's ERF generation was *also* silently
     broken for the real TAM account until this fix; nobody had noticed
     because all prior verification used the Administrator account, which
     bypasses `inScope` via `hasUnrestrictedAccess`.
   - **Also fixed**: the first version of `applyRecommendation`'s
     `recordAudit()` call passed mismatched key names between the "before"
     object (`level`/`position`/`employmentType`) and the "after" object
     (`levelId`/`positionId`/`employmentTypeId`) — `diffFields()` unions
     keys from both sides, so this produced spurious paired entries (e.g.
     both `level: <old> → null` and `levelId: null → <new>`) instead of one
     clean `levelId: <old> → <new>`. Caught by inspecting the actual
     `audit_log` row after a live test run, not by code review. Fixed by
     using the same key names on both sides.
   - Browser-verified end-to-end twice: once exercising Job
     Title/Salary/Category (confirmed the new `employeeEmployment` row's
     values, the prior row's `endDate` closing correctly, and the clean
     audit diff after the fix), once exercising Supervisor Change alongside
     Job Title (confirmed `employee.teamId` updates correctly too). Both
     runs used a real employee (Crystal Ramos) since no synthetic test
     employee exists in this dataset — fully reverted afterward (deleted
     the test recommendation/approval rows/audit rows, deleted the new
     `employeeEmployment` row, restored the prior row's `endDate` to
     `NULL`, restored `employee.teamId` to its original value).
7. **Unify `/admin/approvals` into the generic inbox — DONE (2026-08-27,
   both the data layer and the inbox UI). A change-request notification-bell
   source is the one piece still later.**
   - **Migrate `employeeChangeRequest` onto `approvalRequest` — DONE.**
     Two decisions made with the user before implementing:
     - **Approver model: pool, not named.** Unlike Employee Recommendation,
       change requests have no single named approver — any `employees:edit`
       holder in scope may act. Forcing a named approver (e.g. the team's
       Unit Manager) would have been a real regression: any team without
       one assigned would block all its change requests, the same failure
       mode Employee Recommendation already has. Resolved instead by making
       `approvalStep.approverUserId`/`requiredRoleId` **nullable** — null
       means "no single approver/role for this step; see the entity's own
       action layer for who may act." Employee Recommendation steps always
       still set both.
     - **Scope: backend only.** `/admin/approvals`
       (`src/components/change-requests/approvals-view.tsx`) is visually
       **unchanged** — a real unified single-inbox UI (both entity types in
       one table, per-type preview on expand, per §4.2's original intent)
       is smaller follow-up work once the data model is shared.
     - What actually changed: `employeeChangeRequest` gained an
       `approvalRequestId` FK (nullable, mirrors
       `employeeRecommendation.approvalRequestId`) and `changeRequestStatus`
       gained `'cancelled'`. `status`/`reviewedBy`/`reviewedAt`/`reviewNote`
       stay on `employeeChangeRequest` as the denormalized source of truth
       `src/server/change-requests/queries.ts` still reads directly — so
       that file needed **no changes**. `submitProfileChangeRequest`
       (`src/server/settings/actions.ts`) now also inserts one
       `approvalRequest` + one `approvalStep` (both null approver/role,
       `pending`) alongside the `employeeChangeRequest` row, same shape
       `submitRecommendation` uses. `approveChangeRequest`/
       `rejectChangeRequest` (`src/server/change-requests/actions.ts`) keep
       every existing check (`assertRequestInScope`,
       `checkReviewerOutranksRequester`) and the existing auto-apply logic
       (writes to `employee`/`employeeAddress`) completely unchanged — they
       just also mirror the decision onto the linked step/request via a new
       `decideApprovalStep()` helper.
     - **`cancelMyChangeRequest` switched from hard-delete to soft-cancel**
       (`status: 'cancelled'`, mirrored onto the approval tables the same
       way `cancelRecommendation` does) — a direct, low-risk improvement
       the `cancelled` enum value enabled, not something the migration
       strictly required.
     - **Nav badge added** (`countPendingChangeRequestApprovals()` in
       `src/server/change-requests/queries.ts`, wired into
       `app/(app)/layout.tsx`'s `navBadges` next to the other two) — same
       `getCurrentUser()`+permission-guard-returns-0 pattern as
       `countPendingApprovalsForActor()`. Small, direct payoff from having
       the lifecycle queryable now.
     - Migration `drizzle/0059_change_requests_use_approval_engine.sql` +
       `0060_change_requests_approval_columns.sql` — **split into two
       files on purpose**: `ALTER TYPE ... ADD VALUE` can't be *used* within
       the same transaction that added it, and `drizzle-kit migrate` (via
       the `pg` driver, unlike the app's runtime `neon-http` driver) runs
       each migration file in one transaction. The first attempt put the
       enum additions and the backfill INSERTs referencing them in one
       file; the whole thing rolled back. 0059 is enum-only; 0060 (the
       nullable-column changes, the new FK column, and backfilling the 2
       pre-existing `employee_change_request` rows — both already
       `approved` — into matching `approval_request`/`approval_step` rows)
       runs after 0059 has committed.
     - **A real operational mistake worth recording**: `drizzle-kit
       migrate` failed silently (exit 1, no error text) on the first two
       attempts. Investigating turned up that the tool's own
       `__drizzle_migrations` journal table doesn't index rows by migration
       *number* — I misread a legitimate, already-applied row for
       migration 0058 as a bogus leftover from a failed 0059 attempt and
       deleted it. That's what caused the *next* `db:migrate` to keep
       silently failing (it was trying to re-apply 0058, whose columns
       already existed). Diagnosed by hashing every migration file
       (`sha256sum`) and matching against the journal's stored hashes one
       by one until the mapping became clear; fixed by re-inserting the
       correct journal row for 0058 alongside the new rows for 0059/0060.
       Applied 0059/0060's actual SQL directly via a raw `pg` client
       (bypassing `drizzle-kit migrate` entirely, which never produced a
       usable error message across several attempts) once the SQL itself
       was confirmed correct that way. `npm run db:migrate` afterward
       reported `[✓] migrations applied successfully!` — a true no-op,
       confirming the journal was consistent with reality again.
     - Browser-verified end-to-end: `/admin/approvals` unchanged and still
       listing the 2 historical (now-backfilled) rows correctly; simulated
       two fresh submissions (`employee.employeeId` gate on
       `submitProfileChangeRequest` means self-service submission can't be
       exercised through the real form with the Administrator account —
       same gap noted for JC Husmillo/Dan Dizon earlier — so the two test
       rows were inserted directly, matching exactly what the action would
       write) and drove **reject** and **approve** through the real UI:
       reject correctly left the employee record untouched and marked both
       the `employeeChangeRequest` and the mirrored `approvalStep`/
       `approvalRequest` rejected; approve correctly mutated the real
       employee field (`viberNumber`) *and* mirrored the decision onto the
       approval tables; the nav badge appeared at 1 while a request was
       pending and disappeared once both were resolved. All test rows and
       the real mutation were reverted afterward.
   - **Unified `/admin/approvals` inbox UI — DONE (2026-08-27).**
     `src/app/(app)/admin/approvals/page.tsx` now gates on *either*
     `employees:edit` or `employee_recommendations:approve` (`canAny`, not
     `requirePermission`, since neither alone should exclude someone with
     the other) and renders up to two independent sections, each shown only
     to whoever holds its permission:
     - **Employee Recommendation** — `PendingApprovalsView`
       (`src/components/employee-recommendations/pending-approvals-view.tsx`),
       reused as-is from the recommendation module's own "Needs your
       approval" tab rather than rebuilt — it already does exactly this:
       list steps assigned to the viewer, each linking to
       `/employee-recommendations/[id]` to actually review/decide.
     - **Change Requests** — the existing `ApprovalsView`, completely
       unchanged.
     **Deliberately two sections, not one merged table**: a change-request
     row is pool-approved (any `employees:edit` holder in scope, one
     decision closes the whole request) while a recommendation row is
     addressed to one named approver and may be step *N* of several — the
     row shapes, the gating logic, and the approve/reject action signatures
     (`{ id }` vs `{ approvalRequestId }`) all differ enough that forcing a
     single table would mean either hiding real differences or building a
     third, more complex UI layer on top of two that already work well.
     Clicking "Review" on a recommendation row still navigates to that
     recommendation's own detail page (richer than anything this list could
     inline — full requested-actions diff, approval timeline, ERF/Apply
     actions) rather than duplicating that page's UI into a dialog.
     Nav badge (`src/app/(app)/layout.tsx`) now sums
     `countPendingApprovalsForActor()` + `countPendingChangeRequestApprovals()`
     onto `/admin/approvals`; `/employee-recommendations` keeps its own
     separate count for its own tabs. Nav entry
     (`src/lib/navigation.ts`) updated to `permissions: ['employees:edit',
     'employee_recommendations:approve']` — `visibleNavigation()` already
     treats a nav item's `permissions` array as "any one of these" via
     `canAny()`, so this was a one-line change, not new nav-filtering logic.
   - **Still later, not part of this build**: an in-app notification-bell
     source for change requests (Employee Recommendation's own email
     notifications are DONE — see §13), resolving the open questions in §2
     with real usage feedback.

## 14. Talent Acquisition migrate-to-Employee end date — DONE (2026-08-27)

Closes §2 open question 6: `migrateCandidateToEmployee`
(`src/server/talent-acquisition/migrate-actions.ts`) inserted every new
hire's first `employeeEmployment` row with `endDate: null` unconditionally,
so a Project-Hired or Probationary hire never appeared in this module's own
monitoring queue (§6) until someone noticed and manually added an end date
through the Employees module — an easy-to-miss step nothing prompted anyone
to take, confirmed for real against live data back when this question was
first raised (exactly one TA-migrated hire existed then; her employment row
had `endDate: null`, confirming the gap was real even though her specific
type wasn't PH/Probationary).

Fixed by adding `employment.endDate` to both `migrateInputSchema`
(server) and `migrateFormSchema` (`migrate-to-employee-form.tsx`) — same
`z.string().optional().or(z.literal(""))` shape and the same `endDate >=
startDate` `.refine()` as `employmentRecordSchema`
(`src/lib/validation/employee.ts`), the Employees module's own equivalent
schema, so the rule reads identically in both places. One addition beyond
what the Employees module's schema does: a second `.refine()` requiring
`endDate` whenever `employmentTypeId` is `project_based` or `probationary`
— matching `MONITORED_EMPLOYMENT_TYPES` in
`src/server/employee-recommendations/queries.ts` — since an *optional* end
date would have left the exact same gap this is meant to close. Both
schemas duplicate this as a small local `CONTRACT_END_DATE_REQUIRED_TYPES`
set rather than importing `MONITORED_EMPLOYMENT_TYPES` directly (that
module is `"server-only"`, so the client-side form couldn't import it
anyway, and the server action file already duplicates its other schemas
independently of the Employees module by existing convention).

UI: the form's Employment section now shows a `DatePicker` for
`employment.endDate` — labeled "Contract end date" or "Probation end date"
depending on the selected employment type — only when
`employmentTypeId` is one of the two monitored types (`useWatch`, not
`form.watch()`, per this repo's React Compiler lint rule); hidden and
optional for every other type, matching how the field behaves everywhere
else in the app. Uses `toYear={MAX_DATE_PICKER_YEAR}` (`+10` years), same
convention `employment-history-table.tsx` already uses for a
predetermined future contract end date.

`endDate` is passed straight through to the `employeeEmployment` insert
(`endDate: values.employment.endDate || null`) — no other change to the
migrate flow.

## 13. Email notifications

**Trigger wiring DONE (2026-08-27); the actual send is a deliberate no-op
until Microsoft Graph credentials exist.** The user doesn't yet have the
Entra ID app registration this needs (Client ID / Tenant ID / Client
Secret), so rather than skip the phase entirely, it split into two
independent pieces — build the part that doesn't need credentials now,
leave one function to fill in later:

- **`src/lib/email.ts`** — `isEmailAvailable()` (checks four `MS_GRAPH_*`
  env vars, all unset today → `false`) and `sendEmail({ to, subject, html
})`. When unavailable, `sendEmail` logs what it *would* have sent and
  returns `false` — never throws, so nothing that calls it can be broken by
  email being unconfigured. Once the env vars exist, only this one
  function's body needs a real implementation (Microsoft Graph
  `/users/{sender}/sendMail`, app-only client-credentials auth) — every
  call site and every trigger point is already correct and doesn't change.
- **`src/server/employee-recommendations/notifications.ts`** — the actual
  trigger logic: who gets emailed, and with what, for each lifecycle event.
  Wired into `src/server/employee-recommendations/actions.ts`:
  - `submitRecommendation` → emails the first step's approver.
  - `approveRecommendationStep` → emails the next step's approver, or (on
    the final approval) every active user whose role holds
    `employee_recommendations:generate_erf` — resolved the same
    join-then-filter way `listRecommendationApproverOptions()`
    (`src/server/maintenance/queries.ts`) already resolves TAM/approver
    candidates elsewhere, rather than a one-off query shape.
  - `rejectRecommendationStep` → emails the original submitter, including
    the rejection note if one was given.
  - Deliberately **not** wired: ERF generation or Apply to Employment
    History. Both are TAM-initiated actions the TAM already knows she just
    did — nobody's waiting to be told about their own click. Notifying the
    submitter on ERF-generated/applied would be a reasonable later addition
    if it turns out people want it; not built speculatively.
- Every notify call is `await`ed (a serverless function can't safely leave
  work running after it returns) but can never fail the action it's
  attached to, since `sendEmail()` only ever returns `false` or resolves —
  it doesn't throw.

**What's still needed from IT before this actually sends anything** — same
shape as `docs/DOCUMENTS.md`'s SharePoint ask, different Graph scope:
1. An **Entra ID (Azure AD) app registration** — Client ID, Tenant ID, and
   a Client Secret (or certificate, per IT's rotation policy).
2. **API permissions**: Microsoft Graph, **application** permission
   `Mail.Send` (not delegated — this is an unattended backend service, not
   acting on behalf of a signed-in user), with **admin consent granted**.
3. **A sending mailbox** — the address `Mail.Send` is scoped to send as
   (`MS_GRAPH_SENDER_EMAIL`), e.g. a shared mailbox like
   `mcsu-console@questronix.com.ph` rather than a real person's inbox.
4. Confirm whether this can reuse the **same app registration** as the
   SharePoint work in `docs/DOCUMENTS.md` (same Client ID/Tenant ID, just
   an additional `Mail.Send` permission grant alongside `Sites.Selected`)
   or whether IT prefers two separate registrations — either works, this
   app doesn't care.

Once those exist, set the four `MS_GRAPH_*` variables (`.env.example` has
the full list) and implement `sendEmail()`'s body in `src/lib/email.ts` —
that's the entire remaining scope, nothing else in this feature changes.

**`EMAIL_OVERRIDE_TO` (added 2026-08-27)**: while developing/testing against
real accounts on the shared dev database, every outbound email redirects to
one address (`ryan_santiago@questronix.com.ph` in `.env.local` today)
instead of its real, per-role recipients — real accounts here belong to
real coworkers, so testing the notification triggers shouldn't spam them.
Handled entirely inside `sendEmail()` (`src/lib/email.ts`): the real
recipients are preserved in the subject line and a banner in the body, so
nothing about who an email was "really" for gets lost, just redirected.
Unset this once email is actually ready to reach its real recipients — it
applies unconditionally whenever it's set, dev or otherwise.
