import { ORPCError } from "@orpc/server";
import { db } from "@my-app/db";
import {
	calculateQuote,
	createPricingProfile,
	createPricingRule,
	deletePricingRule,
	getPricingWorkspaceState,
	listPricingProfiles,
	updatePricingProfile,
	type PricingProfileRow,
	type PricingRuleRow,
} from "@my-app/pricing";

import { organizationPermissionProcedure, publicProcedure } from "../index";

const formatProfile = (row: PricingProfileRow) => ({
	...row,
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
});

const formatRule = (row: PricingRuleRow) => ({
	...row,
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
});

export const pricingRouter = {
	createProfile: organizationPermissionProcedure({
		pricing: ["create"],
	}).pricing.createProfile.handler(async ({ context, input }) => {
		const row = await createPricingProfile(
			{
				...input,
				organizationId: context.activeMembership.organizationId,
			},
			db,
		);
		return formatProfile(row);
	}),

	updateProfile: organizationPermissionProcedure({
		pricing: ["update"],
	}).pricing.updateProfile.handler(async ({ context, input }) => {
		try {
			const row = await updatePricingProfile(
				{
					...input,
					organizationId: context.activeMembership.organizationId,
				},
				db,
			);
			return formatProfile(row);
		} catch (e) {
			if (e instanceof Error && e.message === "NOT_FOUND") {
				throw new ORPCError("NOT_FOUND");
			}
			throw e;
		}
	}),

	listProfiles: organizationPermissionProcedure({
		pricing: ["read"],
	}).pricing.listProfiles.handler(async ({ context, input }) => {
		const rows = await listPricingProfiles(
			input.listingId,
			context.activeMembership.organizationId,
			db,
		);
		return rows.map(formatProfile);
	}),

	getWorkspaceState: organizationPermissionProcedure({
		pricing: ["read"],
	}).pricing.getWorkspaceState.handler(async ({ context, input }) => {
		const state = await getPricingWorkspaceState(
			input.listingId,
			context.activeMembership.organizationId,
			db,
		);
		return {
			...state,
			profiles: state.profiles.map(formatProfile),
		};
	}),

	addRule: organizationPermissionProcedure({
		pricing: ["create"],
	}).pricing.addRule.handler(async ({ context, input }) => {
		const row = await createPricingRule(
			{
				...input,
				organizationId: context.activeMembership.organizationId,
			},
			db,
		);
		return formatRule(row);
	}),

	deleteRule: organizationPermissionProcedure({
		pricing: ["delete"],
	}).pricing.deleteRule.handler(async ({ context, input }) => {
		try {
			await deletePricingRule(
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

	getQuote: publicProcedure.pricing.getQuote.handler(async ({ input }) => {
		try {
			return await calculateQuote(
				{
					listingId: input.listingId,
					startsAt: new Date(input.startsAt),
					endsAt: new Date(input.endsAt),
					passengers: input.passengers,
				},
				db,
			);
		} catch (e) {
			if (e instanceof Error && e.message === "NO_PRICING_PROFILE") {
				throw new ORPCError("NOT_FOUND", {
					message: "No pricing profile found for this listing",
				});
			}
			throw e;
		}
	}),
};
