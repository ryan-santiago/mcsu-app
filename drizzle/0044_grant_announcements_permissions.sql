-- Grants the new Announcements module's permissions to existing role rows —
-- same reason as drizzle/0030_grant_engagement_permissions.sql: Access
-- Control can't grant a permission that doesn't exist in a role's stored
-- array yet.
--
-- Admin: cosmetic — can() already bypasses this row.
-- Department Head / Unit Manager / Manager: full CRUD — this is a company
-- bulletin board leadership posts to, same tier that gets full Projects
-- access.
-- Engineer / Viewer: read-only, same as they already get for Dashboard —
-- everyone reads announcements, only leadership tiers post them.
UPDATE "role"
SET "permissions" = (
	SELECT jsonb_agg(DISTINCT val)
	FROM jsonb_array_elements_text(
		"permissions" || '["announcements:read","announcements:write","announcements:edit","announcements:delete"]'::jsonb
	) AS val
)
WHERE "id" IN ('admin', 'department_head', 'unit_manager', 'manager');

UPDATE "role"
SET "permissions" = (
	SELECT jsonb_agg(DISTINCT val)
	FROM jsonb_array_elements_text(
		"permissions" || '["announcements:read"]'::jsonb
	) AS val
)
WHERE "id" IN ('engineer', 'viewer');