-- Two new roles for the Talent Acquisition pipeline, seeded the same way as
-- Department Head / Unit Manager (drizzle/0027_seed_dept_head_unit_manager_roles.sql):
-- ordinary (non-system) rows an administrator can rename/re-rank/delete from
-- Access Control like any custom role.
--
-- Talent Acquisition Staff (rank 22, between Engineer 20 and Manager 30):
-- runs the day-to-day pipeline and L1 Assessment, but can't delete records or
-- migrate a candidate to Employee.
-- Talent Acquisition Manager (rank 32, between Manager 30 and Unit Manager 35):
-- full CRUD plus the one action nobody else may hold — migrating a candidate
-- into the Employee module.
INSERT INTO "role" ("id", "label", "description", "rank", "is_system", "permissions", "created_at", "updated_at")
VALUES
	(
		'talent_acquisition_staff',
		'Talent Acquisition Staff',
		'Sources and tracks candidates through the hiring pipeline.',
		22,
		false,
		'["talent_acquisition:read","talent_acquisition:write","talent_acquisition:edit","talent_acquisition:l1_assess"]'::jsonb,
		now(),
		now()
	),
	(
		'talent_acquisition_manager',
		'Talent Acquisition Manager',
		'Oversees the hiring pipeline and migrates hired candidates into Employees.',
		32,
		false,
		'["talent_acquisition:read","talent_acquisition:write","talent_acquisition:edit","talent_acquisition:delete","talent_acquisition:l1_assess","talent_acquisition:migrate"]'::jsonb,
		now(),
		now()
	)
ON CONFLICT ("id") DO NOTHING;