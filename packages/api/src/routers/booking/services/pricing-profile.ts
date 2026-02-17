import { db } from "@full-stack-cf-app/db";
import { boatPricingProfile } from "@full-stack-cf-app/db/schema/boat";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, gt, isNull, lte, or } from "drizzle-orm";

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
