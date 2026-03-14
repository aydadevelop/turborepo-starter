import type { MutationResult } from "$lib/mutation-result";
import type { OrpcInputs } from "$lib/orpc-types";

import type { CreatePricingProfileFormValues } from "./types";

export type CreatePricingProfileInput = OrpcInputs["pricing"]["createProfile"];

function parsePositiveInteger(
	value: string,
	message: string,
): MutationResult<number> {
	const parsed = Number.parseInt(value.trim(), 10);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		return { ok: false, message };
	}

	return { ok: true, data: parsed };
}

function parseNonNegativeInteger(
	value: string,
	message: string,
): MutationResult<number> {
	const parsed = Number.parseInt(value.trim(), 10);
	if (!Number.isInteger(parsed) || parsed < 0) {
		return { ok: false, message };
	}

	return { ok: true, data: parsed };
}

export function buildCreatePricingProfileInput(
	listingId: string,
	values: CreatePricingProfileFormValues,
): MutationResult<CreatePricingProfileInput> {
	const baseHourlyPriceResult = parsePositiveInteger(
		values.baseHourlyPriceCents,
		"Base hourly price must be a positive whole number.",
	);
	if (!baseHourlyPriceResult.ok) {
		return baseHourlyPriceResult;
	}

	const minimumHoursResult = parsePositiveInteger(
		values.minimumHours,
		"Minimum hours must be a positive whole number.",
	);
	if (!minimumHoursResult.ok) {
		return minimumHoursResult;
	}

	const serviceFeeBpsResult = parseNonNegativeInteger(
		values.serviceFeeBps,
		"Service fee must be a non-negative whole number.",
	);
	if (!serviceFeeBpsResult.ok) {
		return serviceFeeBpsResult;
	}

	const taxBpsResult = parseNonNegativeInteger(
		values.taxBps,
		"Tax must be a non-negative whole number.",
	);
	if (!taxBpsResult.ok) {
		return taxBpsResult;
	}

	return {
		ok: true,
		data: {
			listingId,
			name: values.name.trim(),
			currency: values.currency.trim().toUpperCase(),
			baseHourlyPriceCents: baseHourlyPriceResult.data,
			minimumHours: minimumHoursResult.data,
			serviceFeeBps: serviceFeeBpsResult.data,
			taxBps: taxBpsResult.data,
			isDefault: values.isDefault,
		},
	};
}
