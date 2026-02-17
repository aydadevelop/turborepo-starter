import { db } from "@full-stack-cf-app/db";
import {
	booking,
	bookingPaymentAttempt,
} from "@full-stack-cf-app/db/schema/booking";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, getTableColumns, or, sql } from "drizzle-orm";
import z from "zod";
import {
	bookingPaymentAttemptOutputSchema,
	createBookingPaymentAttemptInputSchema,
	listManagedBookingPaymentAttemptsInputSchema,
	listMineBookingPaymentAttemptsInputSchema,
	processManagedBookingPaymentAttemptInputSchema,
} from "../../contracts/booking";
import {
	organizationPermissionProcedure,
	protectedProcedure,
} from "../../index";
import {
	requireActiveMembership,
	requireCustomerBookingAccess,
	requireManagedBooking,
	requireManagedPaymentAttempt,
	requireSessionUserId,
	syncBookingPaymentStatusFromAttempts,
} from "./helpers";
import { reconcileAffiliatePayoutForBooking } from "./services/affiliate";

const isLocalMockPaymentEnabled = (hostname: string | undefined) => {
	return (
		hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
	);
};

export const paymentBookingRouter = {
	paymentAttemptCreate: protectedProcedure
		.route({
			summary: "Create payment attempt",
			description:
				"Initiate a payment attempt for a booking. Returns idempotent result if the same idempotency key is reused.",
		})
		.input(createBookingPaymentAttemptInputSchema)
		.output(
			z.object({
				idempotent: z.boolean(),
				outstandingAmountCents: z.number().optional(),
				paymentAttempt: bookingPaymentAttemptOutputSchema,
			})
		)
		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Payment attempt creation keeps validation and state transitions in a single transactional flow.
		.handler(async ({ context, input }) => {
			const sessionUserId = requireSessionUserId(context);
			const customerBooking = await requireCustomerBookingAccess({
				bookingId: input.bookingId,
				userId: sessionUserId,
			});

			const [existingAttempt] = await db
				.select()
				.from(bookingPaymentAttempt)
				.where(
					and(
						eq(bookingPaymentAttempt.bookingId, customerBooking.id),
						eq(bookingPaymentAttempt.idempotencyKey, input.idempotencyKey)
					)
				)
				.limit(1);
			if (existingAttempt) {
				return {
					idempotent: true,
					paymentAttempt: existingAttempt,
				};
			}

			const [capturedAmountRow] = await db
				.select({
					capturedAmountCents: sql<number>`coalesce(sum(case when ${bookingPaymentAttempt.status} = 'captured' then ${bookingPaymentAttempt.amountCents} else 0 end), 0)`,
				})
				.from(bookingPaymentAttempt)
				.where(eq(bookingPaymentAttempt.bookingId, customerBooking.id));
			const capturedAmountCents = Number(
				capturedAmountRow?.capturedAmountCents ?? 0
			);
			const outstandingAmountCents = Math.max(
				customerBooking.totalPriceCents -
					(customerBooking.refundAmountCents ?? 0) -
					capturedAmountCents,
				0
			);
			if (outstandingAmountCents <= 0) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Booking has no outstanding payment amount",
				});
			}

			const amountCents = input.amountCents ?? outstandingAmountCents;
			if (amountCents > outstandingAmountCents) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Requested payment amount exceeds outstanding balance",
				});
			}

			if (input.autoCaptureMock && input.provider !== "mock") {
				throw new ORPCError("BAD_REQUEST", {
					message: "autoCaptureMock is only supported with provider='mock'",
				});
			}

			if (
				input.autoCaptureMock &&
				!isLocalMockPaymentEnabled(context.requestHostname)
			) {
				throw new ORPCError("FORBIDDEN", {
					message: "Mock payment capture is disabled outside local runtime",
				});
			}

			const shouldAutoCaptureMock =
				input.autoCaptureMock && input.provider === "mock";
			const paymentAttemptId = crypto.randomUUID();
			await db.insert(bookingPaymentAttempt).values({
				id: paymentAttemptId,
				bookingId: customerBooking.id,
				organizationId: customerBooking.organizationId,
				requestedByUserId: sessionUserId,
				provider: input.provider,
				idempotencyKey: input.idempotencyKey,
				providerIntentId: input.providerIntentId,
				status: shouldAutoCaptureMock ? "captured" : "initiated",
				amountCents,
				currency: input.currency.toUpperCase(),
				metadata: input.metadata,
				processedAt: shouldAutoCaptureMock ? new Date() : undefined,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			if (shouldAutoCaptureMock) {
				await syncBookingPaymentStatusFromAttempts(customerBooking.id);
				try {
					await reconcileAffiliatePayoutForBooking({
						bookingId: customerBooking.id,
					});
				} catch (error) {
					console.error(
						"Failed to reconcile affiliate payout after mock capture",
						error
					);
				}
			}

			if (
				!shouldAutoCaptureMock &&
				(customerBooking.paymentStatus === "unpaid" ||
					customerBooking.paymentStatus === "failed")
			) {
				await db
					.update(booking)
					.set({
						status:
							customerBooking.status === "pending"
								? "awaiting_payment"
								: customerBooking.status,
						paymentStatus: "unpaid",
						updatedAt: new Date(),
					})
					.where(eq(booking.id, customerBooking.id));
			}

			const [createdPaymentAttempt] = await db
				.select()
				.from(bookingPaymentAttempt)
				.where(eq(bookingPaymentAttempt.id, paymentAttemptId))
				.limit(1);

			if (!createdPaymentAttempt) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return {
				idempotent: false,
				outstandingAmountCents,
				paymentAttempt: createdPaymentAttempt,
			};
		}),

	paymentAttemptListMine: protectedProcedure
		.route({
			summary: "List my payment attempts",
			description:
				"List payment attempts for bookings owned by the current signed-in user.",
		})
		.input(listMineBookingPaymentAttemptsInputSchema)
		.output(z.array(bookingPaymentAttemptOutputSchema))
		.handler(async ({ context, input }) => {
			const sessionUserId = requireSessionUserId(context);
			const paymentAttemptColumns = getTableColumns(bookingPaymentAttempt);

			const where = and(
				or(
					eq(booking.customerUserId, sessionUserId),
					eq(booking.createdByUserId, sessionUserId)
				),
				input.bookingId
					? eq(bookingPaymentAttempt.bookingId, input.bookingId)
					: undefined,
				input.status
					? eq(bookingPaymentAttempt.status, input.status)
					: undefined
			);
			if (!where) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return await db
				.select(paymentAttemptColumns)
				.from(bookingPaymentAttempt)
				.innerJoin(booking, eq(booking.id, bookingPaymentAttempt.bookingId))
				.where(where)
				.orderBy(desc(bookingPaymentAttempt.createdAt))
				.limit(input.limit);
		}),

	paymentAttemptListManaged: organizationPermissionProcedure({
		booking: ["read"],
	})
		.route({
			summary: "List managed payment attempts",
			description:
				"List payment attempts for the organization, optionally filtered by booking or status.",
		})
		.input(listManagedBookingPaymentAttemptsInputSchema)
		.output(z.array(bookingPaymentAttemptOutputSchema))
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			if (input.bookingId) {
				await requireManagedBooking(
					input.bookingId,
					activeMembership.organizationId
				);
			}

			const where = and(
				eq(
					bookingPaymentAttempt.organizationId,
					activeMembership.organizationId
				),
				input.bookingId
					? eq(bookingPaymentAttempt.bookingId, input.bookingId)
					: undefined,
				input.status
					? eq(bookingPaymentAttempt.status, input.status)
					: undefined
			);
			if (!where) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return await db
				.select()
				.from(bookingPaymentAttempt)
				.where(where)
				.orderBy(desc(bookingPaymentAttempt.createdAt))
				.limit(input.limit);
		}),

	paymentAttemptProcessManaged: organizationPermissionProcedure({
		booking: ["update"],
	})
		.route({
			summary: "Process payment attempt",
			description:
				"Update a payment attempt status (captured, failed, etc.) and sync the booking payment status.",
		})
		.input(processManagedBookingPaymentAttemptInputSchema)
		.output(bookingPaymentAttemptOutputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			const managedAttempt = await requireManagedPaymentAttempt({
				paymentAttemptId: input.paymentAttemptId,
				organizationId: activeMembership.organizationId,
			});
			const [managedBooking] = await db
				.select()
				.from(booking)
				.where(eq(booking.id, managedAttempt.bookingId))
				.limit(1);
			if (!managedBooking) {
				throw new ORPCError("NOT_FOUND");
			}

			const nextAmountCents =
				input.status === "captured"
					? (input.capturedAmountCents ?? managedAttempt.amountCents)
					: managedAttempt.amountCents;

			await db
				.update(bookingPaymentAttempt)
				.set({
					status: input.status,
					providerIntentId:
						input.providerIntentId ?? managedAttempt.providerIntentId,
					amountCents: nextAmountCents,
					failureReason:
						input.status === "failed"
							? input.failureReason
							: managedAttempt.failureReason,
					metadata: input.metadata ?? managedAttempt.metadata,
					processedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(bookingPaymentAttempt.id, managedAttempt.id));

			if (input.status === "captured") {
				await syncBookingPaymentStatusFromAttempts(managedBooking.id);
			} else if (
				input.status === "requires_action" ||
				input.status === "authorized"
			) {
				await db
					.update(booking)
					.set({
						paymentStatus: "unpaid",
						updatedAt: new Date(),
					})
					.where(eq(booking.id, managedBooking.id));
			} else if (input.status === "failed" || input.status === "cancelled") {
				await db
					.update(booking)
					.set({
						paymentStatus:
							managedBooking.paymentStatus === "paid" ||
							managedBooking.paymentStatus === "refunded"
								? managedBooking.paymentStatus
								: "failed",
						updatedAt: new Date(),
					})
					.where(eq(booking.id, managedBooking.id));
			}

			try {
				await reconcileAffiliatePayoutForBooking({
					bookingId: managedBooking.id,
				});
			} catch (error) {
				console.error(
					"Failed to reconcile affiliate payout after payment processing",
					error
				);
			}

			const [updatedAttempt] = await db
				.select()
				.from(bookingPaymentAttempt)
				.where(eq(bookingPaymentAttempt.id, managedAttempt.id))
				.limit(1);
			if (!updatedAttempt) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return updatedAttempt;
		}),
};
