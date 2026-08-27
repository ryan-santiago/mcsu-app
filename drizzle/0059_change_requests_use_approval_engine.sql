-- First half of migrating employeeChangeRequest onto the generic
-- approvalRequest/approvalStep engine — see docs/EMPLOYEE_RECOMMENDATION.md
-- §12 step 7. Split into two migration files on purpose: `drizzle-kit
-- migrate` runs each file in its own transaction (via the `pg` driver, not
-- the app's runtime `neon-http` driver — this CLI tool doesn't share that
-- limitation), and Postgres refuses to *use* a value added by `ALTER TYPE
-- ... ADD VALUE` within the same transaction that added it. The first
-- attempt at this migration put the enum additions and the backfill INSERTs
-- (which reference the new values) in one file/transaction and the whole
-- thing rolled back with an "unsafe use of new value of enum type" error —
-- this file is enum-only so it commits cleanly before 0060 uses either
-- value.
ALTER TYPE "approval_entity_type" ADD VALUE 'employee_change_request';--> statement-breakpoint
ALTER TYPE "change_request_status" ADD VALUE 'cancelled';
