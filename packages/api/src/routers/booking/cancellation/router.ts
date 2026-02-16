import { db } from "@full-stack-cf-app/db";
import { boat } from "@full-stack-cf-app/db/schema/boat";
import {
	booking,
	bookingCancellationRequest,
} from "@full-stack-cf-app/db/schema/booking";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, getTableColumns, or } from "drizzle-orm";
import z from "zod";
import {
	organizationPermissionProcedure,
	protectedProcedure,
} from "../../../index";
import { buildRecipients, formatRefundAmount } from "../../../lib/event-bus";
import {
	bookingCancellationRequestOutputSchema,
	listManagedBookingCancellationRequestsInputSchema,
	listMineBookingCancellationRequestsInputSchema,
	requestBookingCancellationInputSchema,
	reviewBookingCancellationInputSchema,
} from "../../booking.schemas";
import { successOutputSchema } from "../../shared/schema-utils";
import {
	requireActiveMembership,
	requireCustomerBookingAccess,
	requireManagedBooking,
	requireSessionUserId,
} from "../helpers";
import {
	assertBookingActionAllowedByWindow,
	loadOrganizationBookingActionPolicyProfile,
} from "../services/action-policy";
import { reconcileAffiliatePayoutForBooking } from "../services/affiliate";
import { cancelBookingAndSync } from "../services/calendar-sync";
import {
	applyCancellationPolicyAndRefund,
	assertCancellationPolicyReasonInput,
} from "./policy.service";
import type { StoredCancellationRequestPayload } from "./request-payload";
import {
	parseCancellationRequestPayload,
	serializeCancellationRequestPayload,
} from "./request-payload";

const toStoredCancellationRequestReason = (
	params: StoredCancellationRequestPayload
) => {
	const hasReasonCode = typeof params.reasonCode === "string";
	const hasEvidence = (params.evidence?.length ?? 0) > 0;
	if (!(hasReasonCode || hasEvidence)) {
		return params.reason ?? null;
	}

	return serializeCancellationRequestPayload({
		reason: params.reason,
		reasonCode: params.reasonCode,
		evidence: params.evidence,
	});
};

const toPublicCancellationRequest = (
	value: typeof bookingCancellationRequest.$inferSelect
) => {
	const payload = parseCancellationRequestPayload(value.reason);
	return {
		...value,
		reason: payload.reason ?? null,
	};
};

export const cancellationBookingRouter = {
	cancellationRequestCreate: protectedProcedure
		.route({
			summary: "Request booking cancellation",
			description: "Submit a cancellation request for a customer booking.",
		})
		.input(requestBookingCancellationInputSchema)
		.output(bookingCancellationRequestOutputSchema)
		.handler(async ({ context, input }) => {
			const sessionUserId = requireSessionUserId(context);
			const customerBooking = await requireCustomerBookingAccess({
				bookingId: input.bookingId,
				userId: sessionUserId,
			});

			if (customerBooking.status === "cancelled") {
				throw new ORPCError("BAD_REQUEST", {
					message: "Booking is already cancelled",
				});
			}
			if (
				customerBooking.status === "completed" ||
				customerBooking.status === "no_show"
			) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Booking can no longer be cancelled",
				});
			}
			const actionPolicyProfile =
				await loadOrganizationBookingActionPolicyProfile(
					customerBooking.organizationId
				);
			assertBookingActionAllowedByWindow({
				action: "cancellation",
				actor: "customer",
				bookingStartsAt: customerBooking.startsAt,
				policyProfile: actionPolicyProfile,
			});

			const [existingRequest] = await db
				.select()
				.from(bookingCancellationRequest)
				.where(eq(bookingCancellationRequest.bookingId, customerBooking.id))
				.limit(1);

			if (existingRequest) {
				await db
					.update(bookingCancellationRequest)
					.set({
						status: "requested",
						reason: toStoredCancellationRequestReason({
							reason: input.reason,
							reasonCode: input.reasonCode,
							evidence: input.evidence,
						}),
						requestedByUserId: sessionUserId,
						requestedAt: new Date(),
						reviewedByUserId: null,
						reviewedAt: null,
						reviewNote: null,
						updatedAt: new Date(),
					})
					.where(eq(bookingCancellationRequest.id, existingRequest.id));
			} else {
				await db.insert(bookingCancellationRequest).values({
					id: crypto.randomUUID(),
					bookingId: customerBooking.id,
					organizationId: customerBooking.organizationId,
					requestedByUserId: sessionUserId,
					reason: toStoredCancellationRequestReason({
						reason: input.reason,
						reasonCode: input.reasonCode,
						evidence: input.evidence,
					}),
					status: "requested",
					requestedAt: new Date(),
					createdAt: new Date(),
					updatedAt: new Date(),
				});
			}

			const [savedRequest] = await db
				.select()
				.from(bookingCancellationRequest)
				.where(eq(bookingCancellationRequest.bookingId, customerBooking.id))
				.limit(1);

			if (!savedRequest) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return toPublicCancellationRequest(savedRequest);
		}),

	cancellationRequestListMine: protectedProcedure
		.route({
			summary: "List my cancellation requests",
			description:
				"List cancellation requests for bookings owned by the current signed-in user.",
		})
		.input(listMineBookingCancellationRequestsInputSchema)
		.output(z.array(bookingCancellationRequestOutputSchema))
		.handler(async ({ context, input }) => {
			const sessionUserId = requireSessionUserId(context);
			const requestColumns = getTableColumns(bookingCancellationRequest);

			const where = and(
				or(
					eq(booking.customerUserId, sessionUserId),
					eq(booking.createdByUserId, sessionUserId)
				),
				input.status
					? eq(bookingCancellationRequest.status, input.status)
					: undefined
			);

			if (!where) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			const requests = await db
				.select(requestColumns)
				.from(bookingCancellationRequest)
				.innerJoin(
					booking,
					eq(booking.id, bookingCancellationRequest.bookingId)
				)
				.where(where)
				.orderBy(desc(bookingCancellationRequest.requestedAt))
				.limit(input.limit);

			return requests.map(toPublicCancellationRequest);
		}),

	cancellationRequestListManaged: organizationPermissionProcedure({
		booking: ["read"],
	})
		.route({
			summary: "List managed cancellation requests",
			description:
				"List cancellation requests for the organization, optionally filtered by status.",
		})
		.input(listManagedBookingCancellationRequestsInputSchema)
		.output(z.array(bookingCancellationRequestOutputSchema))
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);

			const where = and(
				eq(
					bookingCancellationRequest.organizationId,
					activeMembership.organizationId
				),
				input.status
					? eq(bookingCancellationRequest.status, input.status)
					: undefined
			);

			if (!where) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			const requests = await db
				.select()
				.from(bookingCancellationRequest)
				.where(where)
				.orderBy(desc(bookingCancellationRequest.requestedAt))
				.limit(input.limit);
			return requests.map(toPublicCancellationRequest);
		}),

	cancellationRequestReviewManaged: organizationPermissionProcedure({
		booking: ["update"],
	})
		.route({
			summary: "Review cancellation request",
			description:
				"Approve or reject a cancellation request. Approved requests trigger booking cancellation and calendar sync.",
		})
		.input(reviewBookingCancellationInputSchema)
		.output(successOutputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			const sessionUserId = requireSessionUserId(context);
			const managedBooking = await requireManagedBooking(
				input.bookingId,
				activeMembership.organizationId
			);
			const [existingRequest] = await db
				.select()
				.from(bookingCancellationRequest)
				.where(eq(bookingCancellationRequest.bookingId, managedBooking.id))
				.limit(1);

			if (!existingRequest) {
				throw new ORPCError("BAD_REQUEST", {
					message: "No cancellation request found for booking",
				});
			}

			const requestPayload = parseCancellationRequestPayload(
				existingRequest.reason
			);
			const effectiveReason = requestPayload.reason ?? input.reviewNote;
			const effectiveReasonCode = input.reasonCode ?? requestPayload.reasonCode;
			const effectiveEvidence = input.evidence ?? requestPayload.evidence;
			const storedEffectiveReason = toStoredCancellationRequestReason({
				reason: effectiveReason,
				reasonCode: effectiveReasonCode,
				evidence: effectiveEvidence,
			});

			if (input.decision === "reject") {
				await db
					.update(bookingCancellationRequest)
					.set({
						status: "rejected",
						reason: storedEffectiveReason,
						reviewedByUserId: sessionUserId,
						reviewedAt: new Date(),
						reviewNote: input.reviewNote,
						updatedAt: new Date(),
					})
					.where(eq(bookingCancellationRequest.id, existingRequest.id));

				return { success: true };
			}

			const wasAlreadyCancelled = managedBooking.status === "cancelled";
			if (!wasAlreadyCancelled) {
				if (
					managedBooking.status === "completed" ||
					managedBooking.status === "no_show"
				) {
					throw new ORPCError("BAD_REQUEST", {
						message: "Booking can no longer be cancelled",
					});
				}
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
					actor: "customer",
					reasonCode: effectiveReasonCode,
					evidence: effectiveEvidence,
				});
			}
			await cancelBookingAndSync({
				managedBooking,
				cancelledByUserId: sessionUserId,
				reason: effectiveReason,
			});

			if (!wasAlreadyCancelled) {
				const cancellationSettlement = await applyCancellationPolicyAndRefund({
					bookingId: managedBooking.id,
					actor: "customer",
					actedByUserId: sessionUserId,
					reason: effectiveReason,
					reasonCode: effectiveReasonCode,
					evidence: effectiveEvidence,
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
						ctaUrl: `/bookings`,
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
							ctaUrl: `/bookings`,
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
			await db
				.update(bookingCancellationRequest)
				.set({
					status: "approved",
					reason: storedEffectiveReason,
					reviewedByUserId: sessionUserId,
					reviewedAt: new Date(),
					reviewNote: input.reviewNote,
					updatedAt: new Date(),
				})
				.where(eq(bookingCancellationRequest.id, existingRequest.id));

			try {
				await reconcileAffiliatePayoutForBooking({
					bookingId: managedBooking.id,
				});
			} catch (error) {
				console.error(
					"Failed to reconcile affiliate payout after cancellation approval",
					error
				);
			}

			return { success: true };
		}),
};
