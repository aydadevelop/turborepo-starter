import { index, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestamps } from "./columns";

export const consentTypeValues = [
	"service_agreement",
	"user_agreement",
	"privacy_policy",
] as const;
export const consentTypeEnum = pgEnum("consent_type", consentTypeValues);
export type ConsentType = (typeof consentTypeValues)[number];

export const userConsent = pgTable(
	"user_consent",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		consentType: consentTypeEnum("consent_type").notNull(),
		consentVersion: text("consent_version").notNull(),
		consentedAt: timestamp("consented_at", {
			withTimezone: true,
			mode: "date",
		}).notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		...timestamps,
	},
	(table) => [
		index("user_consent_userId_idx").on(table.userId),
		index("user_consent_type_idx").on(table.userId, table.consentType),
	]
);
