import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import pg from "pg";
import { E2E_DEFAULT_ANCHOR_DATE } from "./baseline";
import {
	assertSafeE2EDatabaseUrl,
	ensureDatabaseExists,
	maskConnectionString,
	resolveAdminDatabaseUrl,
	resolvePlaywrightDatabaseUrl,
	waitForDatabase,
} from "./database";
import { seedE2EBaseline } from "./seed";

const { Client } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPackageRoot = path.resolve(__dirname, "../..");

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
				"Usage: bun ./src/e2e/bootstrap.ts [options]",
				"",
				"Options:",
				`  --anchor-date <YYYY-MM-DD>  Stable UTC anchor date (default: ${E2E_DEFAULT_ANCHOR_DATE})`,
				"  --database-url <url>        PostgreSQL connection string (default: PLAYWRIGHT_DATABASE_URL or derived *_e2e DB)",
				"  -h, --help                  Show this help message",
			].join("\n")
		);
		process.exit(0);
	}

	return {
		anchorDate: values["anchor-date"],
		databaseUrl: values["database-url"] ?? null,
	};
};

const resetAndMigrateSchema = async (connectionString: string) => {
	const client = new Client({ connectionString });
	await client.connect();
	try {
		await client.query("DROP SCHEMA public CASCADE");
		await client.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
		await client.query("CREATE SCHEMA public");
		await client.query("GRANT ALL ON SCHEMA public TO postgres");
		await client.query("GRANT ALL ON SCHEMA public TO public");
	} finally {
		await client.end();
	}

	try {
		execFileSync(
			"bunx",
			["drizzle-kit", "migrate", "--config", "drizzle.config.dev.ts"],
			{
				cwd: dbPackageRoot,
				stdio: "inherit",
				env: { ...process.env, DATABASE_URL: connectionString },
			}
		);
	} catch (error) {
		const fallback = path.resolve(
			dbPackageRoot,
			"../../node_modules/.bin/drizzle-kit"
		);
		if (!existsSync(fallback)) {
			throw error;
		}

		execFileSync(fallback, ["migrate", "--config", "drizzle.config.dev.ts"], {
			cwd: dbPackageRoot,
			stdio: "inherit",
			env: { ...process.env, DATABASE_URL: connectionString },
		});
	}
};

export const bootstrapLocalE2EDatabase = async ({
	anchorDate,
	databaseUrl,
}: {
	anchorDate?: string;
	databaseUrl?: string;
} = {}) => {
	const resolvedAnchorDate =
		anchorDate ??
		process.env.PLAYWRIGHT_SEED_ANCHOR_DATE ??
		E2E_DEFAULT_ANCHOR_DATE;
	const connectionString = assertSafeE2EDatabaseUrl(
		databaseUrl ?? resolvePlaywrightDatabaseUrl(process.env),
		process.env
	);

	await waitForDatabase({
		connectionString: resolveAdminDatabaseUrl(connectionString),
	});
	await ensureDatabaseExists({ connectionString });
	await waitForDatabase({ connectionString });
	await resetAndMigrateSchema(connectionString);
	await seedE2EBaseline({
		anchorDate: resolvedAnchorDate,
		connectionString,
	});
};

const main = async () => {
	const options = parseCliArgs();
	const connectionString = assertSafeE2EDatabaseUrl(
		options.databaseUrl ?? resolvePlaywrightDatabaseUrl(process.env),
		process.env
	);

	await bootstrapLocalE2EDatabase({
		anchorDate: options.anchorDate,
		databaseUrl: connectionString,
	});

	console.log(
		`Bootstrapped local E2E database: ${maskConnectionString(connectionString)}`
	);
};

if (import.meta.main) {
	main().catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
}
