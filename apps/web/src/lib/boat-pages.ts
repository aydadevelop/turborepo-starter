const slugFragment = (value: string): string =>
	value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 60);

export const buildBoatPageRef = (boatId: string, slug: string): string => {
	const normalizedSlug = slugFragment(slug);
	if (!normalizedSlug) {
		return boatId;
	}
	return `${boatId}--${normalizedSlug}`;
};

export const parseBoatIdFromRef = (boatRef: string): string => {
	const [boatId] = boatRef.split("--");
	return boatId?.trim() ?? "";
};
