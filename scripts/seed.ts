/**
 * Seeds the first administrator, and optionally a set of demo users.
 *
 * The app can bootstrap itself — the first account to register through the UI
 * becomes an active admin — so this script exists for two other cases: creating
 * the admin non-interactively (CI, a fresh preview database), and populating
 * User Management with realistic rows to work against.
 *
 *   npm run db:seed                       # admin only, from env vars
 *   npm run db:seed -- --with-demo-users  # plus a spread of demo accounts
 *
 * Reads SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD / SEED_ADMIN_NAME, falling back
 * to the values below. Re-running is safe: existing emails are left untouched.
 */
import { config } from 'dotenv'
import type { eq as eqType } from 'drizzle-orm'

import type {
	account as accountTable,
	user as userTable,
	UserRole,
	UserStatus,
} from '../src/db/schema'
import type { auth as authClient } from '../src/lib/auth'
import type { db as dbClient } from '../src/db'

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
let auth: typeof authClient

const ADMIN = {
	email: (
		process.env.SEED_ADMIN_EMAIL ?? 'mcsu_automations@questronix.com.ph'
	).toLowerCase(),
	password: process.env.SEED_ADMIN_PASSWORD ?? 'admin12345',
	name: process.env.SEED_ADMIN_NAME ?? 'MCSU Administrator',
	jobTitle: 'Unit Head',
}

const DEMO_USERS: Array<{
	name: string
	email: string
	jobTitle: string
	role: UserRole
	status: UserStatus
}> = [
	{
		name: 'Ryan Santiago',
		email: 'ryan_santiago@questronix.com.ph',
		jobTitle: 'Service Delivery Manager',
		role: 'manager',
		status: 'active',
	},
	{
		name: 'Jenny Rose Galvez',
		email: 'jenny.rose_galvez@questronix.com.ph',
		jobTitle: 'Software Developer',
		role: 'engineer',
		status: 'active',
	},
	{
		name: 'Richard Dayag',
		email: 'richard_dayag@questronix.com.ph',
		jobTitle: 'Software Developer',
		role: 'engineer',
		status: 'active',
	},
	{
		name: 'John Louie Cleofas',
		email: 'john.louie_cleofas@questronix.com.ph',
		jobTitle: 'AI Engineer',
		role: 'engineer',
		status: 'active',
	},
	{
		name: 'Margarita Ladera',
		email: 'margarita_ladera@questronix.com.ph',
		jobTitle: 'NOC Analyst',
		role: 'viewer',
		status: 'pending',
	},
	{
		name: 'Mawi Julino Mendoza',
		email: 'mawi.julino_mendoza@questronix.com.ph',
		jobTitle: 'Application Support',
		role: 'viewer',
		status: 'suspended',
	},
]

const DEMO_PASSWORD = 'testpassword1234'

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
	jobTitle: string
	role: UserRole
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
			jobTitle: input.jobTitle,
		},
	})

	// signUpEmail applies the pending-by-default policy (and the first-user
	// bootstrap). Force the seeded role and status afterwards.
	await db
		.update(user)
		.set({
			role: input.role,
			status: input.status,
			approvedAt: input.status === 'active' ? new Date() : null,
		})
		.where(eq(user.email, input.email))

	console.log(`  ✓ ${input.email}  (${input.role}, ${input.status})`)
}

async function main() {
	;({ eq } = await import('drizzle-orm'))
	;({ db } = await import('../src/db'))
	;({ account, user } = await import('../src/db/schema'))
	;({ auth } = await import('../src/lib/auth'))

	const withDemo = process.argv.includes('--with-demo-users')

	console.log('\nSeeding MCSU console\n')

	console.log('Administrator:')
	await createUser({ ...ADMIN, role: 'admin', status: 'active' })

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
