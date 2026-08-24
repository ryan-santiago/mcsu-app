-- Seeds the four default Kanban columns for every existing One-Lot Project
-- (new projects get these from `createOneLotProject` itself going forward),
-- then backfills each work item's new `column_id` from its old `status`
-- value. `status` and the `work_item_status` enum are dropped in the next
-- migration, once this backfill has run.

INSERT INTO "one_lot_project_board_column" ("id", "project_id", "name", "sort_order", "is_default", "is_done", "created_at")
SELECT gen_random_uuid()::text, "id", 'To Do', 0, true, false, now()
FROM "one_lot_project";

INSERT INTO "one_lot_project_board_column" ("id", "project_id", "name", "sort_order", "is_default", "is_done", "created_at")
SELECT gen_random_uuid()::text, "id", 'In Progress', 1, false, false, now()
FROM "one_lot_project";

INSERT INTO "one_lot_project_board_column" ("id", "project_id", "name", "sort_order", "is_default", "is_done", "created_at")
SELECT gen_random_uuid()::text, "id", 'In Review', 2, false, false, now()
FROM "one_lot_project";

INSERT INTO "one_lot_project_board_column" ("id", "project_id", "name", "sort_order", "is_default", "is_done", "created_at")
SELECT gen_random_uuid()::text, "id", 'Done', 3, false, true, now()
FROM "one_lot_project";

UPDATE "one_lot_project_work_item" w
SET "column_id" = c."id"
FROM "one_lot_project_board_column" c
WHERE w."project_id" = c."project_id"
	AND c."name" = CASE w."status"
		WHEN 'todo' THEN 'To Do'
		WHEN 'in_progress' THEN 'In Progress'
		WHEN 'done' THEN 'Done'
	END;
