import { db as defaultDb } from "@my-app/db";
import { user } from "@my-app/db/schema/auth";
import {
	listing,
	listingModerationAudit,
	listingPublication,
} from "@my-app/db/schema/marketplace";
import { and, count, eq, isNotNull, isNull, sql } from "drizzle-orm";

import type {
	Db,
	OrganizationListingModerationAuditEntry,
	OrganizationListingModerationState,
	OrganizationModerationSummary,
} from "../types";

export async function resolveOrganizationModerationSummary(
	organizationId: string,
	db: Db = defaultDb,
): Promise<OrganizationModerationSummary> {
	const [approvedRow, reviewPendingRow, unapprovedActiveRow] =
		await Promise.all([
			db
				.select({ count: count() })
				.from(listing)
				.where(
					and(
						eq(listing.organizationId, organizationId),
						isNotNull(listing.approvedAt),
					),
				),
			db
				.select({
					count: sql<number>`count(distinct ${listing.id})`,
				})
				.from(listing)
				.innerJoin(
					listingPublication,
					and(
						eq(listingPublication.listingId, listing.id),
						eq(listingPublication.isActive, true),
					),
				)
				.where(
					and(
						eq(listing.organizationId, organizationId),
						isNull(listing.approvedAt),
					),
				),
			db
				.select({ count: count() })
				.from(listing)
				.where(
					and(
						eq(listing.organizationId, organizationId),
						eq(listing.status, "active"),
						isNull(listing.approvedAt),
					),
				),
		]);

	return {
		approvedListingCount: Number(approvedRow[0]?.count ?? 0),
		reviewPendingCount: Number(reviewPendingRow[0]?.count ?? 0),
		unapprovedActiveListingCount: Number(unapprovedActiveRow[0]?.count ?? 0),
	};
}

export async function ensureOrganizationListingExists(
	listingId: string,
	organizationId: string,
	db: Db = defaultDb,
): Promise<void> {
	const [row] = await db
		.select({ id: listing.id })
		.from(listing)
		.where(
			and(
				eq(listing.id, listingId),
				eq(listing.organizationId, organizationId),
			),
		)
		.limit(1);

	if (!row) {
		throw new Error("NOT_FOUND");
	}
}

export async function setOrganizationListingApproval(
	listingId: string,
	organizationId: string,
	approvedAt: Date | null,
	db: Db = defaultDb,
): Promise<void> {
	const [row] = await db
		.update(listing)
		.set({
			approvedAt,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(listing.id, listingId),
				eq(listing.organizationId, organizationId),
			),
		)
		.returning({ id: listing.id });

	if (!row) {
		throw new Error("NOT_FOUND");
	}
}

export async function resolveOrganizationListingModerationState(
	listingId: string,
	organizationId: string,
	db: Db = defaultDb,
): Promise<OrganizationListingModerationState> {
	const [row] = await db
		.select({
			id: listing.id,
			approvedAt: listing.approvedAt,
		})
		.from(listing)
		.where(
			and(
				eq(listing.id, listingId),
				eq(listing.organizationId, organizationId),
			),
		)
		.limit(1);

	if (!row) {
		throw new Error("NOT_FOUND");
	}

	return {
		listingId: row.id,
		approvedAt: row.approvedAt,
		isApproved: row.approvedAt !== null,
	};
}

export async function insertOrganizationListingModerationAudit(
	input: typeof listingModerationAudit.$inferInsert,
	db: Db = defaultDb,
): Promise<void> {
	await db.insert(listingModerationAudit).values(input);
}

export async function listOrganizationListingModerationAudit(
	listingId: string,
	organizationId: string,
	db: Db = defaultDb,
): Promise<OrganizationListingModerationAuditEntry[]> {
	await ensureOrganizationListingExists(listingId, organizationId, db);

	const rows = await db
		.select({
			id: listingModerationAudit.id,
			organizationId: listingModerationAudit.organizationId,
			listingId: listingModerationAudit.listingId,
			action: listingModerationAudit.action,
			note: listingModerationAudit.note,
			actedByUserId: listingModerationAudit.actedByUserId,
			actedByDisplayName: sql<
				string | null
			>`coalesce(${user.name}, ${user.email})`,
			actedAt: listingModerationAudit.actedAt,
		})
		.from(listingModerationAudit)
		.leftJoin(user, eq(user.id, listingModerationAudit.actedByUserId))
		.where(
			and(
				eq(listingModerationAudit.listingId, listingId),
				eq(listingModerationAudit.organizationId, organizationId),
			),
		)
		.orderBy(sql`${listingModerationAudit.actedAt} desc`);

	return rows;
}
