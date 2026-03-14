export const CANCELLATION_REASON_CODES = [
	"CUSTOMER_CHANGE_OF_PLANS",
	"CUSTOMER_HEALTH_ISSUE",
	"MANAGER_OPERATIONAL_ISSUE",
	"MANAGER_WEATHER_ISSUE",
	"MANAGER_SAFETY_REJECTION",
] as const;

export type CancellationReasonCode = (typeof CANCELLATION_REASON_CODES)[number];

interface ReasonEntry {
	allowedActors: Array<"customer" | "manager">;
	label: string;
	refundOverride?: Partial<Record<"customer" | "manager", number>>; // 0–100
	requiresEvidence: boolean;
}

export const cancellationReasonCatalog: Record<
	CancellationReasonCode,
	ReasonEntry
> = {
	CUSTOMER_CHANGE_OF_PLANS: {
		label: "Change of plans",
		allowedActors: ["customer", "manager"],
		requiresEvidence: false,
		// no override — use time-window policy
	},
	CUSTOMER_HEALTH_ISSUE: {
		label: "Health issue",
		allowedActors: ["customer", "manager"],
		requiresEvidence: false,
		refundOverride: { customer: 100 }, // health issue always fully refunded for customer
	},
	MANAGER_OPERATIONAL_ISSUE: {
		label: "Operational issue",
		allowedActors: ["manager"],
		requiresEvidence: false,
		refundOverride: { manager: 100 }, // owner eats the cost
	},
	MANAGER_WEATHER_ISSUE: {
		label: "Weather conditions",
		allowedActors: ["manager"],
		requiresEvidence: false,
		refundOverride: { manager: 100 },
	},
	MANAGER_SAFETY_REJECTION: {
		label: "Safety concern",
		allowedActors: ["manager"],
		requiresEvidence: true, // evidence mandatory
		refundOverride: { manager: 0 }, // no refund when manager rejects for safety
	},
};
