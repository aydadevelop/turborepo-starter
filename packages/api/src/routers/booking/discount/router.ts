import { db } from "@full-stack-cf-app/db";
import { bookingDiscountCode } from "@full-stack-cf-app/db/schema/booking";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import z from "zod";
import { organizationPermissionProcedure } from "../../../index";
import {
	discountCodeOutputSchema,
	isValidDiscountCode,
	listManagedDiscountCodesInputSchema,
	normalizeDiscountCode,
	setManagedDiscountCodeActiveInputSchema,
	upsertManagedDiscountCodeInputSchema,
} from "../../booking.schemas";
import { successOutputSchema } from "../../shared/schema-utils";
import {
	requireActiveMembership,
	requireManagedBoat,
	requireManagedDiscountCode,
	requireSessionUserId,
} from "../helpers";

export const discountCodeBookingRouter = {
	discountCodeListManaged: organizationPermissionProcedure({
		booking: ["read"],
	})
		.route({
			summary: "List managed discount codes",
			description:
				"List discount codes for the organization, with optional filtering by boat, status, or search term.",
		})
		.input(listManagedDiscountCodesInputSchema)
		.output(z.array(discountCodeOutputSchema))
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			if (input.boatId) {
				await requireManagedBoat(input.boatId, activeMembership.organizationId);
			}

			const where = and(
				eq(bookingDiscountCode.organizationId, activeMembership.organizationId),
				input.activeOnly ? eq(bookingDiscountCode.isActive, true) : undefined,
				input.boatId
					? eq(bookingDiscountCode.appliesToBoatId, input.boatId)
					: undefined,
				input.search
					? sql`(lower(${bookingDiscountCode.code}) like ${`%${input.search.toLowerCase()}%`} or lower(${bookingDiscountCode.name}) like ${`%${input.search.toLowerCase()}%`})`
					: undefined
			);

			if (!where) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return await db
				.select()
				.from(bookingDiscountCode)
				.where(where)
				.orderBy(desc(bookingDiscountCode.createdAt))
				.limit(input.limit);
		}),

	discountCodeUpsertManaged: organizationPermissionProcedure({
		booking: ["update"],
	})
		.route({
			summary: "Create or update discount code",
			description:
				"Create a new discount code or update an existing one. The code is normalized to uppercase.",
		})
		.input(upsertManagedDiscountCodeInputSchema)
		.output(discountCodeOutputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			const sessionUserId = requireSessionUserId(context);
			if (input.appliesToBoatId) {
				await requireManagedBoat(
					input.appliesToBoatId,
					activeMembership.organizationId
				);
			}

			const normalizedCode = normalizeDiscountCode(input.code);
			if (!isValidDiscountCode(normalizedCode)) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Invalid discount code format",
				});
			}

			const discountCodeId = input.id ?? crypto.randomUUID();

			if (input.id) {
				await requireManagedDiscountCode(
					input.id,
					activeMembership.organizationId
				);

				await db
					.update(bookingDiscountCode)
					.set({
						code: normalizedCode,
						name: input.name,
						description: input.description,
						discountType: input.discountType,
						discountValue: input.discountValue,
						maxDiscountCents: input.maxDiscountCents,
						minimumSubtotalCents: input.minimumSubtotalCents,
						validFrom: input.validFrom,
						validTo: input.validTo,
						usageLimit: input.usageLimit,
						perCustomerLimit: input.perCustomerLimit,
						appliesToBoatId: input.appliesToBoatId,
						isActive: input.isActive,
						metadata: input.metadata,
						updatedAt: new Date(),
					})
					.where(eq(bookingDiscountCode.id, discountCodeId));
			} else {
				await db.insert(bookingDiscountCode).values({
					id: discountCodeId,
					organizationId: activeMembership.organizationId,
					code: normalizedCode,
					name: input.name,
					description: input.description,
					discountType: input.discountType,
					discountValue: input.discountValue,
					maxDiscountCents: input.maxDiscountCents,
					minimumSubtotalCents: input.minimumSubtotalCents,
					validFrom: input.validFrom,
					validTo: input.validTo,
					usageLimit: input.usageLimit,
					usageCount: 0,
					perCustomerLimit: input.perCustomerLimit,
					appliesToBoatId: input.appliesToBoatId,
					isActive: input.isActive,
					createdByUserId: sessionUserId,
					metadata: input.metadata,
					createdAt: new Date(),
					updatedAt: new Date(),
				});
			}

			const [savedCode] = await db
				.select()
				.from(bookingDiscountCode)
				.where(eq(bookingDiscountCode.id, discountCodeId))
				.limit(1);

			if (!savedCode) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return savedCode;
		}),

	discountCodeSetActiveManaged: organizationPermissionProcedure({
		booking: ["update"],
	})
		.route({
			summary: "Toggle discount code active status",
			description: "Enable or disable a discount code.",
		})
		.input(setManagedDiscountCodeActiveInputSchema)
		.output(successOutputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			await requireManagedDiscountCode(
				input.discountCodeId,
				activeMembership.organizationId
			);

			await db
				.update(bookingDiscountCode)
				.set({
					isActive: input.isActive,
					updatedAt: new Date(),
				})
				.where(eq(bookingDiscountCode.id, input.discountCodeId));

			return { success: true };
		}),
};
