import type {
	BookingCreateInput,
	StorefrontBookingSlotQuote,
	StorefrontBookingSurfaceInput,
	StorefrontBookingSurfaceSlot,
} from "$lib/orpc-types";

export const normalizeAppliedDiscountCode = (
	value: string
): string | undefined => {
	const trimmed = value.trim();
	return trimmed ? trimmed.toUpperCase() : undefined;
};

export const buildBoatRentBookingSurfaceInput = (params: {
	appliedDiscountCode: string;
	listingId: string;
	passengerCount: number | undefined;
	requestedDurationMinutes: number | undefined;
	selectedDate: string;
}): StorefrontBookingSurfaceInput | null => {
	if (!(params.selectedDate && params.requestedDurationMinutes)) {
		return null;
	}

	return {
		listingId: params.listingId,
		date: params.selectedDate,
		durationMinutes: params.requestedDurationMinutes,
		passengers: params.passengerCount,
		discountCode: normalizeAppliedDiscountCode(params.appliedDiscountCode),
	};
};

export const buildBoatRentBookingRequestInput = (params: {
	contactEmail: string;
	contactName: string;
	contactPhone: string;
	discountCode: string;
	listingId: string;
	notes: string;
	passengers: number | undefined;
	selectedSlot: StorefrontBookingSurfaceSlot | null;
	specialRequests: string;
	timezone: string | undefined;
}): BookingCreateInput | null => {
	if (
		!params.selectedSlot ||
		params.selectedSlot.status !== "available" ||
		!params.selectedSlot.quote
	) {
		return null;
	}

	return {
		listingId: params.listingId,
		startsAt: params.selectedSlot.startsAt,
		endsAt: params.selectedSlot.endsAt,
		passengers: params.passengers,
		contactName: params.contactName.trim() || undefined,
		contactPhone: params.contactPhone.trim() || undefined,
		contactEmail: params.contactEmail.trim() || undefined,
		timezone: params.timezone,
		notes: params.notes.trim() || undefined,
		specialRequests: params.specialRequests.trim() || undefined,
		currency: params.selectedSlot.quote.currency,
		discountCode: normalizeAppliedDiscountCode(params.discountCode),
	};
};

export const getDisplayedBoatRentQuote = (
	quote: StorefrontBookingSlotQuote
): {
	appliedDiscountCode: string | null;
	discountAmountCents: number;
	feeAndTaxCents: number;
	subtotalCents: number;
	totalCents: number;
} => {
	if (quote.discountPreview?.status === "applied") {
		return {
			appliedDiscountCode: quote.discountPreview.code,
			discountAmountCents: quote.discountPreview.appliedAmountCents,
			feeAndTaxCents:
				(quote.discountPreview.discountedServiceFeeCents ?? 0) +
				(quote.discountPreview.discountedTaxCents ?? 0),
			subtotalCents:
				quote.discountPreview.discountedSubtotalCents ?? quote.subtotalCents,
			totalCents:
				quote.discountPreview.discountedTotalCents ?? quote.totalCents,
		};
	}

	return {
		appliedDiscountCode: null,
		discountAmountCents: 0,
		feeAndTaxCents: quote.serviceFeeCents + quote.taxCents,
		subtotalCents: quote.subtotalCents,
		totalCents: quote.totalCents,
	};
};
