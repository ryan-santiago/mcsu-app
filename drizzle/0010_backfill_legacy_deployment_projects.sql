-- Seeds the three engagement types the Projects module ships with — same
-- three seeded by scripts/seed.ts's seedEngagementTypes(), included here too
-- so an already-running database gets them without a manual seed run.
INSERT INTO "engagement_type" ("id", "name", "is_active", "created_at", "updated_at")
VALUES
	(gen_random_uuid()::text, 'One-Lot Project', true, now(), now()),
	(gen_random_uuid()::text, 'Staff Augmentation', true, now(), now()),
	(gen_random_uuid()::text, 'Managed Services', true, now(), now())
ON CONFLICT ("name") DO NOTHING;

-- Employee deployment history used to store "project" as free text (see
-- schema.ts's old comment on employeeDeployment.project, and docs/RBAC.md /
-- ARCHITECTURE.md for why). Now that Projects is a real module, each distinct
-- (client, project name) pair found in that history becomes a real Project
-- row — grouped case-insensitively so "Fullstack Developer" and "fullstack
-- developer" don't become two records. S3P Number gets a LEGACY-######
-- placeholder (the column is NOT NULL + unique, same convention as
-- employee.code); Sales Representative, Solutions Manager, Engagement Type
-- and dates are left null for an admin to fill in from the Projects screen.
WITH distinct_projects AS (
	SELECT
		client_id,
		lower(trim(project)) AS project_key,
		min(trim(project)) AS project_name
	FROM "employee_deployment"
	WHERE project IS NOT NULL AND trim(project) <> ''
	GROUP BY client_id, lower(trim(project))
),
numbered AS (
	SELECT client_id, project_key, project_name, row_number() OVER () AS rn
	FROM distinct_projects
)
INSERT INTO "project" ("id", "s3p_number", "name", "client_id", "created_at", "updated_at")
SELECT
	gen_random_uuid()::text,
	'LEGACY-' || lpad(rn::text, 6, '0'),
	project_name,
	client_id,
	now(),
	now()
FROM numbered;

-- Backfill: match each deployment row to the project row created for its
-- (client, project name) pair above.
UPDATE "employee_deployment" ed
SET "project_id" = p."id"
FROM "project" p
WHERE ed."project_id" IS NULL
	AND ed."client_id" = p."client_id"
	AND lower(trim(ed."project")) = lower(trim(p."name"))
	AND p."s3p_number" LIKE 'LEGACY-%';

-- Safety net: any deployment row that still has no project_id (a blank or
-- whitespace-only legacy "project" value would fall through the match above)
-- gets a generic per-client placeholder project, so the column can safely
-- become NOT NULL in the next migration.
WITH missing_clients AS (
	SELECT DISTINCT client_id
	FROM "employee_deployment"
	WHERE project_id IS NULL
),
inserted AS (
	INSERT INTO "project" ("id", "s3p_number", "name", "client_id", "created_at", "updated_at")
	SELECT
		gen_random_uuid()::text,
		'LEGACY-UNSPEC-' || substr(client_id, 1, 8),
		'Unspecified',
		client_id,
		now(),
		now()
	FROM missing_clients
	RETURNING "id", "client_id"
)
UPDATE "employee_deployment" ed
SET "project_id" = inserted."id"
FROM inserted
WHERE ed."project_id" IS NULL AND ed."client_id" = inserted."client_id";
