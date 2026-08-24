import "server-only";

import { can } from "@/lib/rbac";
import type { CurrentUser } from "@/lib/session";
import { listVisibleOneLotProjects } from "@/server/one-lot-projects/queries";
import { listStaffAugmentationEngagements } from "@/server/staff-augmentation/queries";

export type EngagementNavChild = { label: string; href: string };

export type EngagementNavItem = {
  id: string;
  label: string;
  href: string;
  /** Only set for One-Lot projects — the fixed Dashboard/List/Kanban/Calendar pages. */
  children?: EngagementNavChild[];
};

export type EngagementNavGroupData = {
  items: EngagementNavItem[];
  canCreate: boolean;
  addHref: string;
  addLabel: string;
};

export type EngagementNavKind = "staff-augmentation" | "one-lot-projects";

export type EngagementNavData = Partial<Record<EngagementNavKind, EngagementNavGroupData>>;

/**
 * Composes the sidebar's dynamic Engagement data.
 *
 * Staff Augmentation: checking `can()` before querying (rather than letting
 * `authorize()` throw) avoids a DB round trip for the majority of users who
 * hold neither permission — the query functions still call `authorize()`
 * internally too, same defense-in-depth as every other module.
 *
 * One-Lot Projects: unlike Staff Augmentation, this module grants access two
 * ways — the `one_lot_projects:read` permission (monitor every project) or
 * project membership (see just your own) — so the query always runs;
 * `listVisibleOneLotProjects()` itself returns every project for a
 * permission-holder, just the member's own for everyone else, and an empty
 * list for a user with neither. The nav item and the `/one-lot-projects`
 * list page (see its own guard) both key off "is this list non-empty, or
 * does the user hold the permission anyway" to decide whether the module is
 * reachable at all.
 */
export async function getEngagementNavData(user: CurrentUser): Promise<EngagementNavData> {
  const data: EngagementNavData = {};

  if (can(user, "staff_augmentation:read")) {
    const rows = await listStaffAugmentationEngagements();
    data["staff-augmentation"] = {
      items: rows.map((row) => ({ id: row.id, label: row.name, href: `/staff-augmentation/${row.id}` })),
      canCreate: can(user, "staff_augmentation:write"),
      addHref: "/staff-augmentation/new",
      addLabel: "Add engagement",
    };
  }

  const oneLotProjects = await listVisibleOneLotProjects(user);
  if (can(user, "one_lot_projects:read") || oneLotProjects.length > 0) {
    data["one-lot-projects"] = {
      items: oneLotProjects.map((row) => ({
        id: row.id,
        label: row.name,
        href: `/one-lot-projects/${row.id}/dashboard`,
        children: [
          { label: "Summary", href: `/one-lot-projects/${row.id}/dashboard` },
          { label: "Backlog", href: `/one-lot-projects/${row.id}/list` },
          { label: "Kanban Board", href: `/one-lot-projects/${row.id}/kanban` },
          { label: "Calendar", href: `/one-lot-projects/${row.id}/calendar` },
        ],
      })),
      canCreate: can(user, "one_lot_projects:write"),
      addHref: "/one-lot-projects/new",
      addLabel: "Add project",
    };
  }

  return data;
}
