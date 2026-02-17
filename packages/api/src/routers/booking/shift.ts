import { db } from "@full-stack-cf-app/db";
import { boat, boatPricingRule } from "@full-stack-cf-app/db/schema/boat";
import {
	booking,
	bookingCalendarLink,
	bookingDiscountApplication,
	bookingPaymentAttempt,
	bookingRefund,
	bookingShiftRequest,
} from "@full-stack-cf-app/db/schema/booking";
import { notificationsPusher } from "@full-stack-cf-app/notifications/pusher";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, getTableColumns, or } from "drizzle-orm";
import z from "zod";
import {
	bookingShiftRequestOutputSchema,
	createBookingShiftRequestInputSchema,
	listManagedBookingShiftRequestsInputSchema,
	listMineBookingShiftRequestsInputSchema,
	reviewBookingShiftRequestManagedInputSchema,
	reviewBookingShiftRequestMineInputSchema,
} from "../../contracts/booking";
import {
	organizationPermissionProcedure,
	protectedProcedure,
} from "../../index";
import { resolveBookingDiscount } from "./discount/resolution";
import {
	requireActiveMembership,
	requireCustomerBookingAccess,
	requireManagedBooking,
	requireSessionUserId,
	syncBookingPaymentStatusFromAttempts,
} from "./helpers";
import {
	assertBookingActionAllowedByWindow,
	loadOrganizationBookingActionPolicyProfile,
} from "./services/action-policy";
import { reconcileAffiliatePayoutForBooking } from "./services/affiliate";
import { syncCalendarLinkOnBookingUpdate } from "./services/calendar-sync";
import {
	ensureNoAvailabilityBlockOverlap,
	ensureNoBookingOverlapExcluding,
} from "./services/overlap";
import {
	buildBookingPricingQuote,
	estimateBookingSubtotalCentsFromProfile,
} from "./services/pricing";
import { resolveActivePricingProfile } from "./services/pricing-profile";

const terminalBookingStatuses = new Set(["cancelled", "completed", "no_show"]);
const MIN_PAYMENT_ADJUSTMENT_CENTS = 100;

const assertShiftableBooking = (
	managedBooking: typeof booking.$inferSelect
): void => {
	if (terminalBookingStatuses.has(managedBooking.status)) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Booking cannot be shifted in its current status",
		});
	}
};

const computeDiscountedBaseCents = (params: {
	basePriceCents: number;
	discountAmountCents: number;
}) => Math.max(params.basePriceCents - params.discountAmountCents, 0);

const computePayNowCents = (params: {
	basePriceCents: number;
	discountAmountCents: number;
	totalPriceCents: number;
}) => {
	const discountedBaseCents = computeDiscountedBaseCents({
		basePriceCents: params.basePriceCents,
		discountAmountCents: params.discountAmountCents,
	});
	return Math.max(params.totalPriceCents - discountedBaseCents, 0);
};

const normalizePaymentAdjustmentDeltaCents = (rawDeltaCents: number) => {
	if (Math.abs(rawDeltaCents) < MIN_PAYMENT_ADJUSTMENT_CENTS) {
		return 0;
	}
	return rawDeltaCents;
};

const isShiftAvailabilityConflictError = (error: unknown): boolean => {
	if (!(error instanceof ORPCError)) {
		return false;
	}

	if (error.code !== "BAD_REQUEST") {
		return false;
	}

	return (
		error.message === "Boat is already booked for the selected time range" ||
		error.message === "Boat is unavailable for the selected time range"
	);
};

const resolveInitiatorRole = (params: {
	managedBooking: typeof booking.$inferSelect;
	sessionUserId: string;
	activeMembership:
		| {
				organizationId: string;
		  }
		| null
		| undefined;
}) => {
	if (
		params.activeMembership &&
		params.activeMembership.organizationId ===
			params.managedBooking.organizationId
	) {
		return "manager" as const;
	}

	const hasCustomerAccess =
		params.managedBooking.customerUserId === params.sessionUserId ||
		params.managedBooking.createdByUserId === params.sessionUserId;
	if (hasCustomerAccess) {
		return "customer" as const;
	}

	throw new ORPCError("FORBIDDEN");
};

const toShiftPolicyActor = (role: "customer" | "manager") => {
	return role === "customer" ? ("customer" as const) : ("manager" as const);
};

const uniqueUserIds = (values: Array<string | null | undefined>) => {
	return values.filter((value, index, list): value is string => {
		return Boolean(value) && list.indexOf(value) === index;
	});
};

const emitShiftNotificationEvent = async (params: {
	queue?: {
		send: (
			message: unknown,
			options?: {
				contentType?: "text" | "bytes" | "json" | "v8";
				delaySeconds?: number;
			}
		) => Promise<void>;
	};
	eventType:
		| "booking.shift.requested"
		| "booking.shift.rejected"
		| "booking.shift.applied";
	idempotencyKey: string;
	booking: Pick<
		typeof booking.$inferSelect,
		"id" | "organizationId" | "customerUserId" | "createdByUserId"
	>;
	actorUserId?: string;
	title: string;
	body: string;
}) => {
	const recipients = uniqueUserIds([
		params.booking.customerUserId,
		params.booking.createdByUserId,
		params.actorUserId,
	]).map((userId) => ({
		userId,
		title: params.title,
		body: params.body,
		ctaUrl: "/bookings",
		channels: ["in_app"] as "in_app"[],
		metadata: {
			bookingId: params.booking.id,
		},
	}));
	if (recipients.length === 0) {
		return;
	}

	await notificationsPusher({
		input: {
			organizationId: params.booking.organizationId,
			actorUserId: params.actorUserId,
			eventType: params.eventType,
			sourceType: "booking",
			sourceId: params.booking.id,
			idempotencyKey: params.idempotencyKey,
			payload: {
				recipients,
			},
		},
		queue: params.queue,
	});
};

const cancelShiftRequestBySystem = async (params: {
	shiftRequestId: string;
	reason: string;
}) => {
	const now = new Date();
	await db
		.update(bookingShiftRequest)
		.set({
			status: "cancelled",
			rejectedByUserId: null,
			rejectedAt: now,
			rejectionReason: params.reason,
			appliedByUserId: null,
			appliedAt: null,
			paymentAdjustmentStatus: "none",
			paymentAdjustmentAmountCents: 0,
			paymentAdjustmentReference: null,
			updatedAt: now,
		})
		.where(eq(bookingShiftRequest.id, params.shiftRequestId));

	const [cancelledShiftRequest] = await db
		.select()
		.from(bookingShiftRequest)
		.where(eq(bookingShiftRequest.id, params.shiftRequestId))
		.limit(1);
	if (!cancelledShiftRequest) {
		throw new ORPCError("INTERNAL_SERVER_ERROR");
	}

	return cancelledShiftRequest;
};

const resolveShiftPricingSnapshot = async (params: {
	managedBooking: typeof booking.$inferSelect;
	proposedStartsAt: Date;
	proposedEndsAt: Date;
	proposedPassengers: number;
	sessionUserId: string;
}) => {
	const [managedBoat] = await db
		.select()
		.from(boat)
		.where(eq(boat.id, params.managedBooking.boatId))
		.limit(1);
	if (!managedBoat) {
		throw new ORPCError("NOT_FOUND");
	}
	if (!managedBoat.allowShiftRequests) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Boat owner does not accept shift requests",
		});
	}

	if (params.proposedPassengers > managedBoat.passengerCapacity) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Passenger count exceeds boat capacity",
		});
	}

	await ensureNoBookingOverlapExcluding({
		organizationId: params.managedBooking.organizationId,
		boatId: params.managedBooking.boatId,
		startsAt: params.proposedStartsAt,
		endsAt: params.proposedEndsAt,
		excludedBookingId: params.managedBooking.id,
	});
	await ensureNoAvailabilityBlockOverlap({
		boatId: params.managedBooking.boatId,
		startsAt: params.proposedStartsAt,
		endsAt: params.proposedEndsAt,
	});

	const activePricingProfile = await resolveActivePricingProfile({
		boatId: params.managedBooking.boatId,
		startsAt: params.proposedStartsAt,
	});
	const allPricingRules = await db
		.select()
		.from(boatPricingRule)
		.where(
			and(
				eq(boatPricingRule.boatId, params.managedBooking.boatId),
				eq(boatPricingRule.isActive, true)
			)
		);
	const pricingRules = allPricingRules.filter(
		(rule) =>
			!rule.pricingProfileId ||
			rule.pricingProfileId === activePricingProfile.id
	);

	const { estimatedHours, subtotalCents } =
		estimateBookingSubtotalCentsFromProfile({
			startsAt: params.proposedStartsAt,
			endsAt: params.proposedEndsAt,
			boatMinimumHours: managedBoat.minimumHours,
			passengers: params.proposedPassengers,
			timeZone: managedBoat.timezone,
			profile: activePricingProfile,
			pricingRules,
		});

	const [existingDiscountApplication] = await db
		.select()
		.from(bookingDiscountApplication)
		.where(eq(bookingDiscountApplication.bookingId, params.managedBooking.id))
		.limit(1);

	const discountCode = existingDiscountApplication?.code ?? undefined;
	const resolvedDiscount = discountCode
		? await resolveBookingDiscount({
				organizationId: params.managedBooking.organizationId,
				boatId: params.managedBooking.boatId,
				startsAt: params.proposedStartsAt,
				basePriceCents: subtotalCents,
				discountCode,
				customerUserId:
					params.managedBooking.customerUserId ?? params.sessionUserId,
			})
		: null;

	const discountedSubtotalCents = Math.max(
		subtotalCents - (resolvedDiscount?.discountAmountCents ?? 0),
		0
	);
	const pricingQuoteAfterDiscount = buildBookingPricingQuote({
		profile: activePricingProfile,
		estimatedHours,
		subtotalCents: discountedSubtotalCents,
	});

	return {
		managedBoat,
		discountCode,
		proposedBasePriceCents: subtotalCents,
		proposedDiscountAmountCents: resolvedDiscount?.discountAmountCents ?? 0,
		proposedTotalPriceCents: pricingQuoteAfterDiscount.estimatedTotalPriceCents,
		proposedPayNowCents: pricingQuoteAfterDiscount.estimatedPayNowCents,
		currency: pricingQuoteAfterDiscount.currency,
	};
};

const applyShiftRequestIfReady = async (params: {
	shiftRequest: typeof bookingShiftRequest.$inferSelect;
	sessionUserId: string;
	notificationQueue?: {
		send: (
			message: unknown,
			options?: {
				contentType?: "text" | "bytes" | "json" | "v8";
				delaySeconds?: number;
			}
		) => Promise<void>;
	};
}) => {
	if (
		params.shiftRequest.status !== "pending" ||
		params.shiftRequest.customerDecision !== "approved" ||
		params.shiftRequest.managerDecision !== "approved"
	) {
		return params.shiftRequest;
	}

	const [managedBooking] = await db
		.select()
		.from(booking)
		.where(eq(booking.id, params.shiftRequest.bookingId))
		.limit(1);
	if (!managedBooking) {
		throw new ORPCError("NOT_FOUND");
	}

	assertShiftableBooking(managedBooking);
	const actionPolicyProfile = await loadOrganizationBookingActionPolicyProfile(
		managedBooking.organizationId
	);
	assertBookingActionAllowedByWindow({
		action: "shift",
		actor: "customer",
		bookingStartsAt: managedBooking.startsAt,
		policyProfile: actionPolicyProfile,
	});
	assertBookingActionAllowedByWindow({
		action: "shift",
		actor: "manager",
		bookingStartsAt: managedBooking.startsAt,
		policyProfile: actionPolicyProfile,
	});

	try {
		await ensureNoBookingOverlapExcluding({
			organizationId: managedBooking.organizationId,
			boatId: managedBooking.boatId,
			startsAt: params.shiftRequest.proposedStartsAt,
			endsAt: params.shiftRequest.proposedEndsAt,
			excludedBookingId: managedBooking.id,
		});
		await ensureNoAvailabilityBlockOverlap({
			boatId: managedBooking.boatId,
			startsAt: params.shiftRequest.proposedStartsAt,
			endsAt: params.shiftRequest.proposedEndsAt,
		});
	} catch (error) {
		if (!isShiftAvailabilityConflictError(error)) {
			throw error;
		}

		const cancelledShiftRequest = await cancelShiftRequestBySystem({
			shiftRequestId: params.shiftRequest.id,
			reason:
				"Shift request cancelled because proposed slot is no longer available",
		});
		try {
			await emitShiftNotificationEvent({
				queue: params.notificationQueue,
				eventType: "booking.shift.rejected",
				idempotencyKey: `booking.shift.rejected:${params.shiftRequest.id}:unavailable`,
				booking: managedBooking,
				actorUserId: params.sessionUserId,
				title: "Booking shift cancelled",
				body: "Proposed slot is no longer available.",
			});
		} catch (eventError) {
			console.error("Failed to emit booking.shift.rejected event", eventError);
		}

		return cancelledShiftRequest;
	}

	const [managedBoat] = await db
		.select({
			id: boat.id,
			name: boat.name,
		})
		.from(boat)
		.where(eq(boat.id, managedBooking.boatId))
		.limit(1);
	if (!managedBoat) {
		throw new ORPCError("NOT_FOUND");
	}

	const [managedCalendarLink] = await db
		.select()
		.from(bookingCalendarLink)
		.where(eq(bookingCalendarLink.bookingId, managedBooking.id))
		.limit(1);

	const now = new Date();
	let paymentAdjustmentStatus:
		| "none"
		| "pending"
		| "captured"
		| "refunded"
		| "failed" = "none";
	let paymentAdjustmentAmountCents = 0;
	let paymentAdjustmentReference: string | null = null;
	const normalizedPayNowDeltaCents = normalizePaymentAdjustmentDeltaCents(
		params.shiftRequest.payNowDeltaCents
	);

	await db
		.update(booking)
		.set({
			startsAt: params.shiftRequest.proposedStartsAt,
			endsAt: params.shiftRequest.proposedEndsAt,
			passengers: params.shiftRequest.proposedPassengers,
			basePriceCents: params.shiftRequest.proposedBasePriceCents,
			discountAmountCents: params.shiftRequest.proposedDiscountAmountCents,
			totalPriceCents: params.shiftRequest.proposedTotalPriceCents,
			currency: params.shiftRequest.currency.toUpperCase(),
			updatedAt: now,
		})
		.where(eq(booking.id, managedBooking.id));

	if (normalizedPayNowDeltaCents > 0) {
		const paymentAttemptId = crypto.randomUUID();
		paymentAdjustmentStatus = "pending";
		paymentAdjustmentAmountCents = normalizedPayNowDeltaCents;
		paymentAdjustmentReference = paymentAttemptId;

		await db.insert(bookingPaymentAttempt).values({
			id: paymentAttemptId,
			bookingId: managedBooking.id,
			organizationId: managedBooking.organizationId,
			requestedByUserId: params.sessionUserId,
			provider: "shift_adjustment",
			idempotencyKey: `shift_request:${params.shiftRequest.id}:delta`,
			status: "initiated",
			amountCents: normalizedPayNowDeltaCents,
			currency: params.shiftRequest.currency.toUpperCase(),
			metadata: JSON.stringify({
				shiftRequestId: params.shiftRequest.id,
				reason: "pay_now_increase",
				rawPayNowDeltaCents: params.shiftRequest.payNowDeltaCents,
				normalizedPayNowDeltaCents,
				minAdjustmentCents: MIN_PAYMENT_ADJUSTMENT_CENTS,
			}),
			createdAt: now,
			updatedAt: now,
		});
	} else if (normalizedPayNowDeltaCents < 0) {
		const refundAmountCents = Math.abs(normalizedPayNowDeltaCents);
		const refundId = crypto.randomUUID();
		paymentAdjustmentStatus = "refunded";
		paymentAdjustmentAmountCents = refundAmountCents;
		paymentAdjustmentReference = refundId;

		await db.insert(bookingRefund).values({
			id: refundId,
			bookingId: managedBooking.id,
			organizationId: managedBooking.organizationId,
			requestedByUserId: params.sessionUserId,
			approvedByUserId: params.sessionUserId,
			processedByUserId: params.sessionUserId,
			status: "processed",
			amountCents: refundAmountCents,
			currency: params.shiftRequest.currency.toUpperCase(),
			reason: "Shift request price decrease adjustment",
			provider: "shift_adjustment_auto",
			externalRefundId: `shift_request:${params.shiftRequest.id}:refund`,
			metadata: JSON.stringify({
				shiftRequestId: params.shiftRequest.id,
				reason: "pay_now_decrease",
				rawPayNowDeltaCents: params.shiftRequest.payNowDeltaCents,
				normalizedPayNowDeltaCents,
				minAdjustmentCents: MIN_PAYMENT_ADJUSTMENT_CENTS,
			}),
			requestedAt: now,
			approvedAt: now,
			processedAt: now,
			createdAt: now,
			updatedAt: now,
		});

		await db
			.update(booking)
			.set({
				refundAmountCents:
					(managedBooking.refundAmountCents ?? 0) + refundAmountCents,
				updatedAt: now,
			})
			.where(eq(booking.id, managedBooking.id));
	}

	await db
		.update(bookingShiftRequest)
		.set({
			status: "applied",
			appliedByUserId: params.sessionUserId,
			appliedAt: now,
			paymentAdjustmentStatus,
			paymentAdjustmentAmountCents,
			paymentAdjustmentReference,
			updatedAt: now,
		})
		.where(eq(bookingShiftRequest.id, params.shiftRequest.id));

	const [existingDiscountApplication] = await db
		.select()
		.from(bookingDiscountApplication)
		.where(eq(bookingDiscountApplication.bookingId, managedBooking.id))
		.limit(1);
	if (existingDiscountApplication) {
		await db
			.update(bookingDiscountApplication)
			.set({
				appliedAmountCents: params.shiftRequest.proposedDiscountAmountCents,
				updatedAt: now,
			})
			.where(eq(bookingDiscountApplication.id, existingDiscountApplication.id));
	}

	await syncBookingPaymentStatusFromAttempts(managedBooking.id);

	const [updatedBooking] = await db
		.select()
		.from(booking)
		.where(eq(booking.id, managedBooking.id))
		.limit(1);
	if (!updatedBooking) {
		throw new ORPCError("INTERNAL_SERVER_ERROR");
	}

	const calendarSyncResult = await syncCalendarLinkOnBookingUpdate({
		managedBooking: updatedBooking,
		boatName: managedBoat.name,
		calendarLink: managedCalendarLink,
	});
	if (managedCalendarLink) {
		await db
			.update(bookingCalendarLink)
			.set({
				...calendarSyncResult.calendarLinkUpdate,
				updatedAt: new Date(),
			})
			.where(eq(bookingCalendarLink.id, managedCalendarLink.id));
	}
	await db
		.update(booking)
		.set({
			calendarSyncStatus: calendarSyncResult.status,
			updatedAt: new Date(),
		})
		.where(eq(booking.id, updatedBooking.id));

	try {
		await reconcileAffiliatePayoutForBooking({
			bookingId: updatedBooking.id,
		});
	} catch (error) {
		console.error(
			"Failed to reconcile affiliate payout after booking shift apply",
			error
		);
	}

	try {
		await emitShiftNotificationEvent({
			queue: params.notificationQueue,
			eventType: "booking.shift.applied",
			idempotencyKey: `booking.shift.applied:${params.shiftRequest.id}`,
			booking: updatedBooking,
			actorUserId: params.sessionUserId,
			title: "Booking shift applied",
			body: `${managedBoat.name}: ${updatedBooking.startsAt.toISOString()} - ${updatedBooking.endsAt.toISOString()}`,
		});
	} catch (error) {
		console.error("Failed to emit booking.shift.applied event", error);
	}

	const [appliedShiftRequest] = await db
		.select()
		.from(bookingShiftRequest)
		.where(eq(bookingShiftRequest.id, params.shiftRequest.id))
		.limit(1);
	if (!appliedShiftRequest) {
		throw new ORPCError("INTERNAL_SERVER_ERROR");
	}

	return appliedShiftRequest;
};

const requireShiftRequestForBooking = async (bookingId: string) => {
	const [existingShiftRequest] = await db
		.select()
		.from(bookingShiftRequest)
		.where(eq(bookingShiftRequest.bookingId, bookingId))
		.limit(1);
	if (!existingShiftRequest) {
		throw new ORPCError("BAD_REQUEST", {
			message: "No shift request found for booking",
		});
	}
	return existingShiftRequest;
};

const rejectShiftRequest = async (params: {
	shiftRequestId: string;
	rejectedByUserId: string;
	rejectionReason: string | null | undefined;
	side: "customer" | "manager";
	sideNote: string | null | undefined;
}) => {
	await db
		.update(bookingShiftRequest)
		.set({
			status: "rejected",
			rejectedByUserId: params.rejectedByUserId,
			rejectedAt: new Date(),
			rejectionReason: params.rejectionReason ?? null,
			customerDecision: params.side === "customer" ? "rejected" : undefined,
			customerDecisionByUserId:
				params.side === "customer" ? params.rejectedByUserId : undefined,
			customerDecisionAt: params.side === "customer" ? new Date() : undefined,
			customerDecisionNote:
				params.side === "customer" ? params.sideNote : undefined,
			managerDecision: params.side === "manager" ? "rejected" : undefined,
			managerDecisionByUserId:
				params.side === "manager" ? params.rejectedByUserId : undefined,
			managerDecisionAt: params.side === "manager" ? new Date() : undefined,
			managerDecisionNote:
				params.side === "manager" ? params.sideNote : undefined,
			updatedAt: new Date(),
		})
		.where(eq(bookingShiftRequest.id, params.shiftRequestId));
};

export const shiftBookingRouter = {
	shiftRequestCreate: protectedProcedure
		.route({
			summary: "Create booking shift request",
			description:
				"Create or replace a booking shift request with pricing deltas. The initiator auto-approves their side; apply happens only after both sides approve.",
		})
		.input(createBookingShiftRequestInputSchema)
		.output(bookingShiftRequestOutputSchema)
		.handler(async ({ context, input }) => {
			const sessionUserId = requireSessionUserId(context);
			const [managedBooking] = await db
				.select()
				.from(booking)
				.where(eq(booking.id, input.bookingId))
				.limit(1);
			if (!managedBooking) {
				throw new ORPCError("NOT_FOUND");
			}
			assertShiftableBooking(managedBooking);

			const initiatorRole = resolveInitiatorRole({
				managedBooking,
				sessionUserId,
				activeMembership: context.activeMembership,
			});
			const actionPolicyProfile =
				await loadOrganizationBookingActionPolicyProfile(
					managedBooking.organizationId
				);
			assertBookingActionAllowedByWindow({
				action: "shift",
				actor: toShiftPolicyActor(initiatorRole),
				bookingStartsAt: managedBooking.startsAt,
				policyProfile: actionPolicyProfile,
			});

			const proposedPassengers = input.passengers ?? managedBooking.passengers;
			const pricingSnapshot = await resolveShiftPricingSnapshot({
				managedBooking,
				proposedStartsAt: input.startsAt,
				proposedEndsAt: input.endsAt,
				proposedPassengers,
				sessionUserId,
			});

			const currentPayNowCents = computePayNowCents({
				basePriceCents: managedBooking.basePriceCents,
				discountAmountCents: managedBooking.discountAmountCents,
				totalPriceCents: managedBooking.totalPriceCents,
			});
			const priceDeltaCents =
				pricingSnapshot.proposedTotalPriceCents -
				managedBooking.totalPriceCents;
			const payNowDeltaCents =
				pricingSnapshot.proposedPayNowCents - currentPayNowCents;

			const now = new Date();
			const [existingShiftRequest] = await db
				.select()
				.from(bookingShiftRequest)
				.where(eq(bookingShiftRequest.bookingId, managedBooking.id))
				.limit(1);

			const draftValues: Omit<
				typeof bookingShiftRequest.$inferInsert,
				"id" | "bookingId" | "organizationId" | "createdAt"
			> = {
				requestedByUserId: sessionUserId,
				initiatedByRole: initiatorRole,
				status: "pending",
				customerDecision: initiatorRole === "customer" ? "approved" : "pending",
				customerDecisionByUserId:
					initiatorRole === "customer" ? sessionUserId : null,
				customerDecisionAt: initiatorRole === "customer" ? now : null,
				customerDecisionNote:
					initiatorRole === "customer" ? input.reason : null,
				managerDecision: initiatorRole === "manager" ? "approved" : "pending",
				managerDecisionByUserId:
					initiatorRole === "manager" ? sessionUserId : null,
				managerDecisionAt: initiatorRole === "manager" ? now : null,
				managerDecisionNote: initiatorRole === "manager" ? input.reason : null,
				currentStartsAt: managedBooking.startsAt,
				currentEndsAt: managedBooking.endsAt,
				proposedStartsAt: input.startsAt,
				proposedEndsAt: input.endsAt,
				currentPassengers: managedBooking.passengers,
				proposedPassengers,
				currentBasePriceCents: managedBooking.basePriceCents,
				currentDiscountAmountCents: managedBooking.discountAmountCents,
				proposedBasePriceCents: pricingSnapshot.proposedBasePriceCents,
				proposedDiscountAmountCents:
					pricingSnapshot.proposedDiscountAmountCents,
				currentTotalPriceCents: managedBooking.totalPriceCents,
				proposedTotalPriceCents: pricingSnapshot.proposedTotalPriceCents,
				currentPayNowCents,
				proposedPayNowCents: pricingSnapshot.proposedPayNowCents,
				priceDeltaCents,
				payNowDeltaCents,
				currency: pricingSnapshot.currency.toUpperCase(),
				discountCode: pricingSnapshot.discountCode ?? null,
				reason: input.reason ?? null,
				rejectedByUserId: null,
				rejectedAt: null,
				rejectionReason: null,
				appliedByUserId: null,
				appliedAt: null,
				paymentAdjustmentStatus: "none",
				paymentAdjustmentAmountCents: 0,
				paymentAdjustmentReference: null,
				requestedAt: now,
				metadata: null,
				updatedAt: now,
			};

			if (existingShiftRequest) {
				await db
					.update(bookingShiftRequest)
					.set(draftValues)
					.where(eq(bookingShiftRequest.id, existingShiftRequest.id));
			} else {
				await db.insert(bookingShiftRequest).values({
					id: crypto.randomUUID(),
					bookingId: managedBooking.id,
					organizationId: managedBooking.organizationId,
					createdAt: now,
					...draftValues,
				});
			}

			let [savedShiftRequest] = await db
				.select()
				.from(bookingShiftRequest)
				.where(eq(bookingShiftRequest.bookingId, managedBooking.id))
				.limit(1);
			if (!savedShiftRequest) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			if (
				savedShiftRequest.customerDecision === "approved" &&
				savedShiftRequest.managerDecision === "approved"
			) {
				savedShiftRequest = await applyShiftRequestIfReady({
					shiftRequest: savedShiftRequest,
					sessionUserId,
					notificationQueue: context.notificationQueue,
				});
			}

			try {
				await emitShiftNotificationEvent({
					queue: context.notificationQueue,
					eventType: "booking.shift.requested",
					idempotencyKey: `booking.shift.requested:${savedShiftRequest.id}:${savedShiftRequest.updatedAt.toISOString()}`,
					booking: managedBooking,
					actorUserId: sessionUserId,
					title: "Booking shift requested",
					body: `${pricingSnapshot.managedBoat.name}: ${input.startsAt.toISOString()} - ${input.endsAt.toISOString()}`,
				});
			} catch (error) {
				console.error("Failed to emit booking.shift.requested event", error);
			}

			return savedShiftRequest;
		}),

	shiftRequestListMine: protectedProcedure
		.route({
			summary: "List my booking shift requests",
			description:
				"List shift requests for bookings owned by the current signed-in user.",
		})
		.input(listMineBookingShiftRequestsInputSchema)
		.output(z.array(bookingShiftRequestOutputSchema))
		.handler(async ({ context, input }) => {
			const sessionUserId = requireSessionUserId(context);
			const shiftColumns = getTableColumns(bookingShiftRequest);

			const where = and(
				or(
					eq(booking.customerUserId, sessionUserId),
					eq(booking.createdByUserId, sessionUserId)
				),
				input.status ? eq(bookingShiftRequest.status, input.status) : undefined
			);
			if (!where) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return await db
				.select(shiftColumns)
				.from(bookingShiftRequest)
				.innerJoin(booking, eq(booking.id, bookingShiftRequest.bookingId))
				.where(where)
				.orderBy(desc(bookingShiftRequest.requestedAt))
				.limit(input.limit);
		}),

	shiftRequestListManaged: organizationPermissionProcedure({
		booking: ["read"],
	})
		.route({
			summary: "List managed booking shift requests",
			description:
				"List booking shift requests for the active organization with optional filters.",
		})
		.input(listManagedBookingShiftRequestsInputSchema)
		.output(z.array(bookingShiftRequestOutputSchema))
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			if (input.bookingId) {
				await requireManagedBooking(
					input.bookingId,
					activeMembership.organizationId
				);
			}

			const where = and(
				eq(bookingShiftRequest.organizationId, activeMembership.organizationId),
				input.status ? eq(bookingShiftRequest.status, input.status) : undefined,
				input.bookingId
					? eq(bookingShiftRequest.bookingId, input.bookingId)
					: undefined
			);
			if (!where) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return await db
				.select()
				.from(bookingShiftRequest)
				.where(where)
				.orderBy(desc(bookingShiftRequest.requestedAt))
				.limit(input.limit);
		}),

	shiftRequestReviewMine: protectedProcedure
		.route({
			summary: "Review booking shift request as customer",
			description:
				"Approve or reject a shift request from the customer side. Booking is updated only after manager approval too.",
		})
		.input(reviewBookingShiftRequestMineInputSchema)
		.output(bookingShiftRequestOutputSchema)
		.handler(async ({ context, input }) => {
			const sessionUserId = requireSessionUserId(context);
			const customerBooking = await requireCustomerBookingAccess({
				bookingId: input.bookingId,
				userId: sessionUserId,
			});
			const existingShiftRequest = await requireShiftRequestForBooking(
				customerBooking.id
			);

			if (existingShiftRequest.status === "applied") {
				return existingShiftRequest;
			}
			if (existingShiftRequest.status === "rejected") {
				throw new ORPCError("BAD_REQUEST", {
					message: "Shift request is already rejected",
				});
			}
			if (existingShiftRequest.status === "cancelled") {
				throw new ORPCError("BAD_REQUEST", {
					message: "Shift request is already cancelled",
				});
			}

			if (input.decision === "reject") {
				await rejectShiftRequest({
					shiftRequestId: existingShiftRequest.id,
					rejectedByUserId: sessionUserId,
					rejectionReason: input.note,
					side: "customer",
					sideNote: input.note,
				});

				const [rejected] = await db
					.select()
					.from(bookingShiftRequest)
					.where(eq(bookingShiftRequest.id, existingShiftRequest.id))
					.limit(1);
				if (!rejected) {
					throw new ORPCError("INTERNAL_SERVER_ERROR");
				}

				try {
					await emitShiftNotificationEvent({
						queue: context.notificationQueue,
						eventType: "booking.shift.rejected",
						idempotencyKey: `booking.shift.rejected:${existingShiftRequest.id}:customer`,
						booking: customerBooking,
						actorUserId: sessionUserId,
						title: "Booking shift rejected",
						body: "Customer rejected the shift request.",
					});
				} catch (error) {
					console.error("Failed to emit booking.shift.rejected event", error);
				}

				return rejected;
			}
			const actionPolicyProfile =
				await loadOrganizationBookingActionPolicyProfile(
					customerBooking.organizationId
				);
			assertBookingActionAllowedByWindow({
				action: "shift",
				actor: "customer",
				bookingStartsAt: customerBooking.startsAt,
				policyProfile: actionPolicyProfile,
			});

			await db
				.update(bookingShiftRequest)
				.set({
					customerDecision: "approved",
					customerDecisionByUserId: sessionUserId,
					customerDecisionAt: new Date(),
					customerDecisionNote: input.note ?? null,
					updatedAt: new Date(),
				})
				.where(eq(bookingShiftRequest.id, existingShiftRequest.id));

			const [updated] = await db
				.select()
				.from(bookingShiftRequest)
				.where(eq(bookingShiftRequest.id, existingShiftRequest.id))
				.limit(1);
			if (!updated) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			if (updated.managerDecision === "approved") {
				return await applyShiftRequestIfReady({
					shiftRequest: updated,
					sessionUserId,
					notificationQueue: context.notificationQueue,
				});
			}

			return updated;
		}),

	shiftRequestReviewManaged: organizationPermissionProcedure({
		booking: ["update"],
	})
		.route({
			summary: "Review booking shift request as manager",
			description:
				"Approve or reject a shift request from the organization side. Booking is updated only after customer approval too.",
		})
		.input(reviewBookingShiftRequestManagedInputSchema)
		.output(bookingShiftRequestOutputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			const sessionUserId = requireSessionUserId(context);
			const managedBooking = await requireManagedBooking(
				input.bookingId,
				activeMembership.organizationId
			);
			const existingShiftRequest = await requireShiftRequestForBooking(
				managedBooking.id
			);

			if (existingShiftRequest.status === "applied") {
				return existingShiftRequest;
			}
			if (existingShiftRequest.status === "rejected") {
				throw new ORPCError("BAD_REQUEST", {
					message: "Shift request is already rejected",
				});
			}
			if (existingShiftRequest.status === "cancelled") {
				throw new ORPCError("BAD_REQUEST", {
					message: "Shift request is already cancelled",
				});
			}

			if (input.decision === "reject") {
				await rejectShiftRequest({
					shiftRequestId: existingShiftRequest.id,
					rejectedByUserId: sessionUserId,
					rejectionReason: input.note,
					side: "manager",
					sideNote: input.note,
				});
				const [rejected] = await db
					.select()
					.from(bookingShiftRequest)
					.where(eq(bookingShiftRequest.id, existingShiftRequest.id))
					.limit(1);
				if (!rejected) {
					throw new ORPCError("INTERNAL_SERVER_ERROR");
				}

				try {
					await emitShiftNotificationEvent({
						queue: context.notificationQueue,
						eventType: "booking.shift.rejected",
						idempotencyKey: `booking.shift.rejected:${existingShiftRequest.id}:manager`,
						booking: managedBooking,
						actorUserId: sessionUserId,
						title: "Booking shift rejected",
						body: "Manager rejected the shift request.",
					});
				} catch (error) {
					console.error("Failed to emit booking.shift.rejected event", error);
				}

				return rejected;
			}
			const actionPolicyProfile =
				await loadOrganizationBookingActionPolicyProfile(
					managedBooking.organizationId
				);
			assertBookingActionAllowedByWindow({
				action: "shift",
				actor: "manager",
				bookingStartsAt: managedBooking.startsAt,
				policyProfile: actionPolicyProfile,
			});

			await db
				.update(bookingShiftRequest)
				.set({
					managerDecision: "approved",
					managerDecisionByUserId: sessionUserId,
					managerDecisionAt: new Date(),
					managerDecisionNote: input.note ?? null,
					updatedAt: new Date(),
				})
				.where(eq(bookingShiftRequest.id, existingShiftRequest.id));

			const [updated] = await db
				.select()
				.from(bookingShiftRequest)
				.where(eq(bookingShiftRequest.id, existingShiftRequest.id))
				.limit(1);
			if (!updated) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			if (updated.customerDecision === "approved") {
				return await applyShiftRequestIfReady({
					shiftRequest: updated,
					sessionUserId,
					notificationQueue: context.notificationQueue,
				});
			}

			return updated;
		}),
};
