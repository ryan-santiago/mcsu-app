import type { Permission, Principal } from "@/lib/rbac";
import { canAny } from "@/lib/rbac";

/**
 * Icon *names*, not component references.
 *
 * `visibleNavigation()` runs in the server layout and its result is passed as
 * a prop into client components (the sidebar, the topbar). A React component
 * reference isn't serializable across that boundary — Next.js rejects it at
 * runtime. Resolve the name to a component only on the client, in
 * `NAV_ICONS` (`sidebar-nav.tsx`).
 */
export type NavIconKey = "dashboard" | "users" | "audit";

export type NavItem = {
  title: string;
  href: string;
  icon: NavIconKey;
  /** Item is hidden unless the user holds at least one of these. */
  permissions?: readonly Permission[];
  /** Match child routes too, e.g. /admin/users/123 highlights User Management. */
  matchNested?: boolean;
};

export type NavGroup = {
  /** `null` renders the group without a heading — used for the top-level items. */
  title: string | null;
  items: readonly NavItem[];
};

/**
 * The single source of truth for the sidebar. Adding a section means adding an
 * entry here; permissions are declared alongside the link so a nav item can
 * never drift from the page guard it points at.
 */
export const NAVIGATION: readonly NavGroup[] = [
  {
    title: null,
    items: [
      {
        title: "Dashboard",
        href: "/dashboard",
        icon: "dashboard",
        permissions: ["dashboard:view"],
      },
    ],
  },
  {
    title: "Administration",
    items: [
      {
        title: "User Management",
        href: "/admin/users",
        icon: "users",
        permissions: ["users:read"],
        matchNested: true,
      },
      {
        title: "Audit Trail",
        href: "/admin/audit",
        icon: "audit",
        permissions: ["audit:read"],
        matchNested: true,
      },
    ],
  },
];

/** Drops items the user cannot reach, then drops groups left empty. */
export function visibleNavigation(principal: Principal | null): NavGroup[] {
  return NAVIGATION.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => !item.permissions || canAny(principal, item.permissions),
    ),
  })).filter((group) => group.items.length > 0);
}

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (pathname === item.href) return true;
  return Boolean(item.matchNested) && pathname.startsWith(`${item.href}/`);
}

/** Breadcrumb/title lookup for the topbar. */
export function findNavItem(pathname: string): NavItem | undefined {
  return NAVIGATION.flatMap((group) => group.items).find((item) =>
    isNavItemActive(item, pathname),
  );
}
