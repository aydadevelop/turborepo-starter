import process from "node:process";
import { parseArgs } from "node:util";
import {
	assertSafeE2EDatabaseUrl,
	ensureDatabaseExists,
	maskConnectionString,
	resolveAdminDatabaseUrl,
	resolvePlaywrightDatabaseUrl,
	waitForDatabase,
} from "./database";

const parseCliArgs = () => {
	const { values } = parseArgs({
		options: {
			"database-url": { type: "string" },
			help: { type: "boolean", short: "h" },
		},
		strict: true,
	});

	if (values.help) {
		console.log(
			[
				"Usage: bun ./src/e2e/ensure-database.ts [options]",
				"",
				"Options:",
				"  --database-url <url>  PostgreSQL connection string (default: PLAYWRIGHT_DATABASE_URL or derived *_e2e DB)",
				"  -h, --help            Show this help message",
			].join("\n"),
		);
		process.exit(0);
	}

	return {
		databaseUrl: values["database-url"] ?? null,
	};
};

export const ensurePlaywrightDatabase = async ({
	databaseUrl,
}: {
	databaseUrl?: string;
} = {}) => {
	const connectionString = assertSafeE2EDatabaseUrl(
		databaseUrl ?? resolvePlaywrightDatabaseUrl(process.env),
		process.env,
	);

	await waitForDatabase({
		connectionString: resolveAdminDatabaseUrl(connectionString),
	});
	const created = await ensureDatabaseExists({ connectionString });
	return { connectionString, created };
};

const main = async () => {
	const options = parseCliArgs();
	const { connectionString, created } = await ensurePlaywrightDatabase({
		databaseUrl: options.databaseUrl ?? undefined,
	});

	console.log(
		`${created ? "Created" : "Using"} E2E database: ${maskConnectionString(connectionString)}`,
	);
};

if (import.meta.main) {
	main().catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
}
