import { db } from "@full-stack-cf-app/db";
import { boatMinimumDurationRule } from "@full-stack-cf-app/db/schema/boat";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import z from "zod";

import { organizationPermissionProcedure } from "../../index";
import { buildUpdatePayload, insertAndReturn } from "../../lib/db-helpers";
import { successOutputSchema } from "../shared/schema-utils";
import { requireManagedBoat } from "./access";
import {
	boatMinimumDurationRuleOutputSchema,
	createBoatMinimumDurationRuleInputSchema,
	deleteBoatMinimumDurationRuleInputSchema,
	listBoatMinimumDurationRulesInputSchema,
	updateBoatMinimumDurationRuleInputSchema,
} from "./schemas";

export const boatMinDurationRouter = {
	list: organizationPermissionProcedure({
		boat: ["read"],
	})
		.route({
			summary: "List minimum duration rules for a boat",
		})
		.input(listBoatMinimumDurationRulesInputSchema)
		.output(z.array(boatMinimumDurationRuleOutputSchema))
		.handler(async ({ context, input }) => {
			await requireManagedBoat(
				input.boatId,
				context.activeMembership.organizationId
			);

			return await db
				.select()
				.from(boatMinimumDurationRule)
				.where(eq(boatMinimumDurationRule.boatId, input.boatId));
		}),

	create: organizationPermissionProcedure({
		boat: ["update"],
	})
		.route({
			summary: "Create a minimum duration rule",
		})
		.input(createBoatMinimumDurationRuleInputSchema)
		.output(boatMinimumDurationRuleOutputSchema)
		.handler(async ({ context, input }) => {
			await requireManagedBoat(
				input.boatId,
				context.activeMembership.organizationId
			);

			return await insertAndReturn(boatMinimumDurationRule, {
				id: crypto.randomUUID(),
				boatId: input.boatId,
				name: input.name,
				startHour: input.startHour,
				startMinute: input.startMinute,
				endHour: input.endHour,
				endMinute: input.endMinute,
				minimumDurationMinutes: input.minimumDurationMinutes,
				daysOfWeek: input.daysOfWeek,
				isActive: input.isActive,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
		}),

	update: organizationPermissionProcedure({
		boat: ["update"],
	})
		.route({
			summary: "Update a minimum duration rule",
		})
		.input(updateBoatMinimumDurationRuleInputSchema)
		.output(boatMinimumDurationRuleOutputSchema)
		.handler(async ({ context, input }) => {
			await requireManagedBoat(
				input.boatId,
				context.activeMembership.organizationId
			);

			const [existing] = await db
				.select()
				.from(boatMinimumDurationRule)
				.where(
					and(
						eq(boatMinimumDurationRule.id, input.ruleId),
						eq(boatMinimumDurationRule.boatId, input.boatId)
					)
				)
				.limit(1);

			if (!existing) {
				throw new ORPCError("NOT_FOUND");
			}

			const updateFields = buildUpdatePayload({
				name: input.name,
				startHour: input.startHour,
				startMinute: input.startMinute,
				endHour: input.endHour,
				endMinute: input.endMinute,
				minimumDurationMinutes: input.minimumDurationMinutes,
				daysOfWeek: input.daysOfWeek,
				isActive: input.isActive,
			});

			await db
				.update(boatMinimumDurationRule)
				.set(updateFields)
				.where(
					and(
						eq(boatMinimumDurationRule.id, input.ruleId),
						eq(boatMinimumDurationRule.boatId, input.boatId)
					)
				);

			const [updated] = await db
				.select()
				.from(boatMinimumDurationRule)
				.where(eq(boatMinimumDurationRule.id, input.ruleId))
				.limit(1);

			if (!updated) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return updated;
		}),

	delete: organizationPermissionProcedure({
		boat: ["update"],
	})
		.route({
			summary: "Delete a minimum duration rule",
		})
		.input(deleteBoatMinimumDurationRuleInputSchema)
		.output(successOutputSchema)
		.handler(async ({ context, input }) => {
			await requireManagedBoat(
				input.boatId,
				context.activeMembership.organizationId
			);

			const [existing] = await db
				.select()
				.from(boatMinimumDurationRule)
				.where(
					and(
						eq(boatMinimumDurationRule.id, input.ruleId),
						eq(boatMinimumDurationRule.boatId, input.boatId)
					)
				)
				.limit(1);

			if (!existing) {
				throw new ORPCError("NOT_FOUND");
			}

			await db
				.delete(boatMinimumDurationRule)
				.where(
					and(
						eq(boatMinimumDurationRule.id, input.ruleId),
						eq(boatMinimumDurationRule.boatId, input.boatId)
					)
				);

			return { success: true };
		}),
};
