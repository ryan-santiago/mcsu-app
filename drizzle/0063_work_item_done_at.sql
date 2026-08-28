-- Adds a precise "entered the Done column" timestamp to one_lot_project_work_item,
-- replacing the burndown chart's previous approximation from updated_at (which any
-- unrelated edit to an already-done item would also bump, corrupting the chart).
-- See getOneLotProjectActiveSprintBurndown / the write paths in backlog-actions.ts.
--
-- Backfill: any item already sitting in its project's isDone column gets its
-- current updated_at as a best-effort done_at — the same approximation the
-- burndown chart already relied on, so existing "done" history doesn't regress
-- to "never completed." Only future column moves get the precise timestamp.
ALTER TABLE "one_lot_project_work_item" ADD COLUMN "done_at" timestamp with time zone;--> statement-breakpoint
UPDATE "one_lot_project_work_item" AS w
SET "done_at" = w."updated_at"
FROM "one_lot_project_board_column" AS c
WHERE c."id" = w."column_id" AND c."is_done" = true;
