#!/usr/bin/env node

import pg from "pg";

const { Client } = pg;

const DEFAULT_DATABASE_URL =
	"postgresql://postgres:postgres@localhost:5432/myapp";

const connectionString = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;

/**
 * Full schema reset: drops all tables, type definitions, functions, and
 * sequences in the public schema so migrations can be re-applied from scratch.
 * Uses DROP/CREATE SCHEMA for a clean, atomic wipe — avoids partial drops that
 * leave behind stale enum types.
 */
const main = async () => {
	const client = new Client({ connectionString });
	await client.connect();

	try {
		await client.query("DROP SCHEMA IF EXISTS public CASCADE");
		await client.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
		await client.query("CREATE SCHEMA public");
		await client.query("GRANT ALL ON SCHEMA public TO postgres");
		await client.query("GRANT ALL ON SCHEMA public TO public");
		console.log("Public and drizzle schemas wiped and recreated.");
		console.log("Run `bun run db:migrate` to apply the baseline migration.");
	} finally {
		await client.end();
	}
};

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
