-- Seeds the Employment Type lookup with the six values the old
-- `employment_type` enum shipped with. Ids match the old enum's string
-- values on purpose, so the following backfill migration is a plain cast.
-- "Project Hired" is the renamed label for what the enum called
-- "project_based" ("Project-based" in the UI) — see EMPLOYMENT_TYPE_LABELS
-- history in src/lib/employee-format.ts.
INSERT INTO "employment_type_lookup" ("id", "name", "is_active", "created_at", "updated_at")
VALUES
	('regular', 'Regular', true, now(), now()),
	('probationary', 'Probationary', true, now(), now()),
	('contractual', 'Contractual', true, now(), now()),
	('project_based', 'Project Hired', true, now(), now()),
	('consultant', 'Consultant', true, now(), now()),
	('intern', 'Intern', true, now(), now())
ON CONFLICT ("id") DO NOTHING;
