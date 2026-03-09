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
				publicationId: z.string(),
				organizationId: z.string(),
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
};
