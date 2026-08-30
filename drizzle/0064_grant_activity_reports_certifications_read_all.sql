-- Grants the two new monitoring-only permissions (see docs/RBAC.md) to the
-- "manager or higher" tier: Team Lead/Manager (id 'manager'), Unit Manager
-- and Department Head — the same tier Employee Recommendation's approval
-- chain uses. Administrator needs no grant; `can()` bypasses it for every
-- permission regardless of what's stored. Any other role (e.g. Talent
-- Acquisition Manager) can still be granted this from Access Control with no
-- further migration.
UPDATE "role"
SET "permissions" = (
	SELECT jsonb_agg(DISTINCT val)
	FROM jsonb_array_elements_text(
		"permissions" || '["activity_reports:read_all","certifications:read_all"]'::jsonb
	) AS val
)
WHERE "id" IN ('manager', 'unit_manager', 'department_head');
