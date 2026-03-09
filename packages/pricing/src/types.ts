import type { db } from "@my-app/db";
import type {
	listingPricingProfile,
	listingPricingRule,
} from "@my-app/db/schema/marketplace";

export type Db = typeof db;
export type PricingProfileRow = typeof listingPricingProfile.$inferSelect;
export type PricingRuleRow = typeof listingPricingRule.$inferSelect;

export interface QuoteBreakdown {
	listingId: string;
	profileId: string;
	currency: string;
	durationMinutes: number;
	baseCents: number;
	adjustmentCents: number;
	serviceFeeCents: number;
	taxCents: number;
	totalCents: number;
}

export interface QuoteInput {
	listingId: string;
	startsAt: Date;
	endsAt: Date;
	passengers?: number;
}

export interface CreatePricingProfileInput {
	listingId: string;
	organizationId: string;
	name: string;
	currency: string;
	baseHourlyPriceCents: number;
	minimumHours?: number;
	serviceFeeBps?: number;
	taxBps?: number;
	isDefault?: boolean;
}

export interface UpdatePricingProfileInput {
	id: string;
	organizationId: string;
	name?: string;
	baseHourlyPriceCents?: number;
	serviceFeeBps?: number;
	taxBps?: number;
	isDefault?: boolean;
}

export interface CreatePricingRuleInput {
	listingId: string;
	organizationId: string;
	pricingProfileId: string;
	name: string;
	ruleType: string;
	conditionJson: Record<string, unknown>;
	adjustmentType: "percent" | "flat_cents";
	adjustmentValue: number;
	priority?: number;
}
