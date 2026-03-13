import { instrumentDrizzle } from "@kubiks/otel-drizzle";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { relations } from "./relations";

const databaseUrl =
	process.env.DATABASE_URL ??
	"postgresql://postgres:postgres@localhost:5432/myapp";

const pool = new Pool({ connectionString: databaseUrl });

// Instrument the pool so every SQL query gets a drizzle.* span.
// Uses @opentelemetry/api's no-op tracer when no SDK is registered (tests, scripts).
instrumentDrizzle(pool, { dbSystem: "postgresql" });

export const db = drizzle({ client: pool, relations });
