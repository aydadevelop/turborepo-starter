import {
	bookingDiscountApplication,
	bookingDiscountCode,
} from "@my-app/db/schema/marketplace";
import { and, asc, desc, eq, sql } from "drizzle-orm";

import type { Db, DiscountCodeRow } from "./types";

export async function findDiscountCodeByOrganizationAndCode(
	organizationId: string,
	code: string,
	db: Db,
): Promise<DiscountCodeRow | null> {
	const [row] = await db
		.select()
		.from(bookingDiscountCode)
		.where(
			and(
				eq(bookingDiscountCode.organizationId, organizationId),
				eq(bookingDiscountCode.code, code),
			),
		)
		.limit(1);

	return row ?? null;
}

export async function findDiscountCodeById(
	id: string,
	db: Db,
): Promise<DiscountCodeRow | null> {
	const [row] = await db
		.select()
		.from(bookingDiscountCode)
		.where(eq(bookingDiscountCode.id, id))
		.limit(1);

	return row ?? null;
}

export async function countCustomerApplicationsForDiscountCode(
	discountCodeId: string,
	customerUserId: string,
	db: Db,
): Promise<number> {
	const [row] = await db
		.select({
			count: sql<number>`count(*)::int`,
		})
		.from(bookingDiscountApplication)
		.where(
			and(
				eq(bookingDiscountApplication.discountCodeId, discountCodeId),
				eq(bookingDiscountApplication.customerUserId, customerUserId),
			),
		);

	return row?.count ?? 0;
}

export async function incrementDiscountCodeUsage(
	discountCodeId: string,
	db: Db,
): Promise<void> {
	await db
		.update(bookingDiscountCode)
		.set({
			usageCount: sql`${bookingDiscountCode.usageCount} + 1`,
		})
		.where(eq(bookingDiscountCode.id, discountCodeId));
}

export async function insertDiscountApplication(
	values: typeof bookingDiscountApplication.$inferInsert,
	db: Db,
): Promise<void> {
	await db.insert(bookingDiscountApplication).values(values);
}

export async function listOrganizationDiscountCodes(
	organizationId: string,
	db: Db,
): Promise<DiscountCodeRow[]> {
	return db
		.select()
		.from(bookingDiscountCode)
		.where(eq(bookingDiscountCode.organizationId, organizationId))
		.orderBy(desc(bookingDiscountCode.isActive), asc(bookingDiscountCode.code));
}

export async function createDiscountCode(
	values: typeof bookingDiscountCode.$inferInsert,
	db: Db,
): Promise<DiscountCodeRow> {
	const [row] = await db.insert(bookingDiscountCode).values(values).returning();
	if (!row) {
		throw new Error("PROMOTION_PERSISTENCE_FAILED");
	}

	return row;
}

export async function updateDiscountCode(
	id: string,
	organizationId: string,
	values: Partial<typeof bookingDiscountCode.$inferInsert>,
	db: Db,
): Promise<DiscountCodeRow> {
	const [row] = await db
		.update(bookingDiscountCode)
		.set(values)
		.where(
			and(
				eq(bookingDiscountCode.id, id),
				eq(bookingDiscountCode.organizationId, organizationId),
			),
		)
		.returning();

	if (!row) {
		throw new Error("NOT_FOUND");
	}

	return row;
}
