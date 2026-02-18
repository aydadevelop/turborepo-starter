import { db } from "@full-stack-cf-app/db";
import { platformFeeConfig } from "@full-stack-cf-app/db/schema/boat";
import { and, eq } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import z from "zod";
import { successOutputSchema } from "../../contracts/shared";
import { insertAndReturn } from "../../lib/db-helpers";
import { adminProcedure } from "../shared/admin";
import { requireSessionUserId } from "../shared/auth-utils";

const platformFeeConfigOutputSchema = createSelectSchema(platformFeeConfig);

const upsertPlatformFeeConfigInputSchema = z.object({
	id: z.string().trim().optional(),
	currency: z.string().trim().length(3).default("RUB"),
	affiliateFeePercentage: z.number().int().min(0).max(100).default(15),
	taxPercentage: z.number().int().min(0).max(100).default(7),
	acquiringFeePercentage: z.number().int().min(0).max(100).default(5),
	isActive: z.boolean().default(true),
});

const listPlatformFeeConfigInputSchema = z.object({
	currency: z.string().trim().length(3).optional(),
	includeInactive: z.boolean().optional().default(false),
});

export const adminFeeConfigRouter = {
	list: adminProcedure
		.route({
			summary: "List platform fee configs",
			description: "List all platform fee configurations. Admin only.",
		})
		.input(listPlatformFeeConfigInputSchema)
		.output(z.array(platformFeeConfigOutputSchema))
		.handler(async ({ input }) => {
			const where = and(
				input.currency
					? eq(platformFeeConfig.currency, input.currency.toUpperCase())
					: undefined,
				input.includeInactive ? undefined : eq(platformFeeConfig.isActive, true)
			);

			return await db
				.select()
				.from(platformFeeConfig)
				.where(where ?? undefined);
		}),

	upsert: adminProcedure
		.route({
			summary: "Create or update platform fee config",
			description:
				"Set the platform-wide fee percentages for a currency. Admin only.",
		})
		.input(upsertPlatformFeeConfigInputSchema)
		.output(platformFeeConfigOutputSchema)
		.handler(async ({ context, input }) => {
			const sessionUserId = requireSessionUserId(context);
			const currency = input.currency.toUpperCase();

			if (input.id) {
				const [existing] = await db
					.select()
					.from(platformFeeConfig)
					.where(eq(platformFeeConfig.id, input.id))
					.limit(1);

				if (existing) {
					await db
						.update(platformFeeConfig)
						.set({
							currency,
							affiliateFeePercentage: input.affiliateFeePercentage,
							taxPercentage: input.taxPercentage,
							acquiringFeePercentage: input.acquiringFeePercentage,
							isActive: input.isActive,
							updatedAt: new Date(),
						})
						.where(eq(platformFeeConfig.id, input.id));

					const [updated] = await db
						.select()
						.from(platformFeeConfig)
						.where(eq(platformFeeConfig.id, input.id))
						.limit(1);

					if (!updated) {
						throw new Error("Failed to update platform fee config");
					}

					return updated;
				}
			}

			return await insertAndReturn(platformFeeConfig, {
				id: input.id ?? crypto.randomUUID(),
				currency,
				affiliateFeePercentage: input.affiliateFeePercentage,
				taxPercentage: input.taxPercentage,
				acquiringFeePercentage: input.acquiringFeePercentage,
				isActive: input.isActive,
				createdByUserId: sessionUserId,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
		}),

	deactivate: adminProcedure
		.route({
			summary: "Deactivate a fee config",
			description: "Soft-deactivate a platform fee configuration. Admin only.",
		})
		.input(z.object({ id: z.string().trim().min(1) }))
		.output(successOutputSchema)
		.handler(async ({ input }) => {
			await db
				.update(platformFeeConfig)
				.set({ isActive: false, updatedAt: new Date() })
				.where(eq(platformFeeConfig.id, input.id));

			return { success: true };
		}),
};
