import { db } from "@full-stack-cf-app/db";
import { boat } from "@full-stack-cf-app/db/schema/boat";
import {
	booking,
	bookingCalendarLink,
	bookingDiscountApplication,
} from "@full-stack-cf-app/db/schema/booking";
import { ORPCError } from "@orpc/server";
import { and, asc, count, desc, eq, gt, lt, sql } from "drizzle-orm";
import {
	cancelManagedBookingInputSchema,
	createManagedBookingInputSchema,
	createManagedBookingOutputSchema,
	getManagedBookingInputSchema,
	getManagedBookingOutputSchema,
	listManagedBookingsInputSchema,
	listManagedBookingsOutputSchema,
	listMineBookingsInputSchema,
	listMineBookingsOutputSchema,
} from "../../contracts/booking";
import { successOutputSchema } from "../../contracts/shared";
import {
	organizationPermissionProcedure,
	protectedProcedure,
} from "../../index";
import { resolveBookingNotificationUserIds } from "../../lib/booking-notification-recipients";
import { buildRecipients, formatRefundAmount } from "../../lib/event-bus";
import {
	applyCancellationPolicyAndRefund,
	assertCancellationPolicyReasonInput,
} from "./cancellation/policy.service";
import { resolveBookingDiscount } from "./discount/resolution";
import {
	requireActiveMembership,
	requireManagedBoat,
	requireManagedBooking,
	requireManagedCalendarConnection,
	requireSessionUserId,
} from "./helpers";
import {
	assertBookingActionAllowedByWindow,
	loadOrganizationBookingActionPolicyProfile,
} from "./services/action-policy";
import { reconcileAffiliatePayoutForBooking } from "./services/affiliate";
import {
	cancelBookingAndSync,
	ensureNoExternalCalendarOverlap,
} from "./services/calendar-sync";
import { enqueueBookingExpirationCheck } from "./services/expiration";
import {
	ensureNoAvailabilityBlockOverlap,
	ensureNoBookingOverlap,
} from "./services/overlap";
import { createManagedBookingRecord } from "./services/record";

export const coreBookingRouter = {
	listMine: protectedProcedure
		.route({
			summary: "List my bookings",
			description:
				"List bookings where the current user is the customer. No organization required.",
		})
		.input(listMineBookingsInputSchema)
		.output(listMineBookingsOutputSchema)
		.handler(async ({ context, input }) => {
			const userId = context.session?.user?.id;
			if (!userId) {
				throw new ORPCError("UNAUTHORIZED");
			}

			const where = and(
				eq(booking.customerUserId, userId),
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
				db.select({ total: count() }).from(booking).where(where),
				db
					.select()
					.from(booking)
					.where(where)
					.orderBy(orderByExpr)
					.limit(input.limit)
					.offset(input.offset),
			]);

			return {
				items,
				total: Number(countResult[0]?.total ?? 0),
			};
		}),

	listManaged: organizationPermissionProcedure({
		booking: ["read"],
	})
		.route({
			summary: "List managed bookings",
			description:
				"List bookings for the active organization with filters, sorting, and pagination.",
		})
		.input(listManagedBookingsInputSchema)
		.output(listManagedBookingsOutputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);

			const where = and(
				eq(booking.organizationId, activeMembership.organizationId),
				input.boatId ? eq(booking.boatId, input.boatId) : undefined,
				input.status ? eq(booking.status, input.status) : undefined,
				input.paymentStatus
					? eq(booking.paymentStatus, input.paymentStatus)
					: undefined,
				input.source ? eq(booking.source, input.source) : undefined,
				input.customerUserId
					? eq(booking.customerUserId, input.customerUserId)
					: undefined,
				input.calendarSyncStatus
					? eq(booking.calendarSyncStatus, input.calendarSyncStatus)
					: undefined,
				input.from ? gt(booking.endsAt, input.from) : undefined,
				input.to ? lt(booking.startsAt, input.to) : undefined,
				input.search
					? sql`(lower(${booking.contactName}) like ${`%${input.search.toLowerCase()}%`} or lower(${booking.contactPhone}) like ${`%${input.search.toLowerCase()}%`} or lower(${booking.contactEmail}) like ${`%${input.search.toLowerCase()}%`})`
					: undefined
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
				db.select({ total: count() }).from(booking).where(where),
				db
					.select()
					.from(booking)
					.where(where)
					.orderBy(orderByExpr)
					.limit(input.limit)
					.offset(input.offset),
			]);

			return {
				items,
				total: Number(countResult[0]?.total ?? 0),
			};
		}),

	getManaged: organizationPermissionProcedure({
		booking: ["read"],
	})
		.route({
			summary: "Get managed booking details",
			description:
				"Get a booking with optional discount application and calendar link.",
		})
		.input(getManagedBookingInputSchema)
		.output(getManagedBookingOutputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			const managedBooking = await requireManagedBooking(
				input.bookingId,
				activeMembership.organizationId
			);

			const [discountApplication] = input.includeDiscountApplication
				? await db
						.select()
						.from(bookingDiscountApplication)
						.where(eq(bookingDiscountApplication.bookingId, managedBooking.id))
						.limit(1)
				: [undefined];

			const [calendarLink] = input.includeCalendarLink
				? await db
						.select()
						.from(bookingCalendarLink)
						.where(eq(bookingCalendarLink.bookingId, managedBooking.id))
						.limit(1)
				: [undefined];

			return {
				booking: managedBooking,
				calendarLink,
				discountApplication,
			};
		}),

	createManaged: organizationPermissionProcedure({
		booking: ["create"],
	})
		.route({
			summary: "Create a managed booking",
			description:
				"Create a booking as an organization operator with full control over pricing and calendar.",
		})
		.input(createManagedBookingInputSchema)
		.output(createManagedBookingOutputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			const sessionUserId = requireSessionUserId(context);
			const managedBoat = await requireManagedBoat(
				input.boatId,
				activeMembership.organizationId
			);
			if (input.calendarLink.boatCalendarConnectionId) {
				await requireManagedCalendarConnection({
					boatId: input.boatId,
					calendarConnectionId: input.calendarLink.boatCalendarConnectionId,
				});
			}

			await ensureNoBookingOverlap({
				organizationId: activeMembership.organizationId,
				boatId: input.boatId,
				startsAt: input.startsAt,
				endsAt: input.endsAt,
			});
			await ensureNoAvailabilityBlockOverlap({
				boatId: input.boatId,
				startsAt: input.startsAt,
				endsAt: input.endsAt,
			});

			await ensureNoExternalCalendarOverlap({
				provider: input.calendarLink.provider,
				externalCalendarId: input.calendarLink.externalCalendarId,
				startsAt: input.startsAt,
				endsAt: input.endsAt,
			});

			const resolvedDiscount = await resolveBookingDiscount({
				organizationId: activeMembership.organizationId,
				boatId: input.boatId,
				startsAt: input.startsAt,
				basePriceCents: input.basePriceCents,
				discountCode: input.discountCode,
				customerUserId: input.customerUserId,
			});

			const created = await createManagedBookingRecord({
				input,
				organizationId: activeMembership.organizationId,
				sessionUserId,
				boatName: managedBoat.name,
				resolvedDiscount,
				calendarLink: input.calendarLink,
			});
			const recipientUserIds = await resolveBookingNotificationUserIds({
				organizationId: created.booking.organizationId,
				userIds: [input.customerUserId, sessionUserId],
				includeBookingManagers: true,
			});
			context.eventBus.emit({
				type: "booking.created",
				organizationId: created.booking.organizationId,
				actorUserId: sessionUserId,
				sourceType: "booking",
				sourceId: created.booking.id,
				payload: {
					bookingId: created.booking.id,
					boatName: managedBoat.name,
					windowText: `${managedBoat.name}: ${created.booking.startsAt.toISOString()} - ${created.booking.endsAt.toISOString()}`,
				},
				recipients: buildRecipients({
					userIds: recipientUserIds,
					title: "Booking created",
					body: `${managedBoat.name}: ${created.booking.startsAt.toISOString()} - ${created.booking.endsAt.toISOString()}`,
					ctaUrl: "/bookings",
					metadata: { bookingId: created.booking.id },
				}),
			});

			await enqueueBookingExpirationCheck(
				created.booking.id,
				context.bookingLifecycleQueue ?? context.notificationQueue
			);

			return created;
		}),

	cancelManaged: organizationPermissionProcedure({
		booking: ["update"],
	})
		.route({
			summary: "Cancel a managed booking",
			description: "Cancel a booking and sync the calendar event deletion.",
		})
		.input(cancelManagedBookingInputSchema)
		.output(successOutputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			const sessionUserId = requireSessionUserId(context);
			const managedBooking = await requireManagedBooking(
				input.bookingId,
				activeMembership.organizationId
			);
			if (
				managedBooking.status === "completed" ||
				managedBooking.status === "no_show"
			) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Booking can no longer be cancelled",
				});
			}
			const wasAlreadyCancelled = managedBooking.status === "cancelled";
			if (!wasAlreadyCancelled) {
				const actionPolicyProfile =
					await loadOrganizationBookingActionPolicyProfile(
						managedBooking.organizationId
					);
				assertBookingActionAllowedByWindow({
					action: "cancellation",
					actor: "manager",
					bookingStartsAt: managedBooking.startsAt,
					policyProfile: actionPolicyProfile,
				});
				assertCancellationPolicyReasonInput({
					actor: "owner",
					reasonCode: input.reasonCode,
					evidence: input.evidence,
				});
			}

			const cancellationResult = await cancelBookingAndSync({
				managedBooking,
				cancelledByUserId: sessionUserId,
				reason: input.reason,
			});

			if (!wasAlreadyCancelled) {
				const cancellationSettlement = await applyCancellationPolicyAndRefund({
					bookingId: managedBooking.id,
					actor: "owner",
					actedByUserId: sessionUserId,
					reason: input.reason,
					reasonCode: input.reasonCode,
					evidence: input.evidence,
				});
				const [managedBoat] = await db
					.select({
						name: boat.name,
					})
					.from(boat)
					.where(eq(boat.id, managedBooking.boatId))
					.limit(1);

				context.eventBus.emit({
					type: "booking.cancelled",
					organizationId: managedBooking.organizationId,
					actorUserId: sessionUserId,
					sourceType: "booking",
					sourceId: managedBooking.id,
					payload: {
						bookingId: managedBooking.id,
						boatName: managedBoat?.name ?? "Boat booking",
						windowText: `${managedBoat?.name ?? "Boat booking"}: ${managedBooking.startsAt.toISOString()} - ${managedBooking.endsAt.toISOString()}`,
					},
					recipients: buildRecipients({
						userIds: [
							managedBooking.customerUserId,
							managedBooking.createdByUserId,
							sessionUserId,
						],
						title: "Booking cancelled",
						body: `${managedBoat?.name ?? "Boat booking"}: ${managedBooking.startsAt.toISOString()} - ${managedBooking.endsAt.toISOString()}`,
						ctaUrl: "/bookings",
						severity: "warning",
						metadata: { bookingId: managedBooking.id },
					}),
				});

				if (cancellationSettlement.refund) {
					const boatName = managedBoat?.name ?? "Boat booking";
					const formattedAmount = formatRefundAmount({
						amountCents: cancellationSettlement.refund.amountCents,
						currency: managedBooking.currency,
					});
					context.eventBus.emit({
						type: "booking.refund.processed",
						organizationId: managedBooking.organizationId,
						actorUserId: sessionUserId,
						sourceType: "booking",
						sourceId: managedBooking.id,
						payload: {
							bookingId: managedBooking.id,
							boatName,
							windowText: `${boatName}: ${managedBooking.startsAt.toISOString()} - ${managedBooking.endsAt.toISOString()}`,
							refundId: cancellationSettlement.refund.refundId,
							refundAmountCents: cancellationSettlement.refund.amountCents,
							formattedAmount,
						},
						recipients: buildRecipients({
							userIds: [
								managedBooking.customerUserId,
								managedBooking.createdByUserId,
								sessionUserId,
							],
							title: "Refund processed",
							body: `${boatName}: ${formattedAmount} refunded`,
							ctaUrl: "/bookings",
							severity: "success",
							metadata: {
								bookingId: managedBooking.id,
								refundId: cancellationSettlement.refund.refundId,
								refundAmountCents: cancellationSettlement.refund.amountCents,
							},
						}),
					});
				}
			}

			try {
				await reconcileAffiliatePayoutForBooking({
					bookingId: managedBooking.id,
				});
			} catch (error) {
				console.error(
					"Failed to reconcile affiliate payout on cancellation",
					error
				);
			}

			return cancellationResult;
		}),
};
