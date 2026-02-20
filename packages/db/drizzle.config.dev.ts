import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "drizzle-kit";

// Find the latest local D1 database created by Alchemy/miniflare
const findLocalD1Database = (): string => {
	const d1Dir = path.resolve(
		__dirname,
		"../../.alchemy/miniflare/v3/d1/miniflare-D1DatabaseObject"
	);

	if (!existsSync(d1Dir)) {
		throw new Error(
			`Local D1 database directory not found: ${d1Dir}\n` +
				"Run 'bun run dev' first to create the local database."
		);
	}

	const files = readdirSync(d1Dir)
		.filter(
			(f) => f.endsWith(".sqlite") && !f.includes("-shm") && !f.includes("-wal")
		)
		.map((f) => ({
			name: f,
			path: path.join(d1Dir, f),
			mtime: statSync(path.join(d1Dir, f)).mtime,
		}))
		.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

	const latestDb = files[0];
	if (!latestDb) {
		throw new Error(
			"No local D1 database found.\n" +
				"Run 'bun run dev' first to create the local database."
		);
	}

	console.log(`Using local database: ${latestDb.name}`);
	return latestDb.path;
};

export default defineConfig({
	schema: "./src/schema/index.ts",
	out: "./src/migrations",
	dialect: "sqlite",
	dbCredentials: {
		url: findLocalD1Database(),
	},
});
