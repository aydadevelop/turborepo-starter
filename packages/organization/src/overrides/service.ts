import { db as defaultDb } from "@my-app/db";

import {
	insertOrganizationManualOverride,
	listActiveOrganizationManualOverrides,
	resolveOrganizationManualOverride as resolveOrganizationManualOverrideRow,
} from "./repository";
import type { Db, OrganizationManualOverrideRow } from "../types";

export const listOrganizationManualOverrides = async (
	organizationId: string,
	db: Db = defaultDb
): Promise<OrganizationManualOverrideRow[]> => {
	return listActiveOrganizationManualOverrides(organizationId, db);
};

export const createOrganizationManualOverride = async (
	input: {
		code: string;
		createdByUserId?: string;
		note?: string;
		organizationId: string;
		scopeKey?: string | null;
		scopeType: "organization" | "listing";
		title: string;
	},
	db: Db = defaultDb
): Promise<OrganizationManualOverrideRow> => {
	const now = new Date();
	return insertOrganizationManualOverride(
		{
			id: crypto.randomUUID(),
			organizationId: input.organizationId,
			scopeType: input.scopeType,
			scopeKey: input.scopeKey ?? null,
			code: input.code,
			title: input.title,
			note: input.note ?? null,
			isActive: true,
			createdByUserId: input.createdByUserId ?? null,
			createdAt: now,
			updatedAt: now,
		},
		db
	);
};

export const resolveOrganizationManualOverride = async (
	id: string,
	organizationId: string,
	resolvedByUserId: string | null,
	db: Db = defaultDb
): Promise<OrganizationManualOverrideRow> => {
	const row = await resolveOrganizationManualOverrideRow(
		id,
		organizationId,
		resolvedByUserId,
		db
	);
	if (!row) {
		throw new Error("NOT_FOUND");
	}

	return row;
};
