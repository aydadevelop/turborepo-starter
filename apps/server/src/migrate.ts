import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const db = drizzle(
	process.env.DATABASE_URL ??
		"postgresql://postgres:postgres@localhost:5432/myapp",
);

console.log("Running DB migrations...");
await migrate(db, { migrationsFolder: "./migrations" });
console.log("Migrations complete.");
process.exit(0);
