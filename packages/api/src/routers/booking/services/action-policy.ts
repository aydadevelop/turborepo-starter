import { db } from "@full-stack-cf-app/db";
import { organization } from "@full-stack-cf-app/db/schema/auth";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import z from "zod";

export type BookingActionPolicyAction = "cancellation" | "shift";
export type BookingActionPolicyActor = "customer" | "owner" | "manager" | "system";

interface BookingActionWindowPolicyItem {
	customerLatestHoursBeforeStart: number;
	ownerLatestHoursBeforeStart: number;
	managerLatestHoursBeforeStart: number;
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
	override: z.infer<typeof bookingActionWindowPolicyItemSchema> | undefined
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
		override?.systemLatestHoursBeforeStart ?? base.systemLatestHoursBeforeStart,
});

export const resolveBookingActionWindowPolicyProfile = (
	metadataRaw: string | null | undefined
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
				overrides.cancellation
			),
			shift: resolvePolicyItem(
				defaultBookingActionWindowPolicyProfile.shift,
				overrides.shift
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
	}
};

export const assertBookingActionAllowedByWindow = (params: {
	action: BookingActionPolicyAction;
	actor: BookingActionPolicyActor;
	bookingStartsAt: Date;
	policyProfile: BookingActionWindowPolicyProfile;
	now?: Date;
}) => {
	const now = params.now ?? new Date();
	const hoursUntilStart =
		(params.bookingStartsAt.getTime() - now.getTime()) / (60 * 60 * 1000);
	const actorPolicyKey = toActorPolicyKey(params.actor);
	const minHoursUntilStart = params.policyProfile[params.action][actorPolicyKey];
	if (hoursUntilStart < minHoursUntilStart) {
		throw new ORPCError("BAD_REQUEST", {
			message: `${params.action} is no longer allowed for ${params.actor} at this time`,
		});
	}
};

export const loadOrganizationBookingActionPolicyProfile = async (
	organizationId: string
) => {
	const [organizationRow] = await db
		.select({
			metadata: organization.metadata,
		})
		.from(organization)
		.where(eq(organization.id, organizationId))
		.limit(1);

	return resolveBookingActionWindowPolicyProfile(organizationRow?.metadata);
};
