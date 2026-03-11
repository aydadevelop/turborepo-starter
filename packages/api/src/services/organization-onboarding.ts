import { db as defaultDb } from "@my-app/db";
import { listingCalendarConnection } from "@my-app/db/schema/availability";
import {
	listingPublication,
	organizationOnboarding,
	organizationPaymentConfig,
} from "@my-app/db/schema/marketplace";
import { and, eq, isNotNull } from "drizzle-orm";

type Db = typeof defaultDb;
export type OrganizationOnboardingRow =
	typeof organizationOnboarding.$inferSelect;

const resolveCurrentState = async (
	organizationId: string,
	db: Db,
): Promise<{
	paymentConfigured: boolean;
	calendarConnected: boolean;
	listingPublished: boolean;
}> => {
	const [paymentRow, calendarRow, publicationRow] = await Promise.all([
		db
			.select({ id: organizationPaymentConfig.id })
			.from(organizationPaymentConfig)
			.where(
				and(
					eq(organizationPaymentConfig.organizationId, organizationId),
					eq(organizationPaymentConfig.isActive, true),
					eq(organizationPaymentConfig.validationStatus, "validated"),
				),
			)
			.limit(1),
		db
			.select({ id: listingCalendarConnection.id })
			.from(listingCalendarConnection)
			.where(
				and(
					eq(listingCalendarConnection.organizationId, organizationId),
					eq(listingCalendarConnection.isActive, true),
					isNotNull(listingCalendarConnection.externalCalendarId),
				),
			)
			.limit(1),
		db
			.select({ id: listingPublication.id })
			.from(listingPublication)
			.where(
				and(
					eq(listingPublication.organizationId, organizationId),
					eq(listingPublication.isActive, true),
				),
			)
			.limit(1),
	]);

	return {
		paymentConfigured: Boolean(paymentRow[0]),
		calendarConnected: Boolean(calendarRow[0]),
		listingPublished: Boolean(publicationRow[0]),
	};
};

export const recalculateOrganizationOnboarding = async (
	organizationId: string,
	db: Db = defaultDb,
): Promise<OrganizationOnboardingRow> => {
	const [existing] = await db
		.select()
		.from(organizationOnboarding)
		.where(eq(organizationOnboarding.organizationId, organizationId))
		.limit(1);

	const now = new Date();
	const next = await resolveCurrentState(organizationId, db);
	const isComplete =
		next.paymentConfigured &&
		next.calendarConnected &&
		next.listingPublished;
	const completedAt = isComplete ? existing?.completedAt ?? now : null;

	const [row] = await db
		.insert(organizationOnboarding)
		.values({
			id: existing?.id ?? crypto.randomUUID(),
			organizationId,
			paymentConfigured: next.paymentConfigured,
			calendarConnected: next.calendarConnected,
			listingPublished: next.listingPublished,
			isComplete,
			completedAt,
			lastRecalculatedAt: now,
			createdAt: existing?.createdAt ?? now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: [organizationOnboarding.organizationId],
			set: {
				paymentConfigured: next.paymentConfigured,
				calendarConnected: next.calendarConnected,
				listingPublished: next.listingPublished,
				isComplete,
				completedAt,
				lastRecalculatedAt: now,
				updatedAt: now,
			},
		})
		.returning();

	if (!row) {
		throw new Error("UPSERT_FAILED");
	}

	return row;
};

export const getOrganizationOnboardingStatus = async (
	organizationId: string,
	db: Db = defaultDb,
): Promise<OrganizationOnboardingRow> => {
	const [row] = await db
		.select()
		.from(organizationOnboarding)
		.where(eq(organizationOnboarding.organizationId, organizationId))
		.limit(1);

	if (row) {
		return row;
	}

	return recalculateOrganizationOnboarding(organizationId, db);
};
