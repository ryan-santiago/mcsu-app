-- Grants the new Engagement modules' permissions to existing role rows.
-- Access Control can't grant a permission that doesn't exist in a role's
-- stored array yet — see docs/RBAC.md "Add a permission" and the identical
-- pattern in drizzle/0012_grant_projects_permissions.sql.
--
-- Admin: cosmetic — can() already bypasses this row — but stored for
-- matrix-display consistency, same as every prior module.
-- Department Head / Unit Manager: seeded as admin-equivalent for every
-- permission that existed at their seed time (0027); without this they'd
-- silently lack a module added afterward.
-- Manager: full CRUD, matching Projects (a business domain) rather than
-- Devices' read-only treatment (an admin lookup table).
UPDATE "role"
SET "permissions" = (
	SELECT jsonb_agg(DISTINCT val)
	FROM jsonb_array_elements_text(
		"permissions" || '["staff_augmentation:read","staff_augmentation:write","staff_augmentation:edit","staff_augmentation:delete","one_lot_projects:read","one_lot_projects:write","one_lot_projects:edit","one_lot_projects:delete"]'::jsonb
	) AS val
)
WHERE "id" IN ('admin', 'department_head', 'unit_manager', 'manager');
