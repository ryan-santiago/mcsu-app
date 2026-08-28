import type { Permission, Principal } from '@/lib/rbac'
import { canAny } from '@/lib/rbac'

/**
 * Icon *names*, not component references.
 *
 * `visibleNavigation()` runs in the server layout and its result is passed as
 * a prop into client components (the sidebar, the topbar). A React component
 * reference isn't serializable across that boundary — Next.js rejects it at
 * runtime. Resolve the name to a component only on the client, in
 * `NAV_ICONS` (`sidebar-nav.tsx`).
 */
export type NavIconKey =
	| 'dashboard'
	| 'announcements'
	| 'users'
	| 'audit'
	| 'employees'
	| 'projects'
	| 'employee-recommendations'
	| 'talent-acquisition'
	| 'activity-report'
	| 'maintenance'
	| 'devices'
	| 'access-control'
	| 'approvals'
	| 'settings'
	| 'staff-augmentation'
	| 'one-lot-projects'

/**
 * A known sub-route of a nav item, for the topbar breadcrumb trail —
 * e.g. `/employees/new` under the "Employees" item. Plain data, not a
 * predicate function: `visibleNavigation()`'s result is passed as a prop
 * from the server layout into client components, and a function isn't
 * serializable across that boundary — the same reason `icon` above is a
 * name, not a component reference.
 *
 * Exactly one of `path` (an exact sub-route, e.g. "/employees/new") or
 * `dynamic` (any other single path segment beyond the item's `href`, e.g.
 * "/employees/[id]") should be set. Static labels only — nothing here
 * depends on data a page fetches, which is also why the Employee detail
 * page's breadcrumb stays generic rather than showing the employee's name.
 */
export type NavBreadcrumbChild = {
	title: string
	path?: string
	dynamic?: boolean
}

export type NavItem = {
	title: string
	href: string
	icon: NavIconKey
	/** Item is hidden unless the user holds at least one of these. */
	permissions?: readonly Permission[]
	/** Match child routes too, e.g. /admin/users/123 highlights User Management. */
	matchNested?: boolean
	/**
	 * Sub-paths `matchNested` should NOT claim — for a sibling static route
	 * nested under the same href prefix as this item's own dynamic routes,
	 * e.g. `/talent-acquisition/candidates` sits under `/talent-acquisition`
	 * but has its own nav item and must not also highlight "Requests".
	 */
	excludeNestedPrefixes?: readonly string[]
	/** Known sub-routes, deepest match wins — see `breadcrumbsFor()`. */
	children?: readonly NavBreadcrumbChild[]
	/**
	 * Set only on items whose sidebar sub-tree is DB-driven rather than
	 * static — the actual item list is fetched server-side per request
	 * (`getEngagementNavData()` in `src/server/engagement/nav.ts`) and passed
	 * to `SidebarNav` as a separate prop, since this module has no DB access.
	 */
	dynamicKind?: 'staff-augmentation' | 'one-lot-projects'
}

export type NavGroup = {
	/** `null` renders the group without a heading — used for the top-level items. */
	title: string | null
	items: readonly NavItem[]
}

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
				title: 'Dashboard',
				href: '/dashboard',
				icon: 'dashboard',
				permissions: ['dashboard:read'],
			},
			{
				title: 'Announcements',
				href: '/announcements',
				icon: 'announcements',
				permissions: ['announcements:read'],
			},
		],
	},
	{
		title: 'Workforce',
		items: [
			{
				title: 'Dashboard',
				href: '/workforce-dashboard',
				icon: 'dashboard',
				permissions: ['employees:read', 'projects:read', 'employee_recommendations:read'],
				matchNested: true,
			},
			{
				title: 'Employees',
				href: '/employees',
				icon: 'employees',
				permissions: ['employees:read'],
				matchNested: true,
				children: [
					{ title: 'Add employee', path: '/employees/new' },
					{ title: 'View / Edit Employee', dynamic: true },
				],
			},
			{
				title: 'Projects',
				href: '/projects',
				icon: 'projects',
				permissions: ['projects:read'],
				matchNested: true,
				children: [
					{ title: 'Add project', path: '/projects/new' },
					{ title: 'View / Edit Project', dynamic: true },
				],
			},
			{
				title: 'Employee Recommendation',
				href: '/employee-recommendations',
				icon: 'employee-recommendations',
				permissions: ['employee_recommendations:read'],
				matchNested: true,
			},
		],
	},
	{
		title: 'Talent Acquisition',
		items: [
			{
				title: 'Requests',
				href: '/talent-acquisition',
				icon: 'talent-acquisition',
				permissions: ['talent_acquisition:read'],
				matchNested: true,
				excludeNestedPrefixes: ['/talent-acquisition/candidates'],
				children: [
					{ title: 'New request', path: '/talent-acquisition/new' },
					{ title: 'View request', dynamic: true },
				],
			},
			{
				title: 'Candidates',
				href: '/talent-acquisition/candidates',
				icon: 'users',
				permissions: ['talent_acquisition:read'],
				matchNested: true,
				children: [{ title: 'Candidate profile', dynamic: true }],
			},
		],
	},
	{
		title: 'Engagement',
		items: [
			{
				title: 'Staff Augmentation',
				href: '/staff-augmentation',
				icon: 'staff-augmentation',
				permissions: ['staff_augmentation:read'],
				matchNested: true,
				dynamicKind: 'staff-augmentation',
				children: [
					{ title: 'Add engagement', path: '/staff-augmentation/new' },
					{ title: 'View engagement', dynamic: true },
				],
			},
			{
				title: 'One-Lot Project',
				href: '/one-lot-projects',
				icon: 'one-lot-projects',
				// No static `permissions` — unlike every other gated item, this one is
				// reachable via project membership as well as `one_lot_projects:read`,
				// which `visibleNavigation()` can't see (no DB access). Actual
				// visibility is decided in the app layout by whether
				// `getEngagementNavData()` populated a `one-lot-projects` entry.
				matchNested: true,
				dynamicKind: 'one-lot-projects',
				children: [{ title: 'Add project', path: '/one-lot-projects/new' }],
			},
		],
	},
	{
		title: 'Productivity',
		items: [
			{
				title: 'Activity Report',
				href: '/activity-reports',
				icon: 'activity-report',
				// No `permissions` — every active signed-in user reaches their own
				// reports, same as Settings & Profile's nav item.
				matchNested: true,
				children: [
					{ title: 'Add report', path: '/activity-reports/new' },
					{ title: 'View / Edit Report', dynamic: true },
				],
			},
		],
	},
	{
		title: 'Administration',
		items: [
			{
				title: 'Maintenance',
				href: '/admin/maintenance',
				icon: 'maintenance',
				permissions: ['maintenance:read'],
				matchNested: true,
			},
			{
				title: 'Device Inventory',
				href: '/admin/devices',
				icon: 'devices',
				permissions: ['devices:read'],
				matchNested: true,
				children: [
					{ title: 'Add device', path: '/admin/devices/new' },
					{ title: 'View / Edit Device', dynamic: true },
				],
			},
			{
				title: 'Access Control',
				href: '/admin/access-control',
				icon: 'access-control',
				permissions: ['access_control:read'],
				matchNested: true,
			},
			{
				title: 'User Management',
				href: '/admin/users',
				icon: 'users',
				permissions: ['users:read'],
				matchNested: true,
			},
			{
				title: 'Audit Trail',
				href: '/admin/audit',
				icon: 'audit',
				permissions: ['audit:read'],
				matchNested: true,
			},
			{
				// Either permission is enough — a Unit Manager/Department Head who
				// only holds `employee_recommendations:approve` (not `employees:edit`)
				// still has real work waiting on this page's Employee Recommendation
				// section, even though the Change Requests section stays hidden for them.
				title: 'Approvals',
				href: '/admin/approvals',
				icon: 'approvals',
				permissions: ['employees:edit', 'employee_recommendations:approve'],
				matchNested: true,
			},
			{
				// No `permissions` — every active signed-in user reaches their own profile.
				title: 'Settings & Profile',
				href: '/admin/settings',
				icon: 'settings',
				matchNested: true,
			},
		],
	},
]

/** Drops items the user cannot reach, then drops groups left empty. */
export function visibleNavigation(principal: Principal | null): NavGroup[] {
	return NAVIGATION.map((group) => ({
		...group,
		items: group.items.filter(
			(item) => !item.permissions || canAny(principal, item.permissions),
		),
	})).filter((group) => group.items.length > 0)
}

export function isNavItemActive(item: NavItem, pathname: string): boolean {
	if (pathname === item.href) return true
	if (!item.matchNested || !pathname.startsWith(`${item.href}/`)) return false
	return !item.excludeNestedPrefixes?.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
	)
}

/** Breadcrumb/title lookup for the topbar. */
export function findNavItem(pathname: string): NavItem | undefined {
	return NAVIGATION.flatMap((group) => group.items).find((item) =>
		isNavItemActive(item, pathname),
	)
}

export type Breadcrumb = { title: string; href?: string }

/**
 * The topbar's breadcrumb trail for a pathname — one crumb for the section
 * itself (e.g. "Employees"), plus one more if it matches a known child route
 * (e.g. "Add employee"). Sections with no matching child, or no `children`
 * at all, render as a single crumb, same as before breadcrumbs existed.
 *
 * Adding a nested route to any future module is just a `children` entry on
 * its `NavItem` — nothing else in the topbar needs to change.
 */
export function breadcrumbsFor(pathname: string): Breadcrumb[] {
	const item = findNavItem(pathname)
	if (!item) return []

	const children = item.children ?? []
	const exact = children.find((candidate) => candidate.path === pathname)

	// A `dynamic` child matches any single segment beyond the item's own href
	// that no sibling already claims exactly — e.g. "/employees/abc123", but
	// not "/employees/new" once that has its own exact `path` entry.
	const remainder = pathname.slice(item.href.length).replace(/^\//, '')
	const isSingleSegment = remainder.length > 0 && !remainder.includes('/')
	const dynamic = isSingleSegment
		? children.find((candidate) => candidate.dynamic)
		: undefined

	const child = exact ?? dynamic
	if (!child) return [{ title: item.title }]

	return [{ title: item.title, href: item.href }, { title: child.title }]
}
