import { db } from "@full-stack-cf-app/db";
import {
	boatAvailabilityBlock,
	boatAvailabilityRule,
} from "@full-stack-cf-app/db/schema/boat";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, gt, lt } from "drizzle-orm";
import z from "zod";

import { organizationPermissionProcedure } from "../../index";
import { insertAndReturn } from "../../lib/db-helpers";
import { requireSessionUserId } from "../shared/auth-utils";
import { successOutputSchema } from "../shared/schema-utils";
import { requireCalendarConnectionForBoat, requireManagedBoat } from "./access";
import {
	boatAvailabilityBlockOutputSchema,
	boatAvailabilityRuleOutputSchema,
	createBoatAvailabilityBlockInputSchema,
	deleteBoatAvailabilityBlockInputSchema,
	listBoatAvailabilityBlocksInputSchema,
	listBoatAvailabilityRulesInputSchema,
	replaceBoatAvailabilityRulesInputSchema,
} from "./schemas";

export const boatAvailabilityRouter = {
	ruleList: organizationPermissionProcedure({
		boat: ["read"],
	})
		.route({
			summary: "List boat availability rules",
		})
		.input(listBoatAvailabilityRulesInputSchema)
		.output(z.array(boatAvailabilityRuleOutputSchema))
		.handler(async ({ context, input }) => {
			await requireManagedBoat(
				input.boatId,
				context.activeMembership.organizationId
			);
			return await db
				.select()
				.from(boatAvailabilityRule)
				.where(eq(boatAvailabilityRule.boatId, input.boatId));
		}),

	ruleReplace: organizationPermissionProcedure({
		boat: ["update"],
	})
		.route({
			summary: "Replace boat availability rules",
			description:
				"Atomically replaces all weekly availability rules for a boat.",
		})
		.input(replaceBoatAvailabilityRulesInputSchema)
		.output(z.array(boatAvailabilityRuleOutputSchema))
		.handler(async ({ context, input }) => {
			await requireManagedBoat(
				input.boatId,
				context.activeMembership.organizationId
			);

			await db
				.delete(boatAvailabilityRule)
				.where(eq(boatAvailabilityRule.boatId, input.boatId));

			if (input.rules.length > 0) {
				await db.insert(boatAvailabilityRule).values(
					input.rules.map((rule) => ({
						id: crypto.randomUUID(),
						boatId: input.boatId,
						dayOfWeek: rule.dayOfWeek,
						startMinute: rule.startMinute,
						endMinute: rule.endMinute,
						isActive: rule.isActive,
						createdAt: new Date(),
						updatedAt: new Date(),
					}))
				);
			}

			return await db
				.select()
				.from(boatAvailabilityRule)
				.where(eq(boatAvailabilityRule.boatId, input.boatId));
		}),

	blockList: organizationPermissionProcedure({
		boat: ["read"],
	})
		.route({
			summary: "List boat availability blocks",
		})
		.input(listBoatAvailabilityBlocksInputSchema)
		.output(z.array(boatAvailabilityBlockOutputSchema))
		.handler(async ({ context, input }) => {
			await requireManagedBoat(
				input.boatId,
				context.activeMembership.organizationId
			);

			const where = and(
				eq(boatAvailabilityBlock.boatId, input.boatId),
				input.source
					? eq(boatAvailabilityBlock.source, input.source)
					: undefined,
				input.from ? gt(boatAvailabilityBlock.endsAt, input.from) : undefined,
				input.to ? lt(boatAvailabilityBlock.startsAt, input.to) : undefined
			);

			if (!where) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return await db
				.select()
				.from(boatAvailabilityBlock)
				.where(where)
				.orderBy(desc(boatAvailabilityBlock.startsAt));
		}),

	blockCreate: organizationPermissionProcedure({
		boat: ["update"],
	})
		.route({
			summary: "Create an availability block",
			description: "Block a time range to prevent bookings.",
		})
		.input(createBoatAvailabilityBlockInputSchema)
		.output(boatAvailabilityBlockOutputSchema)
		.handler(async ({ context, input }) => {
			const sessionUserId = requireSessionUserId(context);
			await requireManagedBoat(
				input.boatId,
				context.activeMembership.organizationId
			);

			if (input.calendarConnectionId) {
				await requireCalendarConnectionForBoat(
					input.calendarConnectionId,
					input.boatId
				);
			}

			return await insertAndReturn(boatAvailabilityBlock, {
				id: crypto.randomUUID(),
				boatId: input.boatId,
				calendarConnectionId: input.calendarConnectionId,
				source: input.source,
				externalRef: input.externalRef,
				startsAt: input.startsAt,
				endsAt: input.endsAt,
				reason: input.reason,
				createdByUserId: sessionUserId,
				isActive: input.isActive,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
		}),

	blockDelete: organizationPermissionProcedure({
		boat: ["update"],
	})
		.route({
			summary: "Delete an availability block",
		})
		.input(deleteBoatAvailabilityBlockInputSchema)
		.output(successOutputSchema)
		.handler(async ({ context, input }) => {
			await requireManagedBoat(
				input.boatId,
				context.activeMembership.organizationId
			);

			const [existingBlock] = await db
				.select()
				.from(boatAvailabilityBlock)
				.where(
					and(
						eq(boatAvailabilityBlock.id, input.blockId),
						eq(boatAvailabilityBlock.boatId, input.boatId)
					)
				)
				.limit(1);

			if (!existingBlock) {
				throw new ORPCError("NOT_FOUND");
			}

			await db
				.delete(boatAvailabilityBlock)
				.where(
					and(
						eq(boatAvailabilityBlock.id, input.blockId),
						eq(boatAvailabilityBlock.boatId, input.boatId)
					)
				);

			return { success: true };
		}),
};
