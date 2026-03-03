#!/usr/bin/env node

import pg from "pg";

const { Client } = pg;

const DEFAULT_DATABASE_URL =
	"postgresql://postgres:postgres@localhost:5432/myapp";

const connectionString = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;

const main = async () => {
	const client = new Client({ connectionString });
	await client.connect();

	try {
		// Drop all tables in the public schema (cascade handles FK dependencies)
		const { rows } = await client.query(
			`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
		);

		if (rows.length === 0) {
			console.log("No tables to drop.");
			return;
		}

		const tableNames = rows.map((r) => `"${r.tablename}"`).join(", ");
		await client.query(`DROP TABLE IF EXISTS ${tableNames} CASCADE`);
		console.log(`Dropped ${rows.length} tables from public schema.`);
		console.log(
			"Run `bun run db:push` or `bun run db:migrate` to recreate the schema."
		);
	} finally {
		await client.end();
	}
};

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
