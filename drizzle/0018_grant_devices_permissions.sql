-- Appends the new devices:* permissions to the Administrator and Manager
-- roles' already-existing stored rows — see docs/RBAC.md "Add a permission".
-- Administrator no longer strictly needs this (can() in src/lib/rbac.ts
-- special-cases the "admin" role id to always hold every permission), but
-- this keeps its stored row accurate for anyone inspecting the table
-- directly. Manager gets read-only by default, matching Maintenance/Audit
-- Trail/Settings/Access Control rather than full CRUD — adjustable from
-- Access Control afterward like any other role.
--
-- Deduplicated via jsonb_agg(DISTINCT ...) so re-running this migration is
-- harmless if it's ever replayed against a database that already has it.
UPDATE "role"
SET "permissions" = (
	SELECT jsonb_agg(DISTINCT val)
	FROM jsonb_array_elements_text(
		"permissions" || '["devices:read","devices:write","devices:edit","devices:delete"]'::jsonb
	) AS val
)
WHERE "id" = 'admin';

UPDATE "role"
SET "permissions" = (
	SELECT jsonb_agg(DISTINCT val)
	FROM jsonb_array_elements_text(
		"permissions" || '["devices:read"]'::jsonb
	) AS val
)
WHERE "id" = 'manager';
