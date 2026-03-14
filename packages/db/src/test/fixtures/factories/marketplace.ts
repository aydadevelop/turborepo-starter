import type { InferInsertModel } from "drizzle-orm";

import {
	booking,
	cancellationPolicy,
	listing,
	listingPricingProfile,
	listingPublication,
	listingTypeConfig,
	organizationPaymentConfig,
	organizationSettings,
	paymentProviderConfig,
} from "../../../schema/marketplace";
import type { TestDatabase } from "../../index";
import { upsertFixtureById } from "./helpers";

export const createListingTypeConfigFixture = (
	db: TestDatabase,
	values: InferInsertModel<typeof listingTypeConfig>
): Promise<typeof listingTypeConfig.$inferSelect> =>
	upsertFixtureById<
		InferInsertModel<typeof listingTypeConfig>,
		typeof listingTypeConfig.$inferSelect
	>(db, listingTypeConfig, values);

export const createOrganizationSettingsFixture = (
	db: TestDatabase,
	values: InferInsertModel<typeof organizationSettings>
): Promise<typeof organizationSettings.$inferSelect> =>
	upsertFixtureById<
		InferInsertModel<typeof organizationSettings>,
		typeof organizationSettings.$inferSelect
	>(db, organizationSettings, values);

export const createListingFixture = (
	db: TestDatabase,
	values: InferInsertModel<typeof listing>
): Promise<typeof listing.$inferSelect> =>
	upsertFixtureById<
		InferInsertModel<typeof listing>,
		typeof listing.$inferSelect
	>(db, listing, values);

export const createListingPricingProfileFixture = (
	db: TestDatabase,
	values: InferInsertModel<typeof listingPricingProfile>
): Promise<typeof listingPricingProfile.$inferSelect> =>
	upsertFixtureById<
		InferInsertModel<typeof listingPricingProfile>,
		typeof listingPricingProfile.$inferSelect
	>(db, listingPricingProfile, values);

export const createPaymentProviderConfigFixture = (
	db: TestDatabase,
	values: InferInsertModel<typeof paymentProviderConfig>
): Promise<typeof paymentProviderConfig.$inferSelect> =>
	upsertFixtureById<
		InferInsertModel<typeof paymentProviderConfig>,
		typeof paymentProviderConfig.$inferSelect
	>(db, paymentProviderConfig, values);

export const createOrganizationPaymentConfigFixture = (
	db: TestDatabase,
	values: InferInsertModel<typeof organizationPaymentConfig>
): Promise<typeof organizationPaymentConfig.$inferSelect> =>
	upsertFixtureById<
		InferInsertModel<typeof organizationPaymentConfig>,
		typeof organizationPaymentConfig.$inferSelect
	>(db, organizationPaymentConfig, values);

export const createListingPublicationFixture = (
	db: TestDatabase,
	values: InferInsertModel<typeof listingPublication>
): Promise<typeof listingPublication.$inferSelect> =>
	upsertFixtureById<
		InferInsertModel<typeof listingPublication>,
		typeof listingPublication.$inferSelect
	>(db, listingPublication, values);

export const createCancellationPolicyFixture = (
	db: TestDatabase,
	values: InferInsertModel<typeof cancellationPolicy>
): Promise<typeof cancellationPolicy.$inferSelect> =>
	upsertFixtureById<
		InferInsertModel<typeof cancellationPolicy>,
		typeof cancellationPolicy.$inferSelect
	>(db, cancellationPolicy, values);

export const createBookingFixture = (
	db: TestDatabase,
	values: InferInsertModel<typeof booking>
): Promise<typeof booking.$inferSelect> =>
	upsertFixtureById<
		InferInsertModel<typeof booking>,
		typeof booking.$inferSelect
	>(db, booking, values);
