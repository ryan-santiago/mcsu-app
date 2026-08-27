-- Three unrelated role/RBAC fixes requested together:
--
-- 1. Department Head, Unit Manager, and Talent Acquisition Manager could not
--    see any employees in the Employees module — `listEmployees`/
--    `getEmployeeById` (src/server/employees/queries.ts) scope non-admins to
--    their own team via `hasUnrestrictedAccess()`, which is hardcoded to the
--    literal `admin` role only. None of these three roles is `admin`, and
--    none of them typically has a linked Employee record (so `actor.teamId`
--    is null), so they saw zero rows. Fixed in code with a new
--    `employees:read_all` permission (read-only org-wide visibility,
--    deliberately narrower than `hasUnrestrictedAccess()` — it does not
--    grant write access to other teams or override approval-step
--    assignment elsewhere) — granted here to all three roles.
--    Talent Acquisition Manager was also missing plain `employees:read`
--    entirely (its permission set was scoped to talent_acquisition:* only),
--    which would have rejected it before scoping was even considered.
-- 2. Talent Acquisition Manager marked `is_system` — same "Required" /
--    non-deletable protection as Administrator/Department Head/Unit
--    Manager/Manager already have (`drizzle/0028_mark_dept_head_unit_manager_required.sql`
--    is the precedent for this exact shape).
-- 3. `manager` role relabeled "Team Lead/Manager" — cosmetic, requested
--    directly. `id`/`rank`/`permissions` are unchanged; only the display
--    label changes, so every "Manager"-role account keeps its existing
--    access unaffected.
UPDATE "role"
SET "permissions" = (
	SELECT jsonb_agg(DISTINCT val)
	FROM jsonb_array_elements_text(
		"permissions" || '["employees:read","employees:read_all"]'::jsonb
	) AS val
)
WHERE "id" IN ('department_head', 'unit_manager', 'talent_acquisition_manager');--> statement-breakpoint
UPDATE "role"
SET "is_system" = true
WHERE "id" = 'talent_acquisition_manager';--> statement-breakpoint
UPDATE "role"
SET "label" = 'Team Lead/Manager'
WHERE "id" = 'manager';
