export const bookingCancellationEvidenceTypeValues = [
	"photo",
	"video",
	"document",
	"message",
	"other",
] as const;

export type BookingCancellationEvidenceType =
	(typeof bookingCancellationEvidenceTypeValues)[number];

export interface BookingCancellationEvidence {
	type: BookingCancellationEvidenceType;
	url: string;
	note?: string;
}

export const bookingCancellationReasonCodeValues = [
	"CUSTOMER_CHANGE_OF_PLANS",
	"CUSTOMER_HEALTH_ISSUE",
	"OWNER_OPERATIONAL_ISSUE",
	"OWNER_WEATHER_ISSUE",
	"OWNER_SAFETY_REJECTION",
	"SYSTEM_CALENDAR_CONFLICT",
	"SYSTEM_AUTO_EXPIRY",
] as const;

export type BookingCancellationReasonCode =
	(typeof bookingCancellationReasonCodeValues)[number];

export type BookingCancellationPolicyActor = "customer" | "owner" | "system";

export interface BookingCancellationReasonConfig {
	code: BookingCancellationReasonCode;
	label: string;
	allowedActors: BookingCancellationPolicyActor[];
	requiresEvidence: boolean;
	refundPercentOverrideByActor?: Partial<
		Record<BookingCancellationPolicyActor, number>
	>;
}

export const bookingCancellationReasonCatalog: Record<
	BookingCancellationReasonCode,
	BookingCancellationReasonConfig
> = {
	CUSTOMER_CHANGE_OF_PLANS: {
		code: "CUSTOMER_CHANGE_OF_PLANS",
		label: "Customer changed plans",
		allowedActors: ["customer", "owner"],
		requiresEvidence: false,
	},
	CUSTOMER_HEALTH_ISSUE: {
		code: "CUSTOMER_HEALTH_ISSUE",
		label: "Customer health issue",
		allowedActors: ["customer", "owner"],
		requiresEvidence: false,
		refundPercentOverrideByActor: {
			customer: 100,
		},
	},
	OWNER_OPERATIONAL_ISSUE: {
		code: "OWNER_OPERATIONAL_ISSUE",
		label: "Owner operational issue",
		allowedActors: ["owner"],
		requiresEvidence: false,
		refundPercentOverrideByActor: {
			owner: 100,
		},
	},
	OWNER_WEATHER_ISSUE: {
		code: "OWNER_WEATHER_ISSUE",
		label: "Owner weather issue",
		allowedActors: ["owner", "system"],
		requiresEvidence: false,
		refundPercentOverrideByActor: {
			owner: 100,
			system: 100,
		},
	},
	OWNER_SAFETY_REJECTION: {
		code: "OWNER_SAFETY_REJECTION",
		label: "Owner safety rejection",
		allowedActors: ["owner"],
		requiresEvidence: true,
		refundPercentOverrideByActor: {
			owner: 0,
		},
	},
	SYSTEM_CALENDAR_CONFLICT: {
		code: "SYSTEM_CALENDAR_CONFLICT",
		label: "System calendar conflict",
		allowedActors: ["system"],
		requiresEvidence: false,
		refundPercentOverrideByActor: {
			system: 100,
		},
	},
	SYSTEM_AUTO_EXPIRY: {
		code: "SYSTEM_AUTO_EXPIRY",
		label: "System auto expiry",
		allowedActors: ["system"],
		requiresEvidence: false,
		refundPercentOverrideByActor: {
			system: 0,
		},
	},
};

export interface BookingCancellationPolicyProfile {
	customer: {
		fullRefundHoursBeforeStart: number;
		partialRefundHoursBeforeStart: number;
		partialRefundPercent: number;
		lateRefundPercent: number;
	};
	owner: {
		defaultRefundPercent: number;
	};
	system: {
		beforeStartRefundPercent: number;
		afterStartRefundPercent: number;
	};
}

export const defaultBookingCancellationPolicyProfile: BookingCancellationPolicyProfile =
	{
		customer: {
			fullRefundHoursBeforeStart: 24,
			partialRefundHoursBeforeStart: 6,
			partialRefundPercent: 50,
			lateRefundPercent: 0,
		},
		owner: {
			defaultRefundPercent: 100,
		},
		system: {
			beforeStartRefundPercent: 100,
			afterStartRefundPercent: 0,
		},
	};
