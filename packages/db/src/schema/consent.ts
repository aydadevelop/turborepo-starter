import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { timestamps } from "./columns";

export const consentTypeValues = [
	"service_agreement",
	"user_agreement",
	"privacy_policy",
] as const;
export type ConsentType = (typeof consentTypeValues)[number];

export const userConsent = sqliteTable(
	"user_consent",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		consentType: text("consent_type", { enum: consentTypeValues }).notNull(),
		consentVersion: text("consent_version").notNull(),
		consentedAt: integer("consented_at", { mode: "timestamp_ms" }).notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		...timestamps,
	},
	(table) => [
		index("user_consent_userId_idx").on(table.userId),
		index("user_consent_type_idx").on(table.userId, table.consentType),
	]
);
