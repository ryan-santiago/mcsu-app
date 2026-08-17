-- The old `employment_type` enum values are exactly the ids seeded for
-- those rows in 0023_seed_employment_types.sql, so this is a straight cast,
-- not a data transform.
UPDATE "employee_employment" SET "employment_type_id" = "employment_type"::text WHERE "employment_type_id" IS NULL;
