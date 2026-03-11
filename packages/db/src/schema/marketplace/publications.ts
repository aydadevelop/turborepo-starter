import {
	boolean,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { organization } from "../auth";
import { timestamps } from "../columns";
import { listing } from "./listings";
import { organizationPaymentConfig } from "./payments";
import { listingPricingProfile } from "./pricing";
import {
	merchantTypeEnum,
	publicationChannelTypeEnum,
	publicationVisibilityEnum,
} from "./shared";

export const listingPublication = pgTable(
	"listing_publication",
	{
		id: text("id").primaryKey(),
		listingId: text("listing_id")
			.notNull()
			.references(() => listing.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		channelType: publicationChannelTypeEnum("channel_type").notNull(),
		channelId: text("channel_id"),
		isActive: boolean("is_active").notNull().default(true),
		visibility: publicationVisibilityEnum("visibility")
			.notNull()
			.default("public"),
		merchantType: merchantTypeEnum("merchant_type")
			.notNull()
			.default("platform"),
		merchantPaymentConfigId: text("merchant_payment_config_id").references(
			() => organizationPaymentConfig.id,
			{ onDelete: "set null" },
		),
		platformFeeBps: integer("platform_fee_bps"),
		pricingProfileId: text("pricing_profile_id").references(
			() => listingPricingProfile.id,
			{ onDelete: "set null" },
		),
		displayConfig: jsonb("display_config").$type<Record<string, unknown>>(),
		...timestamps,
	},
	(table) => [
		index("listing_publication_ix_listing_id").on(table.listingId),
		index("listing_publication_ix_organization_id").on(table.organizationId),
		index("listing_publication_ix_channel_type").on(table.channelType),
		index("listing_publication_ix_merchant_payment_config_id").on(
			table.merchantPaymentConfigId,
		),
		index("listing_publication_ix_pricing_profile_id").on(
			table.pricingProfileId,
		),
		uniqueIndex("listing_publication_uq_listing_channel").on(
			table.listingId,
			table.channelType,
			table.channelId,
		),
	],
);
