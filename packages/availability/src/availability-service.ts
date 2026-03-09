import { and, asc, eq, gt, inArray, lt, not } from "drizzle-orm";
import {
	listingAvailabilityBlock,
	listingAvailabilityException,
	listingAvailabilityRule,
} from "@my-app/db/schema/availability";
import { booking, listing } from "@my-app/db/schema/marketplace";

import type {
	AvailabilityBlockRow,
	AvailabilityExceptionRow,
	AvailabilityRuleRow,
	CreateAvailabilityBlockInput,
	CreateAvailabilityExceptionInput,
	CreateAvailabilityRuleInput,
	Db,
} from "./types";

async function verifyListingOwnership(
	listingId: string,
	organizationId: string,
	db: Db,
): Promise<void> {
	const [row] = await db
		.select({ id: listing.id })
		.from(listing)
		.where(and(eq(listing.id, listingId), eq(listing.organizationId, organizationId)))
		.limit(1);
	if (!row) throw new Error("NOT_FOUND");
}

export async function createAvailabilityRule(
	input: CreateAvailabilityRuleInput,
	db: Db,
): Promise<AvailabilityRuleRow> {
	await verifyListingOwnership(input.listingId, input.organizationId, db);
	const [row] = await db
		.insert(listingAvailabilityRule)
		.values({
			id: crypto.randomUUID(),
			listingId: input.listingId,
			dayOfWeek: input.dayOfWeek,
			startMinute: input.startMinute,
			endMinute: input.endMinute,
			isActive: true,
		})
		.returning();
	if (!row) throw new Error("Insert failed");
	return row;
}

export async function deleteAvailabilityRule(
	id: string,
	organizationId: string,
	db: Db,
): Promise<void> {
	const [rule] = await db
		.select()
		.from(listingAvailabilityRule)
		.where(eq(listingAvailabilityRule.id, id))
		.limit(1);
	if (!rule) throw new Error("NOT_FOUND");
	await verifyListingOwnership(rule.listingId, organizationId, db);
	await db
		.delete(listingAvailabilityRule)
		.where(eq(listingAvailabilityRule.id, id));
}

export async function listAvailabilityRules(
	listingId: string,
	organizationId: string,
	db: Db,
): Promise<AvailabilityRuleRow[]> {
	await verifyListingOwnership(listingId, organizationId, db);
	return db
		.select()
		.from(listingAvailabilityRule)
		.where(eq(listingAvailabilityRule.listingId, listingId))
		.orderBy(
			asc(listingAvailabilityRule.dayOfWeek),
			asc(listingAvailabilityRule.startMinute),
		);
}

export async function createAvailabilityBlock(
	input: CreateAvailabilityBlockInput,
	db: Db,
): Promise<AvailabilityBlockRow> {
	await verifyListingOwnership(input.listingId, input.organizationId, db);
	const [row] = await db
		.insert(listingAvailabilityBlock)
		.values({
			id: crypto.randomUUID(),
			listingId: input.listingId,
			source: "manual",
			startsAt: input.startsAt,
			endsAt: input.endsAt,
			reason: input.reason,
			isActive: true,
		})
		.returning();
	if (!row) throw new Error("Insert failed");
	return row;
}

export async function deleteAvailabilityBlock(
	id: string,
	organizationId: string,
	db: Db,
): Promise<void> {
	const [block] = await db
		.select()
		.from(listingAvailabilityBlock)
		.where(eq(listingAvailabilityBlock.id, id))
		.limit(1);
	if (!block) throw new Error("NOT_FOUND");
	await verifyListingOwnership(block.listingId, organizationId, db);
	await db
		.delete(listingAvailabilityBlock)
		.where(eq(listingAvailabilityBlock.id, id));
}

export async function createAvailabilityException(
	input: CreateAvailabilityExceptionInput,
	db: Db,
): Promise<AvailabilityExceptionRow> {
	await verifyListingOwnership(input.listingId, input.organizationId, db);
	const [existing] = await db
		.select({ id: listingAvailabilityException.id })
		.from(listingAvailabilityException)
		.where(
			and(
				eq(listingAvailabilityException.listingId, input.listingId),
				eq(listingAvailabilityException.date, input.date),
			),
		)
		.limit(1);
	if (existing) throw new Error("DUPLICATE_DATE");
	const [row] = await db
		.insert(listingAvailabilityException)
		.values({
			id: crypto.randomUUID(),
			listingId: input.listingId,
			date: input.date,
			isAvailable: input.isAvailable,
			startMinute: input.startMinute,
			endMinute: input.endMinute,
			reason: input.reason,
		})
		.returning();
	if (!row) throw new Error("Insert failed");
	return row;
}

export async function deleteAvailabilityException(
	id: string,
	organizationId: string,
	db: Db,
): Promise<void> {
	const [exc] = await db
		.select()
		.from(listingAvailabilityException)
		.where(eq(listingAvailabilityException.id, id))
		.limit(1);
	if (!exc) throw new Error("NOT_FOUND");
	await verifyListingOwnership(exc.listingId, organizationId, db);
	await db
		.delete(listingAvailabilityException)
		.where(eq(listingAvailabilityException.id, id));
}

export async function checkSlotAvailable(
	listingId: string,
	startsAt: Date,
	endsAt: Date,
	db: Db,
): Promise<boolean> {
	// Check for overlapping active bookings (not cancelled)
	const [overlappingBooking] = await db
		.select({ id: booking.id })
		.from(booking)
		.where(
			and(
				eq(booking.listingId, listingId),
				not(inArray(booking.status, ["cancelled"])),
				lt(booking.startsAt, endsAt),
				gt(booking.endsAt, startsAt),
			),
		)
		.limit(1);

	if (overlappingBooking) return false;

	// Check for overlapping active blocks
	const [overlappingBlock] = await db
		.select({ id: listingAvailabilityBlock.id })
		.from(listingAvailabilityBlock)
		.where(
			and(
				eq(listingAvailabilityBlock.listingId, listingId),
				eq(listingAvailabilityBlock.isActive, true),
				lt(listingAvailabilityBlock.startsAt, endsAt),
				gt(listingAvailabilityBlock.endsAt, startsAt),
			),
		)
		.limit(1);

	if (overlappingBlock) return false;

	return true;
}

export async function assertSlotAvailable(
	listingId: string,
	startsAt: Date,
	endsAt: Date,
	db: Db,
): Promise<void> {
	const available = await checkSlotAvailable(listingId, startsAt, endsAt, db);
	if (!available) throw new Error("SLOT_UNAVAILABLE");
}
