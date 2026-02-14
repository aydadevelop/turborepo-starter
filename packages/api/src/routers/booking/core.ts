import { db } from "@full-stack-cf-app/db";
import {
	boat,
	boatAvailabilityBlock,
	boatCalendarConnection,
	boatPricingProfile,
} from "@full-stack-cf-app/db/schema/boat";
import {
	booking,
	bookingCalendarLink,
	bookingDiscountApplication,
	bookingDiscountCode,
} from "@full-stack-cf-app/db/schema/booking";
import { ORPCError } from "@orpc/server";
import {
	and,
	asc,
	count,
	desc,
	eq,
	gt,
	inArray,
	isNull,
	lt,
	lte,
	ne,
	or,
	sql,
} from "drizzle-orm";
import { getCalendarAdapter } from "../../calendar/adapters/registry";
import {
	organizationPermissionProcedure,
	protectedProcedure,
} from "../../index";
import { buildRecipients, formatRefundAmount } from "../../lib/event-bus";
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
} from "../booking.schemas";
import { successOutputSchema } from "../shared/schema-utils";
import {
	applyCancellationPolicyAndRefund,
	assertCancellationPolicyReasonInput,
} from "./cancellation/policy.service";
import { resolveBookingDiscount } from "./discount/resolution";
import {
	blockingBookingStatuses,
	type CreateManagedBookingCalendarLinkInput,
	type CreateManagedBookingInput,
	type ResolvedBookingDiscount,
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
	syncCalendarLinkOnBookingCreate,
} from "./services/calendar-sync";

const getSqliteErrorMessage = (error: unknown): string => {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === "string") {
		return error;
	}
	return "";
};

export const ensureNoBookingOverlap = async (params: {
	organizationId: string;
	boatId: string;
	startsAt: Date;
	endsAt: Date;
}) => {
	const [overlappingBooking] = await db
		.select({ id: booking.id })
		.from(booking)
		.where(
			and(
				eq(booking.organizationId, params.organizationId),
				eq(booking.boatId, params.boatId),
				inArray(booking.status, blockingBookingStatuses),
				lt(booking.startsAt, params.endsAt),
				gt(booking.endsAt, params.startsAt)
			)
		)
		.limit(1);

	if (overlappingBooking) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Boat is already booked for the selected time range",
		});
	}
};

export const ensureNoAvailabilityBlockOverlap = async (params: {
	boatId: string;
	startsAt: Date;
	endsAt: Date;
}) => {
	const [overlappingBlock] = await db
		.select({ id: boatAvailabilityBlock.id })
		.from(boatAvailabilityBlock)
		.where(
			and(
				eq(boatAvailabilityBlock.boatId, params.boatId),
				eq(boatAvailabilityBlock.isActive, true),
				lt(boatAvailabilityBlock.startsAt, params.endsAt),
				gt(boatAvailabilityBlock.endsAt, params.startsAt)
			)
		)
		.limit(1);

	if (overlappingBlock) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Boat is unavailable for the selected time range",
		});
	}
};

export const resolveActivePricingProfile = async (params: {
	boatId: string;
	startsAt: Date;
}) => {
	const [activeProfile] = await db
		.select()
		.from(boatPricingProfile)
		.where(
			and(
				eq(boatPricingProfile.boatId, params.boatId),
				isNull(boatPricingProfile.archivedAt),
				lte(boatPricingProfile.validFrom, params.startsAt),
				or(
					isNull(boatPricingProfile.validTo),
					gt(boatPricingProfile.validTo, params.startsAt)
				)
			)
		)
		.orderBy(
			desc(boatPricingProfile.isDefault),
			desc(boatPricingProfile.validFrom)
		)
		.limit(1);

	if (!activeProfile) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Boat has no active pricing profile",
		});
	}

	return activeProfile;
};

export const resolvePrimaryCalendarLinkInput = async (params: {
	boatId: string;
}): Promise<CreateManagedBookingCalendarLinkInput> => {
	const [primaryConnection] = await db
		.select()
		.from(boatCalendarConnection)
		.where(
			and(
				eq(boatCalendarConnection.boatId, params.boatId),
				eq(boatCalendarConnection.isPrimary, true),
				ne(boatCalendarConnection.syncStatus, "disabled")
			)
		)
		.limit(1);

	if (primaryConnection) {
		const adapter = getCalendarAdapter(primaryConnection.provider);
		if (!adapter) {
			return {
				boatCalendarConnectionId: undefined,
				provider: "manual",
				externalCalendarId: undefined,
				externalEventId: `booking-${crypto.randomUUID()}`,
				iCalUid: undefined,
				externalEventVersion: undefined,
				syncedAt: undefined,
			};
		}

		return {
			boatCalendarConnectionId: primaryConnection.id,
			provider: primaryConnection.provider,
			externalCalendarId: primaryConnection.externalCalendarId,
			externalEventId: `booking-${crypto.randomUUID()}`,
			iCalUid: undefined,
			externalEventVersion: undefined,
			syncedAt: undefined,
		};
	}

	return {
		boatCalendarConnectionId: undefined,
		provider: "manual",
		externalCalendarId: undefined,
		externalEventId: `booking-${crypto.randomUUID()}`,
		iCalUid: undefined,
		externalEventVersion: undefined,
		syncedAt: undefined,
	};
};

export const createManagedBookingRecord = async (params: {
	input: CreateManagedBookingInput;
	organizationId: string;
	sessionUserId?: string;
	boatName: string;
	resolvedDiscount: ResolvedBookingDiscount | null;
	calendarLink: CreateManagedBookingCalendarLinkInput;
	totalPriceCentsOverride?: number;
}) => {
	const bookingId = crypto.randomUUID();
	const discountAmountCents = params.resolvedDiscount?.discountAmountCents ?? 0;
	const fallbackTotalPriceCents = Math.max(
		params.input.basePriceCents - discountAmountCents,
		0
	);
	const totalPriceCents =
		params.totalPriceCentsOverride !== undefined
			? Math.max(params.totalPriceCentsOverride, 0)
			: fallbackTotalPriceCents;
	try {
		await db.insert(booking).values({
			id: bookingId,
			organizationId: params.organizationId,
			boatId: params.input.boatId,
			customerUserId: params.input.customerUserId,
			createdByUserId: params.sessionUserId,
			source: params.input.source,
			status: params.input.status,
			paymentStatus: params.input.paymentStatus,
			calendarSyncStatus: "pending",
			startsAt: params.input.startsAt,
			endsAt: params.input.endsAt,
			passengers: params.input.passengers,
			contactName: params.input.contactName,
			contactPhone: params.input.contactPhone,
			contactEmail: params.input.contactEmail,
			timezone: params.input.timezone,
			basePriceCents: params.input.basePriceCents,
			discountAmountCents,
			totalPriceCents,
			currency: params.input.currency.toUpperCase(),
			notes: params.input.notes,
			specialRequests: params.input.specialRequests,
			externalRef: params.input.externalRef,
			metadata: params.input.metadata,
			createdAt: new Date(),
			updatedAt: new Date(),
		});
	} catch (error) {
		const message = getSqliteErrorMessage(error);
		if (message.includes("BOOKING_OVERLAP")) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Boat is already booked for the selected time range",
			});
		}
		if (message.includes("BOOKING_INVALID_RANGE")) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Booking start must be before end",
			});
		}
		throw error;
	}

	try {
		await db.insert(bookingCalendarLink).values({
			id: crypto.randomUUID(),
			bookingId,
			boatCalendarConnectionId: params.calendarLink.boatCalendarConnectionId,
			provider: params.calendarLink.provider,
			externalCalendarId: params.calendarLink.externalCalendarId,
			externalEventId: params.calendarLink.externalEventId,
			iCalUid: params.calendarLink.iCalUid,
			externalEventVersion: params.calendarLink.externalEventVersion,
			syncedAt: params.calendarLink.syncedAt,
			syncError: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		});
	} catch {
		await db.delete(booking).where(eq(booking.id, bookingId));
		throw new ORPCError("BAD_REQUEST", {
			message: "Failed to attach calendar link for booking",
		});
	}

	const calendarSyncResult = await syncCalendarLinkOnBookingCreate({
		bookingId,
		organizationId: params.organizationId,
		boatId: params.input.boatId,
		boatName: params.boatName,
		source: params.input.source,
		startsAt: params.input.startsAt,
		endsAt: params.input.endsAt,
		timezone: params.input.timezone,
		contactName: params.input.contactName,
		notes: params.input.notes,
		calendarLink: params.calendarLink,
	});

	await db
		.update(booking)
		.set({
			calendarSyncStatus: calendarSyncResult.status,
			updatedAt: new Date(),
		})
		.where(eq(booking.id, bookingId));

	await db
		.update(bookingCalendarLink)
		.set({
			...calendarSyncResult.calendarLinkUpdate,
			updatedAt: new Date(),
		})
		.where(eq(bookingCalendarLink.bookingId, bookingId));

	let createdDiscountApplication:
		| typeof bookingDiscountApplication.$inferSelect
		| null = null;
	if (params.resolvedDiscount) {
		const discountApplicationId = crypto.randomUUID();
		await db.insert(bookingDiscountApplication).values({
			id: discountApplicationId,
			bookingId,
			discountCodeId: params.resolvedDiscount.discountCodeId,
			code: params.resolvedDiscount.normalizedDiscountCode,
			discountType: params.resolvedDiscount.discountType,
			discountValue: params.resolvedDiscount.discountValue,
			appliedAmountCents: params.resolvedDiscount.discountAmountCents,
			appliedAt: new Date(),
		});

		await db
			.update(bookingDiscountCode)
			.set({
				usageCount: sql`${bookingDiscountCode.usageCount} + 1`,
				updatedAt: new Date(),
			})
			.where(
				eq(bookingDiscountCode.id, params.resolvedDiscount.discountCodeId)
			);

		const [selectedDiscountApplication] = await db
			.select()
			.from(bookingDiscountApplication)
			.where(eq(bookingDiscountApplication.id, discountApplicationId))
			.limit(1);

		createdDiscountApplication = selectedDiscountApplication ?? null;
	}

	const [createdBooking] = await db
		.select()
		.from(booking)
		.where(eq(booking.id, bookingId))
		.limit(1);

	if (!createdBooking) {
		throw new ORPCError("INTERNAL_SERVER_ERROR");
	}

	const [createdCalendarLink] = await db
		.select()
		.from(bookingCalendarLink)
		.where(eq(bookingCalendarLink.bookingId, bookingId))
		.limit(1);

	return {
		booking: createdBooking,
		calendarLink: createdCalendarLink,
		discountApplication: createdDiscountApplication,
	};
};

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
					userIds: [input.customerUserId, sessionUserId],
					title: "Booking created",
					body: `${managedBoat.name}: ${created.booking.startsAt.toISOString()} - ${created.booking.endsAt.toISOString()}`,
					ctaUrl: `/dashboard/bookings/${created.booking.id}`,
					metadata: { bookingId: created.booking.id },
				}),
			});

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
						ctaUrl: `/dashboard/bookings/${managedBooking.id}`,
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
							ctaUrl: `/dashboard/bookings/${managedBooking.id}`,
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
