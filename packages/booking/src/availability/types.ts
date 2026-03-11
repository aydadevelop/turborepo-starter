import type { db } from "@my-app/db";
import type {
	listingAvailabilityBlock,
	listingAvailabilityException,
	listingAvailabilityRule,
} from "@my-app/db/schema/availability";

export type Db = typeof db;

export type AvailabilityRuleRow =
	typeof listingAvailabilityRule.$inferSelect;
export type AvailabilityBlockRow =
	typeof listingAvailabilityBlock.$inferSelect;
export type AvailabilityExceptionRow =
	typeof listingAvailabilityException.$inferSelect;

export interface CreateAvailabilityRuleInput {
	listingId: string;
	organizationId: string;
	dayOfWeek: number;
	startMinute: number;
	endMinute: number;
}

export interface CreateAvailabilityBlockInput {
	listingId: string;
	organizationId: string;
	startsAt: Date;
	endsAt: Date;
	reason?: string;
}

export interface CreateAvailabilityExceptionInput {
	listingId: string;
	organizationId: string;
	date: string;
	isAvailable: boolean;
	startMinute?: number;
	endMinute?: number;
	reason?: string;
}
