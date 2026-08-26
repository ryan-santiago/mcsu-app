-- Talent Acquisition ATS redesign, step 2 of 6: grant the new
-- `talent_acquisition:approve` permission (see src/lib/rbac.ts) to the same
-- tier that already got seeded as admin-equivalent — Admin/Dept Head/Unit
-- Manager. Deliberately NOT granted to Manager or either Talent Acquisition
-- role, so a TA Manager can't approve their own team's requests.
UPDATE "role"
SET "permissions" = (
	SELECT jsonb_agg(DISTINCT val)
	FROM jsonb_array_elements_text(
		"permissions" || '["talent_acquisition:approve"]'::jsonb
	) AS val
)
WHERE "id" IN ('admin', 'department_head', 'unit_manager');
