import {
	type AvailabilityBlockRow,
	type AvailabilityExceptionRow,
	type AvailabilityRuleRow,
	checkSlotAvailable,
	createAvailabilityBlock,
	createAvailabilityException,
	createAvailabilityRule,
	deleteAvailabilityBlock,
	deleteAvailabilityException,
	deleteAvailabilityRule,
	getListingAvailabilityWorkspaceState,
	listAvailabilityRules,
} from "@my-app/booking";
import { db } from "@my-app/db";
import { ORPCError } from "@orpc/server";

import { organizationPermissionProcedure, publicProcedure } from "../index";

const toAvailabilityError = (error: unknown) => {
	if (error instanceof Error && error.message === "NOT_FOUND") {
		return new ORPCError("NOT_FOUND");
	}

	return error;
};

const formatRule = (row: AvailabilityRuleRow) => ({
	...row,
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
});

const formatBlock = (row: AvailabilityBlockRow) => ({
	...row,
	startsAt: row.startsAt.toISOString(),
	endsAt: row.endsAt.toISOString(),
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
});

const formatException = (row: AvailabilityExceptionRow) => ({
	...row,
	date: row.date,
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
});

export const availabilityRouter = {
	addRule: organizationPermissionProcedure({
		availability: ["create"],
	}).availability.addRule.handler(async ({ context, input }) => {
		try {
			const row = await createAvailabilityRule(
				{
					...input,
					organizationId: context.activeMembership.organizationId,
				},
				db,
			);
			return formatRule(row);
		} catch (error) {
			throw toAvailabilityError(error);
		}
	}),

	deleteRule: organizationPermissionProcedure({
		availability: ["delete"],
	}).availability.deleteRule.handler(async ({ context, input }) => {
		try {
			await deleteAvailabilityRule(
				input.id,
				context.activeMembership.organizationId,
				db,
			);
		} catch (e) {
			if (e instanceof Error && e.message === "NOT_FOUND") {
				throw new ORPCError("NOT_FOUND");
			}
			throw e;
		}
		return { success: true };
	}),

	listRules: organizationPermissionProcedure({
		availability: ["read"],
	}).availability.listRules.handler(async ({ context, input }) => {
		try {
			const rows = await listAvailabilityRules(
				input.listingId,
				context.activeMembership.organizationId,
				db,
			);
			return rows.map(formatRule);
		} catch (error) {
			throw toAvailabilityError(error);
		}
	}),

	getWorkspaceState: organizationPermissionProcedure({
		availability: ["read"],
	}).availability.getWorkspaceState.handler(async ({ context, input }) => {
		try {
			const state = await getListingAvailabilityWorkspaceState(
				input.listingId,
				context.activeMembership.organizationId,
				db,
			);
			return {
				...state,
				rules: state.rules.map(formatRule),
				blocks: state.blocks.map(formatBlock),
				exceptions: state.exceptions.map(formatException),
			};
		} catch (error) {
			throw toAvailabilityError(error);
		}
	}),

	addBlock: organizationPermissionProcedure({
		availability: ["create"],
	}).availability.addBlock.handler(async ({ context, input }) => {
		try {
			const row = await createAvailabilityBlock(
				{
					listingId: input.listingId,
					organizationId: context.activeMembership.organizationId,
					startsAt: new Date(input.startsAt),
					endsAt: new Date(input.endsAt),
					reason: input.reason,
				},
				db,
			);
			return formatBlock(row);
		} catch (error) {
			throw toAvailabilityError(error);
		}
	}),

	deleteBlock: organizationPermissionProcedure({
		availability: ["delete"],
	}).availability.deleteBlock.handler(async ({ context, input }) => {
		try {
			await deleteAvailabilityBlock(
				input.id,
				context.activeMembership.organizationId,
				db,
			);
		} catch (e) {
			if (e instanceof Error && e.message === "NOT_FOUND") {
				throw new ORPCError("NOT_FOUND");
			}
			throw e;
		}
		return { success: true };
	}),

	addException: organizationPermissionProcedure({
		availability: ["create"],
	}).availability.addException.handler(async ({ context, input }) => {
		try {
			const row = await createAvailabilityException(
				{
					listingId: input.listingId,
					organizationId: context.activeMembership.organizationId,
					date: input.date,
					isAvailable: input.isAvailable,
					startMinute: input.startMinute,
					endMinute: input.endMinute,
					reason: input.reason,
				},
				db,
			);
			return formatException(row);
		} catch (e) {
			if (e instanceof Error && e.message === "DUPLICATE_DATE") {
				throw new ORPCError("CONFLICT");
			}
			if (e instanceof Error && e.message === "NOT_FOUND") {
				throw new ORPCError("NOT_FOUND");
			}
			throw e;
		}
	}),

	deleteException: organizationPermissionProcedure({
		availability: ["delete"],
	}).availability.deleteException.handler(async ({ context, input }) => {
		try {
			await deleteAvailabilityException(
				input.id,
				context.activeMembership.organizationId,
				db,
			);
		} catch (e) {
			if (e instanceof Error && e.message === "NOT_FOUND") {
				throw new ORPCError("NOT_FOUND");
			}
			throw e;
		}
		return { success: true };
	}),

	checkSlot: publicProcedure.availability.checkSlot.handler(
		async ({ input }) => {
			const available = await checkSlotAvailable(
				input.listingId,
				new Date(input.startsAt),
				new Date(input.endsAt),
				db,
			);
			return { available };
		},
	),
};
