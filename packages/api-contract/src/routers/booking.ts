import { oc } from "@orpc/contract";
import z from "zod";

const bookingOutput = z.object({
	id: z.string(),
	organizationId: z.string(),
	listingId: z.string(),
	publicationId: z.string(),
	merchantOrganizationId: z.string(),
	merchantPaymentConfigId: z.string().nullable(),
	customerUserId: z.string().nullable(),
	createdByUserId: z.string().nullable(),
	source: z.enum(["manual", "web", "telegram", "partner", "api", "calendar_sync"]),
	status: z.enum([
		"pending",
		"awaiting_payment",
		"confirmed",
		"in_progress",
		"completed",
		"cancelled",
		"rejected",
		"no_show",
		"disputed",
	]),
	paymentStatus: z.enum(["unpaid", "pending", "partially_paid", "paid", "refunded", "failed"]),
	calendarSyncStatus: z.enum(["pending", "linked", "sync_error", "detached", "not_applicable"]),
	startsAt: z.string().datetime(),
	endsAt: z.string().datetime(),
	cancelledAt: z.string().datetime().nullable(),
	cancelledByUserId: z.string().nullable(),
	cancellationReason: z.string().nullable(),
	externalRef: z.string().nullable(),
	timezone: z.string().nullable(),
	notes: z.string().nullable(),
	specialRequests: z.string().nullable(),
	contactName: z.string().nullable(),
	contactPhone: z.string().nullable(),
	contactEmail: z.string().nullable(),
	currency: z.string(),
	passengers: z.number().int().nullable(),
	basePriceCents: z.number().int(),
	discountAmountCents: z.number().int(),
	totalPriceCents: z.number().int(),
	platformCommissionCents: z.number().int(),
	refundAmountCents: z.number().int(),
	metadata: z.record(z.string(), z.unknown()).nullable(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

export const bookingContract = {
	create: oc
		.route({ tags: ["Booking"], summary: "Create a booking for an available slot" })
		.input(
			z.object({
				listingId: z.string(),
				startsAt: z.string().datetime(),
				endsAt: z.string().datetime(),
				passengers: z.number().int().optional(),
				contactName: z.string().optional(),
				contactPhone: z.string().optional(),
				contactEmail: z.string().email().optional(),
				timezone: z.string().optional(),
				notes: z.string().optional(),
				specialRequests: z.string().optional(),
				currency: z.string().optional(),
			}),
		)
		.output(bookingOutput),

	listOrgBookings: oc
		.route({ tags: ["Booking"], summary: "List bookings in the active organization" })
		.input(
			z.object({
				listingId: z.string().optional(),
				status: z.string().optional(),
				limit: z.number().int().min(1).max(200).optional(),
				offset: z.number().int().min(0).optional(),
			}),
		)
		.output(z.array(bookingOutput)),

	getBooking: oc
		.route({ tags: ["Booking"], summary: "Get a single booking by ID" })
		.input(z.object({ id: z.string() }))
		.output(bookingOutput),

	updateStatus: oc
		.route({ tags: ["Booking"], summary: "Transition a booking lifecycle status" })
		.input(
			z.object({
				id: z.string(),
				status: z.enum([
					"pending",
					"awaiting_payment",
					"confirmed",
					"in_progress",
					"completed",
					"cancelled",
					"rejected",
					"no_show",
					"disputed",
				]),
				cancellationReason: z.string().optional(),
				cancelledByUserId: z.string().optional(),
			}),
		)
		.output(bookingOutput),

	listMyBookings: oc
		.route({ tags: ["Booking"], summary: "List the authenticated customer's own bookings" })
		.input(z.object({}))
		.output(z.array(bookingOutput)),

	requestCancellation: oc
		.route({
			tags: ["Booking"],
			summary: "Request booking cancellation (preview)",
			description:
				"Validates booking state, computes refund policy outcome, and inserts a cancellation request row. Does not cancel the booking or process a refund.",
		})
		.input(
			z.object({
				bookingId: z.string(),
				initiatedByRole: z.enum(["customer", "manager"]),
				reason: z.string().max(2000).optional(),
				reasonCode: z.string().optional(),
				evidence: z
					.array(
						z.object({
							type: z.enum(["photo", "document", "video", "other"]),
							url: z.string().url(),
							description: z.string().optional(),
						}),
					)
					.optional(),
			}),
		)
		.output(
			z.object({
				request: z.object({
					id: z.string(),
					bookingId: z.string(),
					organizationId: z.string(),
					requestedByUserId: z.string().nullable(),
					initiatedByRole: z.enum(["customer", "manager"]),
					status: z.enum([
						"requested",
						"pending_review",
						"approved",
						"rejected",
						"applied",
						"cancelled",
					]),
					reason: z.string().nullable(),
					reasonCode: z.string().nullable(),
					bookingTotalPriceCents: z.number().int(),
					penaltyAmountCents: z.number().int(),
					refundAmountCents: z.number().int(),
					currency: z.string(),
					appliedByUserId: z.string().nullable(),
					appliedAt: z.string().datetime().nullable(),
					requestedAt: z.string().datetime(),
					createdAt: z.string().datetime(),
					updatedAt: z.string().datetime(),
				}),
				outcome: z.object({
					actor: z.enum(["customer", "manager"]),
					policyCode: z.string(),
					policyLabel: z.string(),
					policySource: z.enum(["default_profile", "reason_override"]),
					reasonCode: z.string().optional(),
					hoursUntilStart: z.number(),
					capturedAmountCents: z.number().int(),
					alreadyRefundedCents: z.number().int(),
					refundableBaseCents: z.number().int(),
					refundPercent: z.number(),
					suggestedRefundCents: z.number().int(),
				}),
			}),
		),

	applyCancellation: oc
		.route({
			tags: ["Booking"],
			summary: "Apply (commit) an approved cancellation request",
			description:
				"Transitions the request to 'applied', cancels the booking, and inserts a refund row if applicable. Uses the stored snapshot — no recalculation.",
		})
		.input(
			z.object({
				requestId: z.string(),
			}),
		)
		.output(
			z.object({
				requestId: z.string(),
				refundId: z.string().nullable(),
			}),
		),

	getActiveCancellationRequest: oc
		.route({
			tags: ["Booking"],
			summary: "Get active cancellation request for a booking",
		})
		.input(z.object({ bookingId: z.string() }))
		.output(
			z
				.object({
					id: z.string(),
					bookingId: z.string(),
					organizationId: z.string(),
					requestedByUserId: z.string().nullable(),
					initiatedByRole: z.enum(["customer", "manager"]),
					status: z.enum([
						"requested",
						"pending_review",
						"approved",
						"rejected",
						"applied",
						"cancelled",
					]),
					reason: z.string().nullable(),
					reasonCode: z.string().nullable(),
					bookingTotalPriceCents: z.number().int(),
					penaltyAmountCents: z.number().int(),
					refundAmountCents: z.number().int(),
					currency: z.string(),
					appliedByUserId: z.string().nullable(),
					appliedAt: z.string().datetime().nullable(),
					requestedAt: z.string().datetime(),
					createdAt: z.string().datetime(),
					updatedAt: z.string().datetime(),
				})
				.nullable(),
		),

	listCancellationRequests: oc
		.route({
			tags: ["Booking"],
			summary: "List all cancellation requests for the organization",
		})
		.input(z.object({}))
		.output(
			z.array(
				z.object({
					id: z.string(),
					bookingId: z.string(),
					organizationId: z.string(),
					requestedByUserId: z.string().nullable(),
					initiatedByRole: z.enum(["customer", "manager"]),
					status: z.enum([
						"requested",
						"pending_review",
						"approved",
						"rejected",
						"applied",
						"cancelled",
					]),
					reason: z.string().nullable(),
					reasonCode: z.string().nullable(),
					bookingTotalPriceCents: z.number().int(),
					penaltyAmountCents: z.number().int(),
					refundAmountCents: z.number().int(),
					currency: z.string(),
					appliedByUserId: z.string().nullable(),
					appliedAt: z.string().datetime().nullable(),
					requestedAt: z.string().datetime(),
					createdAt: z.string().datetime(),
					updatedAt: z.string().datetime(),
				}),
			),
		),
};
