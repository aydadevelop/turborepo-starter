import { db } from "@full-stack-cf-app/db";
import {
	bookingAffiliateAttribution,
	bookingAffiliatePayout,
} from "@full-stack-cf-app/db/schema/affiliate";
import { boat } from "@full-stack-cf-app/db/schema/boat";
import { booking } from "@full-stack-cf-app/db/schema/booking";
import { ORPCError } from "@orpc/server";
import { and, asc, count, desc, eq, gt, lt } from "drizzle-orm";
import {
	organizationPermissionProcedure,
	protectedProcedure,
} from "../../index";
import {
	listAffiliateBookingsInputSchema,
	listAffiliateBookingsOutputSchema,
	listManagedAffiliatePayoutsInputSchema,
	listManagedAffiliatePayoutsOutputSchema,
	processManagedAffiliatePayoutInputSchema,
} from "../booking.schemas";
import { successOutputSchema } from "../shared/schema-utils";
import { reconcileAffiliatePayoutForBooking } from "./services/affiliate";
import { requireActiveMembership } from "./helpers";

const obfuscateRef = (params: { prefix: string; raw: string }) => {
	const normalized = params.raw.replace(/[^a-zA-Z0-9]/g, "");
	if (normalized.length === 0) {
		return `${params.prefix}-***`;
	}
	if (normalized.length <= 6) {
		const head = normalized.slice(0, 2);
		return `${params.prefix}-${head}***`;
	}
	return `${params.prefix}-${normalized.slice(0, 3)}***${normalized.slice(-3)}`;
};

const buildAffiliateCustomerRef = (params: {
	customerUserId: string | null;
	contactEmail: string | null;
	contactPhone: string | null;
	bookingId: string;
}) => {
	const raw =
		params.customerUserId ??
		params.contactEmail ??
		params.contactPhone ??
		params.bookingId;
	return obfuscateRef({
		prefix: "CUS",
		raw,
	});
};

export const affiliateBookingRouter = {
	listAffiliateMine: protectedProcedure
		.route({
			summary: "List my affiliate bookings",
			description:
				"List bookings attributed to the current affiliate user. Customer contact details are always obfuscated.",
		})
		.input(listAffiliateBookingsInputSchema)
		.output(listAffiliateBookingsOutputSchema)
		.handler(async ({ context, input }) => {
			const userId = context.session?.user?.id;
			if (!userId) {
				throw new ORPCError("UNAUTHORIZED");
			}

			const where = and(
				eq(bookingAffiliateAttribution.affiliateUserId, userId),
				input.organizationId
					? eq(bookingAffiliateAttribution.organizationId, input.organizationId)
					: undefined,
				input.status ? eq(booking.status, input.status) : undefined,
				input.from ? gt(booking.endsAt, input.from) : undefined,
				input.to ? lt(booking.startsAt, input.to) : undefined
			);

			if (!where) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			const orderDir = input.sortOrder === "asc" ? asc : desc;
			const sortColumnMap = {
				startsAt: booking.startsAt,
				createdAt: booking.createdAt,
				totalPriceCents: booking.totalPriceCents,
			} as const;
			const orderByExpr = orderDir(sortColumnMap[input.sortBy]);

			const [countResult, items] = await Promise.all([
				db
					.select({ total: count() })
					.from(bookingAffiliateAttribution)
					.innerJoin(
						booking,
						eq(booking.id, bookingAffiliateAttribution.bookingId)
					)
					.where(where),
				db
					.select({
						bookingId: booking.id,
						referralCode: bookingAffiliateAttribution.referralCode,
						boatId: booking.boatId,
						boatName: boat.name,
						startsAt: booking.startsAt,
						endsAt: booking.endsAt,
						timezone: booking.timezone,
						status: booking.status,
						paymentStatus: booking.paymentStatus,
						passengers: booking.passengers,
						customerUserId: booking.customerUserId,
						contactEmail: booking.contactEmail,
						contactPhone: booking.contactPhone,
						payoutId: bookingAffiliatePayout.id,
						payoutStatus: bookingAffiliatePayout.status,
						commissionAmountCents: bookingAffiliatePayout.commissionAmountCents,
						commissionCurrency: bookingAffiliatePayout.currency,
						payoutEligibleAt: bookingAffiliatePayout.eligibleAt,
						payoutPaidAt: bookingAffiliatePayout.paidAt,
						payoutVoidedAt: bookingAffiliatePayout.voidedAt,
						payoutVoidReason: bookingAffiliatePayout.voidReason,
					})
					.from(bookingAffiliateAttribution)
					.innerJoin(
						booking,
						eq(booking.id, bookingAffiliateAttribution.bookingId)
					)
					.innerJoin(boat, eq(boat.id, booking.boatId))
					.leftJoin(
						bookingAffiliatePayout,
						eq(bookingAffiliatePayout.bookingId, booking.id)
					)
					.where(where)
					.orderBy(orderByExpr)
					.limit(input.limit)
					.offset(input.offset),
			]);

			const reconciledPayoutByBookingId = new Map<
				string,
				typeof bookingAffiliatePayout.$inferSelect | null
			>();
			await Promise.all(
				items.map(async (item) => {
					const payout = await reconcileAffiliatePayoutForBooking({
						bookingId: item.bookingId,
					});
					reconciledPayoutByBookingId.set(item.bookingId, payout);
				})
			);

			return {
				items: items.map((item) => {
					const reconciledPayout =
						reconciledPayoutByBookingId.get(item.bookingId) ?? null;
					return {
						bookingRef: obfuscateRef({
							prefix: "BKG",
							raw: item.bookingId,
						}),
						customerRef: buildAffiliateCustomerRef({
							customerUserId: item.customerUserId,
							contactEmail: item.contactEmail,
							contactPhone: item.contactPhone,
							bookingId: item.bookingId,
						}),
						referralCode: item.referralCode,
						boatId: item.boatId,
						boatName: item.boatName,
						startsAt: item.startsAt,
						endsAt: item.endsAt,
						timezone: item.timezone,
						status: item.status,
						paymentStatus: item.paymentStatus,
						passengers: item.passengers,
						commissionAmountCents:
							reconciledPayout?.commissionAmountCents ??
							item.commissionAmountCents ??
							0,
						commissionCurrency:
							reconciledPayout?.currency ?? item.commissionCurrency ?? "RUB",
						payoutStatus:
							reconciledPayout?.status ?? item.payoutStatus ?? "pending",
						payoutEligibleAt:
							reconciledPayout?.eligibleAt ?? item.payoutEligibleAt ?? null,
						payoutPaidAt: reconciledPayout?.paidAt ?? item.payoutPaidAt ?? null,
						payoutVoidedAt:
							reconciledPayout?.voidedAt ?? item.payoutVoidedAt ?? null,
						payoutVoidReason:
							reconciledPayout?.voidReason ?? item.payoutVoidReason ?? null,
					};
				}),
				total: Number(countResult[0]?.total ?? 0),
			};
		}),

	affiliatePayoutListManaged: organizationPermissionProcedure({
		booking: ["read"],
	})
		.route({
			summary: "List managed affiliate payouts",
			description:
				"List affiliate payout records for the active organization with booking context.",
		})
		.input(listManagedAffiliatePayoutsInputSchema)
		.output(listManagedAffiliatePayoutsOutputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			const organizationId =
				input.organizationId ?? activeMembership.organizationId;
			if (organizationId !== activeMembership.organizationId) {
				throw new ORPCError("FORBIDDEN");
			}

			const where = and(
				eq(bookingAffiliatePayout.organizationId, organizationId),
				input.affiliateUserId
					? eq(bookingAffiliatePayout.affiliateUserId, input.affiliateUserId)
					: undefined,
				input.status
					? eq(bookingAffiliatePayout.status, input.status)
					: undefined,
				input.from ? gt(booking.endsAt, input.from) : undefined,
				input.to ? lt(booking.startsAt, input.to) : undefined
			);
			if (!where) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			const [countResult, items] = await Promise.all([
				db
					.select({ total: count() })
					.from(bookingAffiliatePayout)
					.innerJoin(booking, eq(booking.id, bookingAffiliatePayout.bookingId))
					.where(where),
				db
					.select({
						payoutId: bookingAffiliatePayout.id,
						bookingId: booking.id,
						affiliateUserId: bookingAffiliatePayout.affiliateUserId,
						referralCode: bookingAffiliateAttribution.referralCode,
						commissionAmountCents: bookingAffiliatePayout.commissionAmountCents,
						currency: bookingAffiliatePayout.currency,
						status: bookingAffiliatePayout.status,
						eligibleAt: bookingAffiliatePayout.eligibleAt,
						paidAt: bookingAffiliatePayout.paidAt,
						voidedAt: bookingAffiliatePayout.voidedAt,
						voidReason: bookingAffiliatePayout.voidReason,
						startsAt: booking.startsAt,
						endsAt: booking.endsAt,
						boatId: booking.boatId,
						boatName: boat.name,
					})
					.from(bookingAffiliatePayout)
					.innerJoin(booking, eq(booking.id, bookingAffiliatePayout.bookingId))
					.innerJoin(
						bookingAffiliateAttribution,
						eq(
							bookingAffiliateAttribution.id,
							bookingAffiliatePayout.attributionId
						)
					)
					.innerJoin(boat, eq(boat.id, booking.boatId))
					.where(where)
					.orderBy(desc(booking.startsAt))
					.limit(input.limit)
					.offset(input.offset),
			]);

			const reconciledPayoutByBookingId = new Map<
				string,
				typeof bookingAffiliatePayout.$inferSelect | null
			>();
			await Promise.all(
				items.map(async (item) => {
					const payout = await reconcileAffiliatePayoutForBooking({
						bookingId: item.bookingId,
					});
					reconciledPayoutByBookingId.set(item.bookingId, payout);
				})
			);

			return {
				items: items.map((item) => {
					const reconciledPayout =
						reconciledPayoutByBookingId.get(item.bookingId) ?? null;
					return {
						payoutId: reconciledPayout?.id ?? item.payoutId,
						bookingId: item.bookingId,
						bookingRef: obfuscateRef({
							prefix: "BKG",
							raw: item.bookingId,
						}),
						affiliateUserId: item.affiliateUserId,
						referralCode: item.referralCode,
						commissionAmountCents:
							reconciledPayout?.commissionAmountCents ??
							item.commissionAmountCents,
						currency: reconciledPayout?.currency ?? item.currency,
						status: reconciledPayout?.status ?? item.status,
						eligibleAt: reconciledPayout?.eligibleAt ?? item.eligibleAt,
						paidAt: reconciledPayout?.paidAt ?? item.paidAt,
						voidedAt: reconciledPayout?.voidedAt ?? item.voidedAt,
						voidReason: reconciledPayout?.voidReason ?? item.voidReason,
						startsAt: item.startsAt,
						endsAt: item.endsAt,
						boatId: item.boatId,
						boatName: item.boatName,
					};
				}),
				total: Number(countResult[0]?.total ?? 0),
			};
		}),

	affiliatePayoutProcessManaged: organizationPermissionProcedure({
		booking: ["update"],
	})
		.route({
			summary: "Process affiliate payout",
			description:
				"Mark an eligible affiliate payout as paid, or void a non-paid payout.",
		})
		.input(processManagedAffiliatePayoutInputSchema)
		.output(successOutputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			const [managedPayout] = await db
				.select()
				.from(bookingAffiliatePayout)
				.where(
					and(
						eq(bookingAffiliatePayout.id, input.payoutId),
						eq(
							bookingAffiliatePayout.organizationId,
							activeMembership.organizationId
						)
					)
				)
				.limit(1);

			if (!managedPayout) {
				throw new ORPCError("NOT_FOUND");
			}

			const reconciled =
				(await reconcileAffiliatePayoutForBooking({
					bookingId: managedPayout.bookingId,
				})) ?? managedPayout;

			if (input.status === "paid" && reconciled.status !== "eligible") {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"Affiliate payout can be paid only after booking is completed and not cancelled/refunded.",
				});
			}

			if (input.status === "voided" && reconciled.status === "paid") {
				throw new ORPCError("BAD_REQUEST", {
					message: "Paid affiliate payout cannot be voided.",
				});
			}

			const now = new Date();
			await db
				.update(bookingAffiliatePayout)
				.set({
					status: input.status,
					paidAt: input.status === "paid" ? now : null,
					voidedAt: input.status === "voided" ? now : null,
					voidReason: input.status === "voided" ? input.note : null,
					externalPayoutRef:
						input.externalPayoutRef ?? reconciled.externalPayoutRef,
					updatedAt: now,
				})
				.where(eq(bookingAffiliatePayout.id, reconciled.id));

			return { success: true };
		}),
};
