import process from "node:process";
import { parseArgs } from "node:util";
import { hashPassword } from "better-auth/crypto";
import pg from "pg";
import { E2E_BASELINE, E2E_DEFAULT_ANCHOR_DATE } from "./baseline";
import {
	assertSafeE2EDatabaseUrl,
	ensureDatabaseExists,
	maskConnectionString,
	resolvePlaywrightDatabaseUrl,
} from "./database";

const { Client } = pg;

const ANCHOR_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HOUR_MS = 60 * 60 * 1000;

const quote = (identifier: string) => `"${identifier}"`;

const parseCliArgs = () => {
	const { values } = parseArgs({
		options: {
			"anchor-date": { type: "string", default: E2E_DEFAULT_ANCHOR_DATE },
			"database-url": { type: "string" },
			help: { type: "boolean", short: "h" },
		},
		strict: true,
	});

	if (values.help) {
		console.log(
			[
				"Usage: bun ./src/e2e/seed.ts [options]",
				"",
				"Options:",
				`  --anchor-date <YYYY-MM-DD>  Stable UTC anchor date (default: ${E2E_DEFAULT_ANCHOR_DATE})`,
				"  --database-url <url>        PostgreSQL connection string (default: PLAYWRIGHT_DATABASE_URL or derived *_e2e DB)",
				"  -h, --help                  Show this help message",
			].join("\n"),
		);
		process.exit(0);
	}

	return {
		anchorDate: values["anchor-date"],
		databaseUrl: values["database-url"] ?? null,
	};
};

const parseAnchorDate = (value: string) => {
	if (!ANCHOR_DATE_RE.test(value)) {
		throw new Error("--anchor-date must use YYYY-MM-DD format");
	}

	const parsed = new Date(`${value}T00:00:00.000Z`);
	if (Number.isNaN(parsed.getTime())) {
		throw new Error("--anchor-date is not a valid date");
	}

	return parsed;
};

const upsert = async (
	client: pg.Client,
	table: string,
	conflictColumns: string[],
	row: Record<string, unknown>,
) => {
	const columns = Object.keys(row);
	const values = Object.values(row);
	const placeholders = columns.map((_, index) => `$${index + 1}`);
	const updateColumns = columns.filter(
		(column) => !conflictColumns.includes(column),
	);

	const sql = [
		`INSERT INTO ${quote(table)} (${columns.map(quote).join(", ")})`,
		`VALUES (${placeholders.join(", ")})`,
		`ON CONFLICT (${conflictColumns.map(quote).join(", ")})`,
		`DO UPDATE SET ${updateColumns.map((column) => `${quote(column)} = EXCLUDED.${quote(column)}`).join(", ")}`,
	].join(" ");

	await client.query(sql, values);
};

export const buildE2EBaseline = async (anchorDate: string) => {
	const anchorDateMs = parseAnchorDate(anchorDate).getTime();
	const now = new Date(anchorDateMs + 9 * HOUR_MS);
	const adminPasswordHash = await hashPassword(
		E2E_BASELINE.users.admin.password,
	);
	const operatorPasswordHash = await hashPassword(
		E2E_BASELINE.users.operator.password,
	);

	return {
		organizations: [
			{
				id: E2E_BASELINE.organizations.admin.id,
				name: E2E_BASELINE.organizations.admin.name,
				slug: E2E_BASELINE.organizations.admin.slug,
				logo: null,
				metadata: JSON.stringify({ baseline: "e2e" }),
				created_at: now,
			},
			{
				id: E2E_BASELINE.organizations.starter.id,
				name: E2E_BASELINE.organizations.starter.name,
				slug: E2E_BASELINE.organizations.starter.slug,
				logo: null,
				metadata: JSON.stringify({ baseline: "e2e" }),
				created_at: now,
			},
		],
		users: [
			{
				id: E2E_BASELINE.users.admin.id,
				name: E2E_BASELINE.users.admin.name,
				email: E2E_BASELINE.users.admin.email,
				email_verified: true,
				image: null,
				role: E2E_BASELINE.users.admin.role,
				created_at: now,
				updated_at: now,
			},
			{
				id: E2E_BASELINE.users.operator.id,
				name: E2E_BASELINE.users.operator.name,
				email: E2E_BASELINE.users.operator.email,
				email_verified: true,
				image: null,
				role: E2E_BASELINE.users.operator.role,
				created_at: now,
				updated_at: now,
			},
			{
				id: E2E_BASELINE.users.member.id,
				name: E2E_BASELINE.users.member.name,
				email: E2E_BASELINE.users.member.email,
				email_verified: true,
				image: null,
				role: E2E_BASELINE.users.member.role,
				created_at: now,
				updated_at: now,
			},
		],
		accounts: [
			{
				id: E2E_BASELINE.accounts.admin.id,
				account_id: E2E_BASELINE.users.admin.id,
				provider_id: E2E_BASELINE.accounts.admin.providerId,
				user_id: E2E_BASELINE.users.admin.id,
				password: adminPasswordHash,
				created_at: now,
				updated_at: now,
			},
			{
				id: E2E_BASELINE.accounts.operator.id,
				account_id: E2E_BASELINE.users.operator.id,
				provider_id: E2E_BASELINE.accounts.operator.providerId,
				user_id: E2E_BASELINE.users.operator.id,
				password: operatorPasswordHash,
				created_at: now,
				updated_at: now,
			},
		],
		members: [
			{
				id: E2E_BASELINE.memberships.adminOwner.id,
				organization_id: E2E_BASELINE.organizations.admin.id,
				user_id: E2E_BASELINE.users.admin.id,
				role: E2E_BASELINE.memberships.adminOwner.role,
				created_at: now,
			},
			{
				id: E2E_BASELINE.memberships.operatorManager.id,
				organization_id: E2E_BASELINE.organizations.starter.id,
				user_id: E2E_BASELINE.users.operator.id,
				role: E2E_BASELINE.memberships.operatorManager.role,
				created_at: now,
			},
			{
				id: E2E_BASELINE.memberships.memberMember.id,
				organization_id: E2E_BASELINE.organizations.starter.id,
				user_id: E2E_BASELINE.users.member.id,
				role: E2E_BASELINE.memberships.memberMember.role,
				created_at: now,
			},
		],
	};
};

const writeBaseline = async (
	client: pg.Client,
	baseline: Awaited<ReturnType<typeof buildE2EBaseline>>,
) => {
	for (const row of baseline.organizations) {
		await upsert(client, "organization", ["id"], row);
	}

	for (const row of baseline.users) {
		await upsert(client, "user", ["id"], row);
	}

	for (const row of baseline.accounts) {
		await upsert(client, "account", ["id"], row);
	}

	for (const row of baseline.members) {
		await upsert(client, "member", ["id"], row);
	}
};

export const seedE2EBaseline = async ({
	anchorDate,
	connectionString,
}: {
	anchorDate: string;
	connectionString: string;
}) => {
	const client = new Client({ connectionString });
	await client.connect();

	try {
		const baseline = await buildE2EBaseline(anchorDate);
		await client.query("BEGIN");
		try {
			await writeBaseline(client, baseline);
			await client.query("COMMIT");
		} catch (error) {
			await client.query("ROLLBACK");
			throw error;
		}
	} finally {
		await client.end();
	}
};

const main = async () => {
	const options = parseCliArgs();
	const connectionString = assertSafeE2EDatabaseUrl(
		options.databaseUrl ?? resolvePlaywrightDatabaseUrl(process.env),
		process.env,
	);

	await ensureDatabaseExists({ connectionString });
	await seedE2EBaseline({
		anchorDate: options.anchorDate,
		connectionString,
	});

	console.log(
		[
			`Seeded E2E baseline: ${maskConnectionString(connectionString)}`,
			`Anchor date: ${options.anchorDate}`,
			`Admin login: ${E2E_BASELINE.users.admin.email} / ${E2E_BASELINE.users.admin.password}`,
			`Operator login: ${E2E_BASELINE.users.operator.email} / ${E2E_BASELINE.users.operator.password}`,
		].join("\n"),
	);
};

if (import.meta.main) {
	main().catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
}
