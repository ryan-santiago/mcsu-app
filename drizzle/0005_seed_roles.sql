-- Seeds the four roles this app has always shipped with, translated into the
-- dynamic Read/Write/Edit/Delete matrix — see docs/RBAC.md. Administrator and
-- Manager are `is_system` (cannot be deleted); Administrator's permissions
-- are additionally locked in src/server/roles/actions.ts regardless of what
-- is seeded here.
INSERT INTO "role" ("id", "label", "description", "rank", "is_system", "permissions", "created_at", "updated_at")
VALUES
	(
		'admin',
		'Administrator',
		'Full control of the workspace, including roles and settings.',
		40,
		true,
		'["dashboard:read","dashboard:write","dashboard:edit","dashboard:delete","users:read","users:write","users:edit","users:delete","employees:read","employees:write","employees:edit","employees:delete","maintenance:read","maintenance:write","maintenance:edit","maintenance:delete","audit:read","audit:write","audit:edit","audit:delete","settings:read","settings:write","settings:edit","settings:delete","access_control:read","access_control:write","access_control:edit","access_control:delete"]'::jsonb,
		now(),
		now()
	),
	(
		'manager',
		'Manager',
		'Oversees the unit — approves and manages access.',
		30,
		true,
		'["dashboard:read","dashboard:write","dashboard:edit","dashboard:delete","employees:read","employees:write","employees:edit","employees:delete","users:read","users:edit","maintenance:read","audit:read","settings:read","access_control:read"]'::jsonb,
		now(),
		now()
	),
	(
		'engineer',
		'Engineer',
		'Delivers services day to day.',
		20,
		false,
		'["dashboard:read"]'::jsonb,
		now(),
		now()
	),
	(
		'viewer',
		'Viewer',
		'Read-only access to dashboards.',
		10,
		false,
		'["dashboard:read"]'::jsonb,
		now(),
		now()
	)
ON CONFLICT ("id") DO NOTHING;
