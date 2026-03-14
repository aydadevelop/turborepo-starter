import { db as defaultDb } from "@my-app/db";
import type {
	Db,
	OrganizationListingModerationAuditEntry,
	OrganizationListingModerationState,
} from "../types";
import {
	insertOrganizationListingModerationAudit,
	listOrganizationListingModerationAudit,
	resolveOrganizationListingModerationState,
	setOrganizationListingApproval,
} from "./repository";

export const approveOrganizationListing = (
	input: {
		actorUserId?: string | null;
		listingId: string;
		note?: string;
		organizationId: string;
	},
	db: Db = defaultDb
): Promise<OrganizationListingModerationState> => {
	const actedAt = new Date();

	return db.transaction(async (tx) => {
		const transactionDb = tx as unknown as Db;

		await setOrganizationListingApproval(
			input.listingId,
			input.organizationId,
			actedAt,
			transactionDb
		);
		await insertOrganizationListingModerationAudit(
			{
				id: crypto.randomUUID(),
				organizationId: input.organizationId,
				listingId: input.listingId,
				action: "approved",
				note: input.note ?? null,
				actedByUserId: input.actorUserId ?? null,
				actedAt,
			},
			transactionDb
		);
		return resolveOrganizationListingModerationState(
			input.listingId,
			input.organizationId,
			transactionDb
		);
	});
};

export const clearOrganizationListingApproval = (
	input: {
		actorUserId?: string | null;
		listingId: string;
		note?: string;
		organizationId: string;
	},
	db: Db = defaultDb
): Promise<OrganizationListingModerationState> => {
	const actedAt = new Date();

	return db.transaction(async (tx) => {
		const transactionDb = tx as unknown as Db;

		await setOrganizationListingApproval(
			input.listingId,
			input.organizationId,
			null,
			transactionDb
		);
		await insertOrganizationListingModerationAudit(
			{
				id: crypto.randomUUID(),
				organizationId: input.organizationId,
				listingId: input.listingId,
				action: "approval_cleared",
				note: input.note ?? null,
				actedByUserId: input.actorUserId ?? null,
				actedAt,
			},
			transactionDb
		);
		return resolveOrganizationListingModerationState(
			input.listingId,
			input.organizationId,
			transactionDb
		);
	});
};

export const getOrganizationListingModerationAudit = (
	listingId: string,
	organizationId: string,
	db: Db = defaultDb
): Promise<OrganizationListingModerationAuditEntry[]> => {
	return listOrganizationListingModerationAudit(listingId, organizationId, db);
};
