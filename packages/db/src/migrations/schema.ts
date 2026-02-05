import { sql } from "drizzle-orm";
import {
	index,
	integer,
	numeric,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const d1Migrations = sqliteTable("d1_migrations", {
	id: integer().primaryKey({ autoIncrement: true }),
	name: text().notNull(),
	appliedAt: numeric("applied_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
	type: text().notNull(),
});

export const account = sqliteTable(
	"account",
	{
		id: text().primaryKey().notNull(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: integer("access_token_expires_at"),
		refreshTokenExpiresAt: integer("refresh_token_expires_at"),
		scope: text(),
		password: text(),
		createdAt: integer("created_at")
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at").notNull(),
	},
	(table) => [index("account_userId_idx").on(table.userId)]
);

export const session = sqliteTable(
	"session",
	{
		id: text().primaryKey().notNull(),
		expiresAt: integer("expires_at").notNull(),
		token: text().notNull(),
		createdAt: integer("created_at")
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at").notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => [
		index("session_userId_idx").on(table.userId),
		uniqueIndex("session_token_unique").on(table.token),
	]
);

export const user = sqliteTable(
	"user",
	{
		id: text().primaryKey().notNull(),
		name: text().notNull(),
		email: text().notNull(),
		emailVerified: integer("email_verified").default(false).notNull(),
		image: text(),
		createdAt: integer("created_at")
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at")
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [uniqueIndex("user_email_unique").on(table.email)]
);

export const verification = sqliteTable(
	"verification",
	{
		id: text().primaryKey().notNull(),
		identifier: text().notNull(),
		value: text().notNull(),
		expiresAt: integer("expires_at").notNull(),
		createdAt: integer("created_at")
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at")
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [index("verification_identifier_idx").on(table.identifier)]
);

export const todo = sqliteTable("todo", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	text: text().notNull(),
	completed: integer().default(false).notNull(),
});
