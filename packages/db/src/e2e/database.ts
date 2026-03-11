import pg from "pg";
import {
	E2E_DEFAULT_DATABASE_URL,
	E2E_UNSAFE_ALLOW_SHARED_DB_ENV,
} from "./baseline";

const { Client } = pg;

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);
const LEADING_SLASHES_RE = /^\/+/;
const CONNECTION_CREDENTIALS_RE = /\/\/.*@/;

const getDatabaseName = (connectionString: string): string => {
	const parsed = new URL(connectionString);
	return decodeURIComponent(parsed.pathname.replace(LEADING_SLASHES_RE, ""));
};

const quoteIdentifier = (identifier: string) =>
	`"${identifier.replaceAll('"', '""')}"`;

export const maskConnectionString = (connectionString: string): string =>
	connectionString.replace(CONNECTION_CREDENTIALS_RE, "//***@");

export const deriveE2EDatabaseUrl = (connectionString: string): string => {
	const parsed = new URL(connectionString);
	const databaseName = getDatabaseName(connectionString) || "myapp";
	const e2eDatabaseName = databaseName.endsWith("_e2e")
		? databaseName
		: `${databaseName}_e2e`;

	parsed.pathname = `/${encodeURIComponent(e2eDatabaseName)}`;
	return parsed.toString();
};

export const resolvePlaywrightDatabaseUrl = (
	env: NodeJS.ProcessEnv = process.env
): string => {
	if (env.PLAYWRIGHT_DATABASE_URL) {
		return env.PLAYWRIGHT_DATABASE_URL;
	}

	if (env.DATABASE_URL) {
		return deriveE2EDatabaseUrl(env.DATABASE_URL);
	}

	return E2E_DEFAULT_DATABASE_URL;
};

export const isLikelySharedLocalDevDatabase = (
	connectionString: string
): boolean => {
	const parsed = new URL(connectionString);
	const port = parsed.port ? Number(parsed.port) : 5432;

	return (
		LOCAL_HOSTNAMES.has(parsed.hostname) &&
		port === 5432 &&
		getDatabaseName(connectionString) === "myapp"
	);
};

export const assertSafeE2EDatabaseUrl = (
	connectionString: string,
	env: NodeJS.ProcessEnv = process.env
): string => {
	if (env[E2E_UNSAFE_ALLOW_SHARED_DB_ENV] === "1") {
		return connectionString;
	}

	if (!isLikelySharedLocalDevDatabase(connectionString)) {
		return connectionString;
	}

	throw new Error(
		[
			`Refusing to run E2E bootstrap against the default dev database: ${maskConnectionString(connectionString)}`,
			`Set PLAYWRIGHT_DATABASE_URL to a dedicated database such as "${E2E_DEFAULT_DATABASE_URL}"`,
			`or explicitly override with ${E2E_UNSAFE_ALLOW_SHARED_DB_ENV}=1 if you really want to reuse the shared dev DB.`,
		].join("\n")
	);
};

export const resolveSafePlaywrightDatabaseUrl = (
	env: NodeJS.ProcessEnv = process.env
): string => assertSafeE2EDatabaseUrl(resolvePlaywrightDatabaseUrl(env), env);

export const resolveAdminDatabaseUrl = (connectionString: string): string => {
	const parsed = new URL(connectionString);
	parsed.pathname = "/postgres";
	return parsed.toString();
};

export const waitForDatabase = async ({
	connectionString,
	timeoutMs = 60_000,
	pollIntervalMs = 500,
}: {
	connectionString: string;
	pollIntervalMs?: number;
	timeoutMs?: number;
}): Promise<void> => {
	const startedAt = Date.now();

	while (Date.now() - startedAt < timeoutMs) {
		const client = new Client({ connectionString });
		try {
			await client.connect();
			await client.query("SELECT 1");
			await client.end();
			return;
		} catch {
			await client.end().catch(() => undefined);
			await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
		}
	}

	throw new Error(
		`Timed out waiting for PostgreSQL at ${maskConnectionString(connectionString)}`
	);
};

export const ensureDatabaseExists = async ({
	connectionString,
}: {
	connectionString: string;
}): Promise<boolean> => {
	const databaseName = getDatabaseName(connectionString);
	if (!databaseName) {
		throw new Error(
			`Cannot ensure database for connection string without database name: ${maskConnectionString(connectionString)}`
		);
	}

	const client = new Client({
		connectionString: resolveAdminDatabaseUrl(connectionString),
	});
	await client.connect();

	try {
		const existing = await client.query(
			"SELECT 1 FROM pg_database WHERE datname = $1",
			[databaseName]
		);
		if (existing.rowCount && existing.rowCount > 0) {
			return false;
		}

		await client.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
		return true;
	} finally {
		await client.end();
	}
};

export const getDatabaseNameFromUrl = getDatabaseName;
