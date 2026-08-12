/**
 * Seeds the default roles, the first administrator, and optionally a set of
 * demo users.
 *
 * The app can bootstrap itself — the first account to register through the UI
 * becomes an active admin — so this script exists for two other cases: creating
 * the admin non-interactively (CI, a fresh preview database), and populating
 * User Management with realistic rows to work against.
 *
 *   npm run db:seed                       # roles + admin only, from env vars
 *   npm run db:seed -- --with-demo-users  # plus a spread of demo accounts
 *
 * Reads SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD / SEED_ADMIN_NAME, falling back
 * to the values below. Re-running is safe: existing emails/roles are left
 * untouched.
 */
import { config } from 'dotenv'
import type { eq as eqType } from 'drizzle-orm'

import type {
	account as accountTable,
	engagementType as engagementTypeTable,
	gender as genderTable,
	role as roleTable,
	user as userTable,
	UserStatus,
} from '../src/db/schema'
import type { auth as authClient } from '../src/lib/auth'
import type { db as dbClient } from '../src/db'
import type { Permission } from '../src/lib/rbac'

// `import` declarations are hoisted above all other top-level code, even in
// scripts transpiled to CJS — so a static `import { db } from "../src/db"`
// would resolve (and construct the Neon client from `env.DATABASE_URL`)
// before these `config()` calls ever ran. Loading env vars first, then
// dynamically importing everything that reads them inside `main()`, is what
// makes the load order actually match the source order.
config({ path: '.env.local', quiet: true })
config({ path: '.env', quiet: true })

let eq: typeof eqType
let db: typeof dbClient
let user: typeof userTable
let account: typeof accountTable
let gender: typeof genderTable
let engagementType: typeof engagementTypeTable
let role: typeof roleTable
let auth: typeof authClient

const ADMIN = {
	email: (
		process.env.SEED_ADMIN_EMAIL ?? 'mcsu_automations@questronix.com.ph'
	).toLowerCase(),
	password: process.env.SEED_ADMIN_PASSWORD ?? 'admin12345',
	name: process.env.SEED_ADMIN_NAME ?? 'MCSU Administrator',
}

const DEMO_USERS: Array<{
	name: string
	email: string
	role: string
	status: UserStatus
}> = [
	{
		name: 'Ryan Santiago',
		email: 'ryan_santiago@questronix.com.ph',
		role: 'manager',
		status: 'active',
	},
	{
		name: 'Jenny Rose Galvez',
		email: 'jenny.rose_galvez@questronix.com.ph',
		role: 'engineer',
		status: 'active',
	},
	{
		name: 'Richard Dayag',
		email: 'richard_dayag@questronix.com.ph',
		role: 'engineer',
		status: 'active',
	},
	{
		name: 'John Louie Cleofas',
		email: 'john.louie_cleofas@questronix.com.ph',
		role: 'engineer',
		status: 'active',
	},
	{
		name: 'Margarita Ladera',
		email: 'margarita_ladera@questronix.com.ph',
		role: 'viewer',
		status: 'pending',
	},
	{
		name: 'Mawi Julino Mendoza',
		email: 'mawi.julino_mendoza@questronix.com.ph',
		role: 'viewer',
		status: 'suspended',
	},
]

const DEMO_PASSWORD = 'testpassword1234'

const ALL_MODULES = [
	'dashboard',
	'users',
	'employees',
	'projects',
	'maintenance',
	'audit',
	'settings',
	'access_control',
] as const
const ALL_ACTIONS = ['read', 'write', 'edit', 'delete'] as const

function permissionsFor(modules: readonly (typeof ALL_MODULES)[number][]): Permission[] {
	return modules.flatMap((module) =>
		ALL_ACTIONS.map((action) => `${module}:${action}` as Permission),
	)
}

/**
 * The four roles this app has always shipped with, translated into the
 * dynamic permission matrix — see docs/RBAC.md. Administrator and Manager are
 * `isSystem` (cannot be deleted); Administrator's permissions are additionally
 * locked in `src/server/roles/actions.ts` regardless of what's seeded here.
 */
const DEFAULT_ROLES: Array<{
	id: string
	label: string
	description: string
	rank: number
	isSystem: boolean
	permissions: Permission[]
}> = [
	{
		id: 'admin',
		label: 'Administrator',
		description: 'Full control of the workspace, including roles and settings.',
		rank: 40,
		isSystem: true,
		permissions: permissionsFor(ALL_MODULES),
	},
	{
		id: 'manager',
		label: 'Manager',
		description: 'Oversees the unit — approves and manages access.',
		rank: 30,
		isSystem: true,
		permissions: [
			...permissionsFor(['dashboard', 'employees', 'projects']),
			'users:read',
			'users:edit',
			'maintenance:read',
			'audit:read',
			'settings:read',
			'access_control:read',
		] as Permission[],
	},
	{
		id: 'engineer',
		label: 'Engineer',
		description: 'Delivers services day to day.',
		rank: 20,
		isSystem: false,
		permissions: ['dashboard:read'] as Permission[],
	},
	{
		id: 'viewer',
		label: 'Viewer',
		description: 'Read-only access to dashboards.',
		rank: 10,
		isSystem: false,
		permissions: ['dashboard:read'] as Permission[],
	},
]

/**
 * Gender is Maintenance-managed (Administration → Maintenance), but the
 * Employee form needs at least these three to be usable out of the box —
 * Client/Position/Level/Team intentionally start empty and are populated
 * through that screen instead.
 */
const DEFAULT_GENDERS = ['Male', 'Female', 'Others']

/** The three engagement types the Projects module ships with — everything else in Maintenance starts empty. */
const DEFAULT_ENGAGEMENT_TYPES = ['One-Lot Project', 'Staff Augmentation', 'Managed Services']

async function seedRoles() {
	for (const entry of DEFAULT_ROLES) {
		const [existing] = await db
			.select({ id: role.id })
			.from(role)
			.where(eq(role.id, entry.id))
			.limit(1)
		if (existing) {
			console.log(`  · ${entry.label} already exists — skipped`)
			continue
		}
		await db.insert(role).values(entry)
		console.log(`  ✓ ${entry.label}`)
	}
}

async function seedGenders() {
	for (const name of DEFAULT_GENDERS) {
		const [existing] = await db
			.select({ id: gender.id })
			.from(gender)
			.where(eq(gender.name, name))
			.limit(1)
		if (existing) {
			console.log(`  · ${name} already exists — skipped`)
			continue
		}
		await db.insert(gender).values({ id: crypto.randomUUID(), name })
		console.log(`  ✓ ${name}`)
	}
}

async function seedEngagementTypes() {
	for (const name of DEFAULT_ENGAGEMENT_TYPES) {
		const [existing] = await db
			.select({ id: engagementType.id })
			.from(engagementType)
			.where(eq(engagementType.name, name))
			.limit(1)
		if (existing) {
			console.log(`  · ${name} already exists — skipped`)
			continue
		}
		await db.insert(engagementType).values({ id: crypto.randomUUID(), name })
		console.log(`  ✓ ${name}`)
	}
}

async function findByEmail(email: string) {
	const [existing] = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, email))
		.limit(1)
	return existing ?? null
}

/**
 * Creates the credential account through BetterAuth rather than inserting a
 * password hash directly — that way the stored hash always matches whatever
 * algorithm the running version of BetterAuth expects.
 */
async function createUser(input: {
	name: string
	email: string
	password: string
	role: string
	status: UserStatus
}) {
	const existing = await findByEmail(input.email)
	if (existing) {
		console.log(`  · ${input.email} already exists — skipped`)
		return
	}

	await auth.api.signUpEmail({
		body: {
			name: input.name,
			email: input.email,
			password: input.password,
		},
	})

	// signUpEmail applies the pending-by-default policy (and the first-user
	// bootstrap). Force the seeded role and status afterwards.
	await db
		.update(user)
		.set({
			roleId: input.role,
			status: input.status,
			approvedAt: input.status === 'active' ? new Date() : null,
		})
		.where(eq(user.email, input.email))

	console.log(`  ✓ ${input.email}  (${input.role}, ${input.status})`)
}

async function main() {
	;({ eq } = await import('drizzle-orm'))
	;({ db } = await import('../src/db'))
	;({ account, user, gender, engagementType, role } = await import('../src/db/schema'))
	;({ auth } = await import('../src/lib/auth'))

	const withDemo = process.argv.includes('--with-demo-users')

	console.log('\nSeeding MCSU console\n')

	console.log('Roles:')
	await seedRoles()

	console.log('\nAdministrator:')
	await createUser({ ...ADMIN, role: 'admin', status: 'active' })

	console.log('\nGenders:')
	await seedGenders()

	console.log('\nEngagement types:')
	await seedEngagementTypes()

	if (withDemo) {
		console.log('\nDemo users:')
		for (const demo of DEMO_USERS) {
			await createUser({ ...demo, password: DEMO_PASSWORD })
		}
		console.log(`\n  Demo accounts share the password: ${DEMO_PASSWORD}`)
	}

	const [{ id: adminId } = { id: null }] = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, ADMIN.email))
		.limit(1)

	if (adminId) {
		const [credential] = await db
			.select({ id: account.id })
			.from(account)
			.where(eq(account.userId, adminId))
			.limit(1)

		if (!credential) {
			console.warn(
				'\n⚠ The admin has no credential account — sign-in will fail.',
			)
		}
	}

	console.log('\nDone.')
	console.log(`Sign in at /login as ${ADMIN.email}`)
	if (!process.env.SEED_ADMIN_PASSWORD) {
		console.log(
			`Password: ${ADMIN.password}  ← change this after first sign-in\n`,
		)
	}
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error('\nSeed failed:', error)
		process.exit(1)
	})
