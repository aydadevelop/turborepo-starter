import { and, eq, isNull } from "drizzle-orm";
import {
	listingPricingProfile,
	listingPricingRule,
} from "@my-app/db/schema/marketplace";

import { resolveApplicableRules } from "./rule-resolver";
import type { Db, QuoteBreakdown, QuoteInput } from "./types";

export async function calculateQuote(
	input: QuoteInput,
	db: Db,
): Promise<QuoteBreakdown> {
	const [profile] = await db
		.select()
		.from(listingPricingProfile)
		.where(
			and(
				eq(listingPricingProfile.listingId, input.listingId),
				eq(listingPricingProfile.isDefault, true),
				isNull(listingPricingProfile.archivedAt),
			),
		)
		.limit(1);
	if (!profile) throw new Error("NO_PRICING_PROFILE");

	const rules = await db
		.select()
		.from(listingPricingRule)
		.where(
			and(
				eq(listingPricingRule.pricingProfileId, profile.id),
				eq(listingPricingRule.isActive, true),
			),
		);

	const durationMinutes = Math.round(
		(input.endsAt.getTime() - input.startsAt.getTime()) / 60000,
	);
	const baseCents = Math.round(
		(profile.baseHourlyPriceCents * durationMinutes) / 60,
	);

	const passengerCount = input.passengers ?? 0;
	const bookingDayOfWeek = input.startsAt.getUTCDay();

	const applicable = resolveApplicableRules(rules, (rule) => {
		const cond = rule.conditionJson;
		if (cond.alwaysApply) return true;
		if (Array.isArray(cond.days) && !cond.days.includes(bookingDayOfWeek)) return false;
		if (
			typeof cond.minPassengers === "number" &&
			passengerCount < cond.minPassengers
		)
			return false;
		if (
			typeof cond.minDurationMinutes === "number" &&
			durationMinutes < cond.minDurationMinutes
		)
			return false;
		return true;
	});

	let adjustmentCents = 0;
	for (const rule of applicable) {
		if (rule.adjustmentType === "percent") {
			adjustmentCents += Math.round((baseCents * rule.adjustmentValue) / 100);
		} else {
			adjustmentCents += rule.adjustmentValue;
		}
	}

	const subtotal = baseCents + adjustmentCents;
	const serviceFeeCents = Math.round((subtotal * profile.serviceFeeBps) / 10000);
	const taxCents = Math.round(
		((subtotal + serviceFeeCents) * profile.taxBps) / 10000,
	);
	const totalCents = subtotal + serviceFeeCents + taxCents;

	return {
		listingId: input.listingId,
		profileId: profile.id,
		currency: profile.currency,
		durationMinutes,
		baseCents,
		adjustmentCents,
		serviceFeeCents,
		taxCents,
		totalCents,
	};
}
