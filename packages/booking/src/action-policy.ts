import { eq } from "drizzle-orm";
import { organization } from "@my-app/db/schema/auth";
import z from "zod";
import type { Db } from "./types";

export type BookingActionPolicyAction = "cancellation" | "shift";
export type BookingActionPolicyActor =
	| "customer"
	| "owner"
	| "manager"
	| "system";

interface BookingActionWindowPolicyItem {
	customerLatestHoursBeforeStart: number;
	managerLatestHoursBeforeStart: number;
	ownerLatestHoursBeforeStart: number;
	systemLatestHoursBeforeStart: number;
}

export interface BookingActionWindowPolicyProfile {
	cancellation: BookingActionWindowPolicyItem;
	shift: BookingActionWindowPolicyItem;
}

export const defaultBookingActionWindowPolicyProfile: BookingActionWindowPolicyProfile =
	{
		cancellation: {
			customerLatestHoursBeforeStart: 0,
			ownerLatestHoursBeforeStart: -12,
			managerLatestHoursBeforeStart: -12,
			systemLatestHoursBeforeStart: -24,
		},
		shift: {
			customerLatestHoursBeforeStart: 2,
			ownerLatestHoursBeforeStart: 1,
			managerLatestHoursBeforeStart: 1,
			systemLatestHoursBeforeStart: 0,
		},
	};

const bookingActionWindowPolicyItemSchema = z.object({
	customerLatestHoursBeforeStart: z.number().min(-168).max(720).optional(),
	ownerLatestHoursBeforeStart: z.number().min(-168).max(720).optional(),
	managerLatestHoursBeforeStart: z.number().min(-168).max(720).optional(),
	systemLatestHoursBeforeStart: z.number().min(-168).max(720).optional(),
});

const bookingActionPolicyMetadataSchema = z
	.object({
		bookingActionPolicy: z
			.object({
				cancellation: bookingActionWindowPolicyItemSchema.optional(),
				shift: bookingActionWindowPolicyItemSchema.optional(),
			})
			.optional(),
	})
	.passthrough();

const resolvePolicyItem = (
	base: BookingActionWindowPolicyItem,
	override:
		| z.infer<typeof bookingActionWindowPolicyItemSchema>
		| undefined,
): BookingActionWindowPolicyItem => ({
	customerLatestHoursBeforeStart:
		override?.customerLatestHoursBeforeStart ??
		base.customerLatestHoursBeforeStart,
	ownerLatestHoursBeforeStart:
		override?.ownerLatestHoursBeforeStart ?? base.ownerLatestHoursBeforeStart,
	managerLatestHoursBeforeStart:
		override?.managerLatestHoursBeforeStart ??
		base.managerLatestHoursBeforeStart,
	systemLatestHoursBeforeStart:
		override?.systemLatestHoursBeforeStart ??
		base.systemLatestHoursBeforeStart,
});

export const resolveBookingActionWindowPolicyProfile = (
	metadataRaw: string | null | undefined,
): BookingActionWindowPolicyProfile => {
	if (!metadataRaw) {
		return defaultBookingActionWindowPolicyProfile;
	}

	try {
		const parsedJson = JSON.parse(metadataRaw);
		const parsed = bookingActionPolicyMetadataSchema.safeParse(parsedJson);
		if (!(parsed.success && parsed.data.bookingActionPolicy)) {
			return defaultBookingActionWindowPolicyProfile;
		}

		const overrides = parsed.data.bookingActionPolicy;
		return {
			cancellation: resolvePolicyItem(
				defaultBookingActionWindowPolicyProfile.cancellation,
				overrides.cancellation,
			),
			shift: resolvePolicyItem(
				defaultBookingActionWindowPolicyProfile.shift,
				overrides.shift,
			),
		};
	} catch {
		return defaultBookingActionWindowPolicyProfile;
	}
};

const toActorPolicyKey = (actor: BookingActionPolicyActor) => {
	switch (actor) {
		case "customer":
			return "customerLatestHoursBeforeStart" as const;
		case "owner":
			return "ownerLatestHoursBeforeStart" as const;
		case "manager":
			return "managerLatestHoursBeforeStart" as const;
		case "system":
			return "systemLatestHoursBeforeStart" as const;
		default:
			throw new Error(`Unknown actor: ${actor satisfies never}`);
	}
};

/** Result of evaluating whether an action is permitted at the current time. */
export interface BookingActionPolicy {
	action: BookingActionPolicyAction;
	actor: BookingActionPolicyActor;
	allowed: boolean;
	hoursUntilStart: number;
	minHoursRequired: number;
}

/**
 * Evaluates whether a booking action (cancellation/shift) is permitted for
 * the given actor at the current time, given the policy profile.
 *
 * Returns a structured result instead of throwing, so callers can decide
 * how to surface the restriction.
 */
export const evaluateBookingActionWindow = (params: {
	action: BookingActionPolicyAction;
	actor: BookingActionPolicyActor;
	bookingStartsAt: Date;
	policyProfile: BookingActionWindowPolicyProfile;
	now?: Date;
}): BookingActionPolicy => {
	const now = params.now ?? new Date();
	const hoursUntilStart =
		(params.bookingStartsAt.getTime() - now.getTime()) / (60 * 60 * 1000);
	const actorPolicyKey = toActorPolicyKey(params.actor);
	const minHoursRequired = params.policyProfile[params.action][actorPolicyKey];

	return {
		action: params.action,
		actor: params.actor,
		allowed: hoursUntilStart >= minHoursRequired,
		hoursUntilStart,
		minHoursRequired,
	};
};

/**
 * Load the organization's booking action policy profile from its metadata,
 * falling back to the default if no override is configured.
 */
export const loadOrganizationBookingActionPolicyProfile = async (
	organizationId: string,
	db: Db,
): Promise<BookingActionWindowPolicyProfile> => {
	const [organizationRow] = await db
		.select({ metadata: organization.metadata })
		.from(organization)
		.where(eq(organization.id, organizationId))
		.limit(1);

	return resolveBookingActionWindowPolicyProfile(
		organizationRow?.metadata
			? JSON.stringify(organizationRow.metadata)
			: null,
	);
};
