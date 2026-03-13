import { db as defaultDb } from "@my-app/db";
import { listingCalendarConnection } from "@my-app/db/schema/availability";
import {
	listingPublication,
	organizationOnboarding,
	organizationPaymentConfig,
} from "@my-app/db/schema/marketplace";
import { and, eq, isNotNull } from "drizzle-orm";

import type { Db, OrganizationOnboardingRow } from "../types";

export interface OrganizationOnboardingStateInput {
	calendarConnected: boolean;
	listingPublished: boolean;
	paymentConfigured: boolean;
}

export interface UpsertOrganizationOnboardingInput
	extends OrganizationOnboardingStateInput {
	completedAt: Date | null;
	createdAt: Date;
	id: string;
	isComplete: boolean;
	lastRecalculatedAt: Date;
	organizationId: string;
	updatedAt: Date;
}

export async function findOrganizationOnboarding(
	organizationId: string,
	db: Db = defaultDb
): Promise<OrganizationOnboardingRow | null> {
	const [row] = await db
		.select()
		.from(organizationOnboarding)
		.where(eq(organizationOnboarding.organizationId, organizationId))
		.limit(1);

	return row ?? null;
}

export async function resolveOrganizationOnboardingState(
	organizationId: string,
	db: Db = defaultDb
): Promise<OrganizationOnboardingStateInput> {
	const [paymentRow, calendarRow, publicationRow] = await Promise.all([
		db
			.select({ id: organizationPaymentConfig.id })
			.from(organizationPaymentConfig)
			.where(
				and(
					eq(organizationPaymentConfig.organizationId, organizationId),
					eq(organizationPaymentConfig.isActive, true),
					eq(organizationPaymentConfig.validationStatus, "validated")
				)
			)
			.limit(1),
		db
			.select({ id: listingCalendarConnection.id })
			.from(listingCalendarConnection)
			.where(
				and(
					eq(listingCalendarConnection.organizationId, organizationId),
					eq(listingCalendarConnection.isActive, true),
					isNotNull(listingCalendarConnection.externalCalendarId)
				)
			)
			.limit(1),
		db
			.select({ id: listingPublication.id })
			.from(listingPublication)
			.where(
				and(
					eq(listingPublication.organizationId, organizationId),
					eq(listingPublication.isActive, true)
				)
			)
			.limit(1),
	]);

	return {
		paymentConfigured: Boolean(paymentRow[0]),
		calendarConnected: Boolean(calendarRow[0]),
		listingPublished: Boolean(publicationRow[0]),
	};
}

export async function upsertOrganizationOnboarding(
	input: UpsertOrganizationOnboardingInput,
	db: Db = defaultDb
): Promise<OrganizationOnboardingRow> {
	const [row] = await db
		.insert(organizationOnboarding)
		.values(input)
		.onConflictDoUpdate({
			target: [organizationOnboarding.organizationId],
			set: {
				paymentConfigured: input.paymentConfigured,
				calendarConnected: input.calendarConnected,
				listingPublished: input.listingPublished,
				isComplete: input.isComplete,
				completedAt: input.completedAt,
				lastRecalculatedAt: input.lastRecalculatedAt,
				updatedAt: input.updatedAt,
			},
		})
		.returning();

	if (!row) {
		throw new Error("UPSERT_FAILED");
	}

	return row;
}
