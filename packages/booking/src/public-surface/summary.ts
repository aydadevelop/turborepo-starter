import type {
	PublicBookingSurfaceSlot,
	PublicBookingSurfaceSummary,
} from "../types";

export const summarizeSlots = (
	slots: PublicBookingSurfaceSlot[],
): PublicBookingSurfaceSummary => ({
	availableSlotCount: slots.filter((slot) => slot.status === "available")
		.length,
	blockedSlotCount: slots.filter((slot) => slot.status === "blocked").length,
	minimumDurationSlotCount: slots.filter(
		(slot) => slot.status === "minimum_duration_not_met",
	).length,
	noticeTooShortSlotCount: slots.filter(
		(slot) => slot.status === "notice_too_short",
	).length,
	specialPricedSlotCount: slots.filter(
		(slot) => slot.quote?.hasSpecialPricing === true,
	).length,
	totalSlotCount: slots.length,
});
