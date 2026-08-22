-- Two new roles for the upcoming Employee Recommendation module (Manager
-- submits a recommendation for a team member; these roles approve it):
-- Department Head (rank 38) and Unit Manager (rank 35), both ranked between
-- Administrator (40) and Manager (30) so they can act on Manager but not on
-- each other's Administrator-only territory.
--
-- Seeded with every current permission — "admin access" in practice — but
-- neither is `is_system` and neither is special-cased in `can()`
-- (src/lib/rbac.ts only ever bypasses the "admin" role id), so unlike
-- Administrator's locked row, these are ordinary, editable data: an
-- administrator can narrow, widen, rename or delete them from Access
-- Control like any custom role. See docs/RBAC.md "Roles are data, not code".
INSERT INTO "role" ("id", "label", "description", "rank", "is_system", "permissions", "created_at", "updated_at")
VALUES
	(
		'department_head',
		'Department Head',
		'Approves employee recommendations and oversees department-level access.',
		38,
		false,
		'["dashboard:read","dashboard:write","dashboard:edit","dashboard:delete","users:read","users:write","users:edit","users:delete","employees:read","employees:write","employees:edit","employees:delete","projects:read","projects:write","projects:edit","projects:delete","maintenance:read","maintenance:write","maintenance:edit","maintenance:delete","devices:read","devices:write","devices:edit","devices:delete","audit:read","audit:write","audit:edit","audit:delete","settings:read","settings:write","settings:edit","settings:delete","access_control:read","access_control:write","access_control:edit","access_control:delete"]'::jsonb,
		now(),
		now()
	),
	(
		'unit_manager',
		'Unit Manager',
		'Approves employee recommendations and oversees unit-level access.',
		35,
		false,
		'["dashboard:read","dashboard:write","dashboard:edit","dashboard:delete","users:read","users:write","users:edit","users:delete","employees:read","employees:write","employees:edit","employees:delete","projects:read","projects:write","projects:edit","projects:delete","maintenance:read","maintenance:write","maintenance:edit","maintenance:delete","devices:read","devices:write","devices:edit","devices:delete","audit:read","audit:write","audit:edit","audit:delete","settings:read","settings:write","settings:edit","settings:delete","access_control:read","access_control:write","access_control:edit","access_control:delete"]'::jsonb,
		now(),
		now()
	)
ON CONFLICT ("id") DO NOTHING;
