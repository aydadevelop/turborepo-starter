import { drizzle } from "drizzle-orm/node-postgres";
import { relations } from "./relations";

const databaseUrl =
	process.env.DATABASE_URL ??
	"postgresql://postgres:postgres@localhost:5432/myapp";

export const db = drizzle(databaseUrl, { relations });
