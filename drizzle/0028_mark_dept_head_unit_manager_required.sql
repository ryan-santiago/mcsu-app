-- Marks Department Head and Unit Manager as `is_system` — the "Required"
-- badge in Access Control (src/components/roles/access-control-view.tsx) and
-- the non-deletable guard in deleteRole() (src/server/roles/actions.ts) both
-- key off this column. Same treatment as Manager: protected from deletion,
-- but permissions stay ordinary editable data — only the "admin" row is
-- additionally locked in updateRolePermissions(). See
-- docs/RBAC.md "Roles are data, not code".
UPDATE "role"
SET "is_system" = true
WHERE "id" IN ('department_head', 'unit_manager');
