import { sql } from "drizzle-orm";
import { timestamp } from "drizzle-orm/pg-core";

export const timestamps = {
	createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
		.default(sql`now()`)
		.notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
		.default(sql`now()`)
		.$onUpdate(() => new Date())
		.notNull(),
};
