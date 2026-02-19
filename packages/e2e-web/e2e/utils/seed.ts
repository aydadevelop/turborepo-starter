export const SEED_CREDENTIALS = {
	admin: {
		email: "admin@admin.com",
		password: "admin",
	},
	owner: {
		email: "boat@boat.com",
		password: "boatboat",
	},
} as const;

export const SEED_IDS = {
	boat: {
		aurora: "seed_boat_aurora",
	},
	booking: {
		confirmed: "seed_booking_aurora_confirmed",
		pending: "seed_booking_odyssey_pending",
	},
} as const;
