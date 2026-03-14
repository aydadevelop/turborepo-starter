import { db as defaultDb } from "@my-app/db";
import { organizationManualOverride } from "@my-app/db/schema/marketplace";
import { and, eq } from "drizzle-orm";

import type {
	Db,
	OrganizationManualOverrideRow,
	OrganizationManualOverrideSummary,
} from "../types";

export function listActiveOrganizationManualOverrides(
	organizationId: string,
	db: Db = defaultDb,
): Promise<OrganizationManualOverrideRow[]> {
	return db
		.select()
		.from(organizationManualOverride)
		.where(
			and(
				eq(organizationManualOverride.organizationId, organizationId),
				eq(organizationManualOverride.isActive, true),
			),
		);
}

export async function insertOrganizationManualOverride(
	input: typeof organizationManualOverride.$inferInsert,
	db: Db = defaultDb,
): Promise<OrganizationManualOverrideRow> {
	const [row] = await db
		.insert(organizationManualOverride)
		.values(input)
		.returning();

	if (!row) {
		throw new Error("UPSERT_FAILED");
	}

	return row;
}

export async function resolveOrganizationManualOverride(
	id: string,
	organizationId: string,
	resolvedByUserId: string | null,
	db: Db = defaultDb,
): Promise<OrganizationManualOverrideRow | null> {
	const [row] = await db
		.update(organizationManualOverride)
		.set({
			isActive: false,
			resolvedByUserId,
			resolvedAt: new Date(),
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(organizationManualOverride.id, id),
				eq(organizationManualOverride.organizationId, organizationId),
			),
		)
		.returning();

	return row ?? null;
}

export async function resolveOrganizationManualOverrideSummary(
	organizationId: string,
	db: Db = defaultDb,
): Promise<OrganizationManualOverrideSummary> {
	const items = await listActiveOrganizationManualOverrides(organizationId, db);
	return {
		activeCount: items.length,
		items,
	};
}
