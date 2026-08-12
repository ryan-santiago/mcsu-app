-- Appends the new projects:* permissions to the Administrator and Manager
-- roles' already-existing stored rows — see docs/RBAC.md "Add a permission".
-- Administrator no longer strictly needs this (can() in src/lib/rbac.ts
-- special-cases the "admin" role id to always hold every permission), but
-- this keeps its stored row accurate for anyone inspecting the table
-- directly. Manager genuinely needs it: it isn't special-cased, so its
-- access comes entirely from what's in this column.
--
-- Deduplicated via jsonb_agg(DISTINCT ...) so re-running this migration is
-- harmless if it's ever replayed against a database that already has it.
UPDATE "role"
SET "permissions" = (
	SELECT jsonb_agg(DISTINCT val)
	FROM jsonb_array_elements_text(
		"permissions" || '["projects:read","projects:write","projects:edit","projects:delete"]'::jsonb
	) AS val
)
WHERE "id" IN ('admin', 'manager');
