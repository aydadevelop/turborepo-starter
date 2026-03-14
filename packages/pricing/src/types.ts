import type { db } from "@my-app/db";
import type {
	listingPricingProfile,
	listingPricingRule,
} from "@my-app/db/schema/marketplace";

export type Db = typeof db;
export type PricingProfileRow = typeof listingPricingProfile.$inferSelect;
export type PricingRuleRow = typeof listingPricingRule.$inferSelect;

export interface PricingProfileRuleSummary {
	activeRuleCount: number;
	profileId: string;
	totalRuleCount: number;
}

export interface PricingWorkspaceState {
	currencies: string[];
	defaultProfileId: string | null;
	hasPricing: boolean;
	profileRuleSummaries: PricingProfileRuleSummary[];
	profiles: PricingProfileRow[];
	totalActiveRuleCount: number;
	totalRuleCount: number;
}

export interface QuoteBreakdown {
	adjustmentCents: number;
	baseCents: number;
	currency: string;
	durationMinutes: number;
	listingId: string;
	pricingFactors: {
		serviceFeeBps: number;
		taxBps: number;
	};
	profileId: string;
	serviceFeeCents: number;
	subtotalCents: number;
	taxCents: number;
	totalCents: number;
}

export interface DiscountedQuoteBreakdown {
	adjustmentCents: number;
	baseCents: number;
	currency: string;
	discountAmountCents: number;
	discountedServiceFeeCents: number;
	discountedSubtotalCents: number;
	discountedTaxCents: number;
	discountedTotalCents: number;
	durationMinutes: number;
	listingId: string;
	profileId: string;
	serviceFeeCents: number;
	subtotalCents: number;
	taxCents: number;
	totalCents: number;
}

export interface QuoteInput {
	endsAt: Date;
	listingId: string;
	passengers?: number;
	startsAt: Date;
}

export interface ResolvedPricingContext {
	profile: PricingProfileRow;
	rules: PricingRuleRow[];
}

export interface CreatePricingProfileInput {
	baseHourlyPriceCents: number;
	currency: string;
	isDefault?: boolean;
	listingId: string;
	minimumHours?: number;
	name: string;
	organizationId: string;
	serviceFeeBps?: number;
	taxBps?: number;
}

export interface UpdatePricingProfileInput {
	baseHourlyPriceCents?: number;
	id: string;
	isDefault?: boolean;
	name?: string;
	organizationId: string;
	serviceFeeBps?: number;
	taxBps?: number;
}

export interface CreatePricingRuleInput {
	adjustmentType: "percent" | "flat_cents";
	adjustmentValue: number;
	conditionJson: Record<string, unknown>;
	listingId: string;
	name: string;
	organizationId: string;
	pricingProfileId: string;
	priority?: number;
	ruleType: string;
}
