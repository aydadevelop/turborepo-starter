import type { ListingTypeOption } from "$lib/orpc-types";

export function getDefaultListingTypeSlug(
	listingTypeOptions: ListingTypeOption[]
): string {
	return (
		listingTypeOptions.find((option) => option.isDefault)?.value ??
		listingTypeOptions[0]?.value ??
		""
	);
}

export function findListingTypeOption(
	listingTypeOptions: ListingTypeOption[],
	value: string
): ListingTypeOption | null {
	return (
		listingTypeOptions.find((option) => option.value === value.trim()) ?? null
	);
}

export function parseMetadataObject(
	metadataText: string
):
	| { ok: true; data: Record<string, unknown> | undefined }
	| { ok: false; message: string } {
	const trimmedMetadata = metadataText.trim();
	if (trimmedMetadata.length === 0) {
		return { ok: true, data: undefined };
	}

	try {
		const parsed = JSON.parse(trimmedMetadata) as unknown;
		if (
			parsed === null ||
			Array.isArray(parsed) ||
			typeof parsed !== "object"
		) {
			return { ok: false, message: "Metadata must be a JSON object." };
		}

		return { ok: true, data: parsed as Record<string, unknown> };
	} catch {
		return { ok: false, message: "Metadata must be valid JSON." };
	}
}

export function parsePositiveInteger(
	value: string,
	emptyMessage: string,
	invalidMessage: string
): { ok: true; data: number } | { ok: false; message: string } {
	const normalizedValue = value.trim();
	if (normalizedValue.length === 0) {
		return { ok: false, message: emptyMessage };
	}

	const parsedValue = Number.parseInt(normalizedValue, 10);
	if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
		return { ok: false, message: invalidMessage };
	}

	return { ok: true, data: parsedValue };
}
