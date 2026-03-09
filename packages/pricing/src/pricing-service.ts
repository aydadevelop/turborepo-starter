import { and, asc, desc, eq, isNull } from "drizzle-orm";
import {
	listing,
	listingPricingProfile,
	listingPricingRule,
} from "@my-app/db/schema/marketplace";

import type {
	CreatePricingProfileInput,
	CreatePricingRuleInput,
	Db,
	PricingProfileRow,
	PricingRuleRow,
	UpdatePricingProfileInput,
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

export async function createPricingProfile(
	input: CreatePricingProfileInput,
	db: Db,
): Promise<PricingProfileRow> {
	await verifyListingOwnership(input.listingId, input.organizationId, db);
	if (input.isDefault) {
		await db
			.update(listingPricingProfile)
			.set({ isDefault: false })
			.where(
				and(
					eq(listingPricingProfile.listingId, input.listingId),
					eq(listingPricingProfile.isDefault, true),
				),
			);
	}
	const [row] = await db
		.insert(listingPricingProfile)
		.values({
			id: crypto.randomUUID(),
			listingId: input.listingId,
			name: input.name,
			currency: input.currency,
			baseHourlyPriceCents: input.baseHourlyPriceCents,
			minimumHours: input.minimumHours ?? 1,
			serviceFeeBps: input.serviceFeeBps ?? 0,
			taxBps: input.taxBps ?? 0,
			isDefault: input.isDefault ?? false,
		})
		.returning();
	if (!row) throw new Error("Insert failed");
	return row;
}

export async function updatePricingProfile(
	input: UpdatePricingProfileInput,
	db: Db,
): Promise<PricingProfileRow> {
	// Find the profile and verify org ownership via listing
	const [existing] = await db
		.select({ id: listingPricingProfile.id, listingId: listingPricingProfile.listingId })
		.from(listingPricingProfile)
		.where(eq(listingPricingProfile.id, input.id))
		.limit(1);
	if (!existing) throw new Error("NOT_FOUND");
	await verifyListingOwnership(existing.listingId, input.organizationId, db);

	if (input.isDefault) {
		await db
			.update(listingPricingProfile)
			.set({ isDefault: false })
			.where(
				and(
					eq(listingPricingProfile.listingId, existing.listingId),
					eq(listingPricingProfile.isDefault, true),
				),
			);
	}

	const updates: Partial<typeof listingPricingProfile.$inferInsert> = {};
	if (input.name !== undefined) updates.name = input.name;
	if (input.baseHourlyPriceCents !== undefined) updates.baseHourlyPriceCents = input.baseHourlyPriceCents;
	if (input.serviceFeeBps !== undefined) updates.serviceFeeBps = input.serviceFeeBps;
	if (input.taxBps !== undefined) updates.taxBps = input.taxBps;
	if (input.isDefault !== undefined) updates.isDefault = input.isDefault;

	const [row] = await db
		.update(listingPricingProfile)
		.set(updates)
		.where(eq(listingPricingProfile.id, input.id))
		.returning();
	if (!row) throw new Error("NOT_FOUND");
	return row;
}

export async function listPricingProfiles(
	listingId: string,
	organizationId: string,
	db: Db,
): Promise<PricingProfileRow[]> {
	await verifyListingOwnership(listingId, organizationId, db);
	return db
		.select()
		.from(listingPricingProfile)
		.where(
			and(
				eq(listingPricingProfile.listingId, listingId),
				isNull(listingPricingProfile.archivedAt),
			),
		)
		.orderBy(desc(listingPricingProfile.isDefault), asc(listingPricingProfile.createdAt));
}

export async function createPricingRule(
	input: CreatePricingRuleInput,
	db: Db,
): Promise<PricingRuleRow> {
	await verifyListingOwnership(input.listingId, input.organizationId, db);
	const [row] = await db
		.insert(listingPricingRule)
		.values({
			id: crypto.randomUUID(),
			listingId: input.listingId,
			pricingProfileId: input.pricingProfileId,
			name: input.name,
			ruleType: input.ruleType,
			conditionJson: input.conditionJson,
			adjustmentType: input.adjustmentType,
			adjustmentValue: input.adjustmentValue,
			priority: input.priority ?? 0,
			isActive: true,
		})
		.returning();
	if (!row) throw new Error("Insert failed");
	return row;
}

export async function deletePricingRule(
	id: string,
	organizationId: string,
	db: Db,
): Promise<void> {
	const [rule] = await db
		.select({ id: listingPricingRule.id, listingId: listingPricingRule.listingId })
		.from(listingPricingRule)
		.where(eq(listingPricingRule.id, id))
		.limit(1);
	if (!rule) throw new Error("NOT_FOUND");
	await verifyListingOwnership(rule.listingId, organizationId, db);
	await db.delete(listingPricingRule).where(eq(listingPricingRule.id, id));
}
