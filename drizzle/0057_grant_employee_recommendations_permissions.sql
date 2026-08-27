-- Grants the Employee Recommendation module's permissions to existing role
-- rows — same reason as every prior "grant_*_permissions" migration (e.g.
-- drizzle/0048_grant_talent_acquisition_permissions.sql): Access Control
-- can't grant a permission that doesn't exist in a role's stored array yet.
-- This was missed when the module itself shipped (schema + actions went in
-- across several prior migrations/commits without a matching grant), so
-- until this runs, only Administrator (which bypasses `can()` entirely) can
-- do anything with this module at all — see docs/EMPLOYEE_RECOMMENDATION.md §9.
--
-- Admin: cosmetic — can() already bypasses this row.
-- Manager: read + edit — can create/edit/submit a recommendation for their
--   own team (`employee_recommendations:edit` gates create, draft edits,
--   submit, KPI upload, and cancel — see actions.ts).
-- Unit Manager / Department Head: read + approve — the two-step chain
--   `resolveApprovalChain()` always resolves to, same rank tier already
--   granted `talent_acquisition:approve` for the equivalent reason.
--   Deliberately NOT edit — they review recommendations, they don't author
--   them.
-- Talent Acquisition Manager: read + generate_erf — the only role that may
--   generate the final ERF PDF once a recommendation is fully approved.
-- Engineer / Viewer / Talent Acquisition Staff: no grant — outside this
--   workflow.
--
-- `write`/`delete` are omitted everywhere — nothing in
-- src/server/employee-recommendations/{actions,queries}.ts ever checks
-- either (mutation is entirely gated on `:edit`, `:approve`, or
-- `:generate_erf`; there's no hard-delete action, only cancel), so granting
-- them would just be inert, matching `audit:write`'s existing precedent.
UPDATE "role"
SET "permissions" = (
	SELECT jsonb_agg(DISTINCT val)
	FROM jsonb_array_elements_text(
		"permissions" || '["employee_recommendations:read","employee_recommendations:edit"]'::jsonb
	) AS val
)
WHERE "id" IN ('admin', 'manager');

UPDATE "role"
SET "permissions" = (
	SELECT jsonb_agg(DISTINCT val)
	FROM jsonb_array_elements_text(
		"permissions" || '["employee_recommendations:read","employee_recommendations:approve"]'::jsonb
	) AS val
)
WHERE "id" IN ('department_head', 'unit_manager');

UPDATE "role"
SET "permissions" = (
	SELECT jsonb_agg(DISTINCT val)
	FROM jsonb_array_elements_text(
		"permissions" || '["employee_recommendations:read","employee_recommendations:generate_erf"]'::jsonb
	) AS val
)
WHERE "id" = 'talent_acquisition_manager';
