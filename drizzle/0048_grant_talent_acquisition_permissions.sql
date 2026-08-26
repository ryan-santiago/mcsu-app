-- Grants the new Talent Acquisition module's permissions to existing role
-- rows — same reason as every prior "grant_*_permissions" migration (e.g.
-- drizzle/0030_grant_engagement_permissions.sql): Access Control can't grant
-- a permission that doesn't exist in a role's stored array yet.
--
-- Admin: cosmetic — can() already bypasses this row.
-- Department Head / Unit Manager: seeded as admin-equivalent for every
-- permission that existed at their seed time; without this they'd silently
-- lack a module added afterward — same reasoning as every prior grant.
-- Manager: read/write (can file a Request, view the pipeline) plus
-- l2_assess — "L2 Assessment can be assigned to any with Manager Role", per
-- the module's design. Deliberately NOT edit/delete/l1_assess/finalize/
-- migrate — those belong to Talent Acquisition Staff/Manager and Unit
-- Manager-tier roles respectively.
-- Engineer / Viewer: no grant — this is a Manager+ workflow.
UPDATE "role"
SET "permissions" = (
	SELECT jsonb_agg(DISTINCT val)
	FROM jsonb_array_elements_text(
		"permissions" || '["talent_acquisition:read","talent_acquisition:write","talent_acquisition:edit","talent_acquisition:delete","talent_acquisition:l1_assess","talent_acquisition:l2_assess","talent_acquisition:finalize","talent_acquisition:migrate"]'::jsonb
	) AS val
)
WHERE "id" IN ('admin', 'department_head', 'unit_manager');

UPDATE "role"
SET "permissions" = (
	SELECT jsonb_agg(DISTINCT val)
	FROM jsonb_array_elements_text(
		"permissions" || '["talent_acquisition:read","talent_acquisition:write","talent_acquisition:l2_assess"]'::jsonb
	) AS val
)
WHERE "id" = 'manager';