-- The old `role` enum values ("admin"/"manager"/"engineer"/"viewer") are
-- exactly the ids seeded for those roles in 0005_seed_roles.sql, so this is a
-- straight cast, not a data transform.
UPDATE "user" SET "role_id" = "role"::text WHERE "role_id" IS NULL;
