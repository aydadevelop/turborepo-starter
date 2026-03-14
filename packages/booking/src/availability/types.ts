import type { db } from "@my-app/db";
import type {
	listingAvailabilityBlock,
	listingAvailabilityException,
	listingAvailabilityRule,
} from "@my-app/db/schema/availability";

export type Db = typeof db;

export type AvailabilityRuleRow = typeof listingAvailabilityRule.$inferSelect;
export type AvailabilityBlockRow = typeof listingAvailabilityBlock.$inferSelect;
export type AvailabilityExceptionRow =
	typeof listingAvailabilityException.$inferSelect;

export interface AvailabilityWorkspaceState {
	activeBlockCount: number;
	activeRuleCount: number;
	blocks: AvailabilityBlockRow[];
	exceptionCount: number;
	exceptions: AvailabilityExceptionRow[];
	hasAvailability: boolean;
	rules: AvailabilityRuleRow[];
}

export interface CreateAvailabilityRuleInput {
	dayOfWeek: number;
	endMinute: number;
	listingId: string;
	organizationId: string;
	startMinute: number;
}

export interface CreateAvailabilityBlockInput {
	endsAt: Date;
	listingId: string;
	organizationId: string;
	reason?: string;
	startsAt: Date;
}

export interface CreateAvailabilityExceptionInput {
	date: string;
	endMinute?: number;
	isAvailable: boolean;
	listingId: string;
	organizationId: string;
	reason?: string;
	startMinute?: number;
}
