import { db } from "@full-stack-cf-app/db";
import {
	boatPricingProfile,
	boatPricingRule,
	platformFeeConfig,
} from "@full-stack-cf-app/db/schema/boat";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import z from "zod";
import {
	boatPricingProfileOutputSchema,
	boatPricingRuleOutputSchema,
	createBoatPricingProfileInputSchema,
	createBoatPricingRuleInputSchema,
	deleteBoatPricingRuleInputSchema,
	listBoatPricingProfilesInputSchema,
	listBoatPricingRulesInputSchema,
	setDefaultBoatPricingProfileInputSchema,
} from "../../contracts/boat";
import { successOutputSchema } from "../../contracts/shared";
import { organizationPermissionProcedure } from "../../index";
import { insertAndReturn } from "../../lib/db-helpers";
import { requireSessionUserId } from "../shared/auth-utils";
import { requireManagedBoat } from "./access";

export const boatPricingRouter = {
	profileList: organizationPermissionProcedure({
		boat: ["read"],
	})
		.route({
			summary: "List pricing profiles",
		})
		.input(listBoatPricingProfilesInputSchema)
		.output(z.array(boatPricingProfileOutputSchema))
		.handler(async ({ context, input }) => {
			await requireManagedBoat(
				input.boatId,
				context.activeMembership.organizationId
			);

			const where = and(
				eq(boatPricingProfile.boatId, input.boatId),
				input.includeArchived
					? undefined
					: isNull(boatPricingProfile.archivedAt)
			);

			if (!where) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return await db
				.select()
				.from(boatPricingProfile)
				.where(where)
				.orderBy(desc(boatPricingProfile.validFrom));
		}),

	profileCreate: organizationPermissionProcedure({
		boat: ["update"],
	})
		.route({
			summary: "Create a pricing profile",
		})
		.input(createBoatPricingProfileInputSchema)
		.output(boatPricingProfileOutputSchema)
		.handler(async ({ context, input }) => {
			const sessionUserId = requireSessionUserId(context);
			await requireManagedBoat(
				input.boatId,
				context.activeMembership.organizationId
			);

			if (
				input.validFrom &&
				input.validTo &&
				input.validFrom >= input.validTo
			) {
				throw new ORPCError("BAD_REQUEST", {
					message: "validTo must be after validFrom",
				});
			}

			if (input.isDefault) {
				await db
					.update(boatPricingProfile)
					.set({
						isDefault: false,
						updatedAt: new Date(),
					})
					.where(eq(boatPricingProfile.boatId, input.boatId));
			}

			const currency = input.currency.toUpperCase();
			const [activeFeeConfig] = await db
				.select()
				.from(platformFeeConfig)
				.where(
					and(
						eq(platformFeeConfig.currency, currency),
						eq(platformFeeConfig.isActive, true)
					)
				)
				.limit(1);

			return await insertAndReturn(boatPricingProfile, {
				id: crypto.randomUUID(),
				boatId: input.boatId,
				name: input.name,
				currency,
				baseHourlyPriceCents: input.baseHourlyPriceCents,
				minimumHours: input.minimumHours,
				depositPercentage: input.depositPercentage,
				serviceFeePercentage: input.serviceFeePercentage,
				affiliateFeePercentage: activeFeeConfig?.affiliateFeePercentage ?? 0,
				taxPercentage: activeFeeConfig?.taxPercentage ?? 0,
				acquiringFeePercentage: activeFeeConfig?.acquiringFeePercentage ?? 0,
				validFrom: input.validFrom ?? new Date(),
				validTo: input.validTo,
				isDefault: input.isDefault,
				createdByUserId: sessionUserId,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
		}),

	profileSetDefault: organizationPermissionProcedure({
		boat: ["update"],
	})
		.route({
			summary: "Set default pricing profile",
		})
		.input(setDefaultBoatPricingProfileInputSchema)
		.output(successOutputSchema)
		.handler(async ({ context, input }) => {
			await requireManagedBoat(
				input.boatId,
				context.activeMembership.organizationId
			);

			const [profile] = await db
				.select()
				.from(boatPricingProfile)
				.where(
					and(
						eq(boatPricingProfile.id, input.pricingProfileId),
						eq(boatPricingProfile.boatId, input.boatId)
					)
				)
				.limit(1);

			if (!profile) {
				throw new ORPCError("NOT_FOUND");
			}

			await db
				.update(boatPricingProfile)
				.set({
					isDefault: false,
					updatedAt: new Date(),
				})
				.where(eq(boatPricingProfile.boatId, input.boatId));

			await db
				.update(boatPricingProfile)
				.set({
					isDefault: true,
					updatedAt: new Date(),
				})
				.where(eq(boatPricingProfile.id, input.pricingProfileId));

			return { success: true };
		}),

	ruleList: organizationPermissionProcedure({
		boat: ["read"],
	})
		.route({
			summary: "List pricing rules",
		})
		.input(listBoatPricingRulesInputSchema)
		.output(z.array(boatPricingRuleOutputSchema))
		.handler(async ({ context, input }) => {
			await requireManagedBoat(
				input.boatId,
				context.activeMembership.organizationId
			);

			const where = and(
				eq(boatPricingRule.boatId, input.boatId),
				input.pricingProfileId
					? eq(boatPricingRule.pricingProfileId, input.pricingProfileId)
					: undefined
			);

			if (!where) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return await db
				.select()
				.from(boatPricingRule)
				.where(where)
				.orderBy(desc(boatPricingRule.priority));
		}),

	ruleCreate: organizationPermissionProcedure({
		boat: ["update"],
	})
		.route({
			summary: "Create a pricing rule",
		})
		.input(createBoatPricingRuleInputSchema)
		.output(boatPricingRuleOutputSchema)
		.handler(async ({ context, input }) => {
			await requireManagedBoat(
				input.boatId,
				context.activeMembership.organizationId
			);

			if (input.pricingProfileId) {
				const [pricingProfile] = await db
					.select()
					.from(boatPricingProfile)
					.where(
						and(
							eq(boatPricingProfile.id, input.pricingProfileId),
							eq(boatPricingProfile.boatId, input.boatId)
						)
					)
					.limit(1);

				if (!pricingProfile) {
					throw new ORPCError("BAD_REQUEST", {
						message: "Pricing profile does not belong to this boat",
					});
				}
			}

			try {
				JSON.parse(input.conditionJson);
			} catch {
				throw new ORPCError("BAD_REQUEST", {
					message: "conditionJson must be valid JSON",
				});
			}

			return await insertAndReturn(boatPricingRule, {
				id: crypto.randomUUID(),
				boatId: input.boatId,
				pricingProfileId: input.pricingProfileId,
				name: input.name,
				ruleType: input.ruleType,
				conditionJson: input.conditionJson,
				adjustmentType: input.adjustmentType,
				adjustmentValue: input.adjustmentValue,
				priority: input.priority,
				isActive: input.isActive,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
		}),

	ruleDelete: organizationPermissionProcedure({
		boat: ["update"],
	})
		.route({
			summary: "Delete a pricing rule",
		})
		.input(deleteBoatPricingRuleInputSchema)
		.output(successOutputSchema)
		.handler(async ({ context, input }) => {
			await requireManagedBoat(
				input.boatId,
				context.activeMembership.organizationId
			);

			const [existingRule] = await db
				.select()
				.from(boatPricingRule)
				.where(
					and(
						eq(boatPricingRule.id, input.ruleId),
						eq(boatPricingRule.boatId, input.boatId)
					)
				)
				.limit(1);

			if (!existingRule) {
				throw new ORPCError("NOT_FOUND");
			}

			await db
				.delete(boatPricingRule)
				.where(
					and(
						eq(boatPricingRule.id, input.ruleId),
						eq(boatPricingRule.boatId, input.boatId)
					)
				);

			return { success: true };
		}),
};
