import { db as defaultDb } from "@my-app/db";

import {
	findOrganizationOnboarding,
	resolveOrganizationOnboardingState,
	upsertOrganizationOnboarding,
} from "./repository";
import type { Db, OrganizationOnboardingRow } from "../types";

export const recalculateOrganizationOnboarding = async (
	organizationId: string,
	db: Db = defaultDb
): Promise<OrganizationOnboardingRow> => {
	const [existing, next] = await Promise.all([
		findOrganizationOnboarding(organizationId, db),
		resolveOrganizationOnboardingState(organizationId, db),
	]);

	const now = new Date();
	const isComplete =
		next.paymentConfigured && next.calendarConnected && next.listingPublished;
	const completedAt = isComplete ? (existing?.completedAt ?? now) : null;

	return upsertOrganizationOnboarding(
		{
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
		},
		db
	);
};

export const getOrganizationOnboardingStatus = async (
	organizationId: string,
	db: Db = defaultDb
): Promise<OrganizationOnboardingRow> => {
	const row = await findOrganizationOnboarding(organizationId, db);
	if (row) {
		return row;
	}

	return recalculateOrganizationOnboarding(organizationId, db);
};
