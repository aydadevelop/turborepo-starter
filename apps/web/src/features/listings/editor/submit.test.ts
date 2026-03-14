import { describe, expect, it } from "vitest";

import { listingTypeOptions } from "../../../components/org/listing-editor.test-data";
import { getListingEditorDefaults } from "./defaults";
import { buildListingEditorSubmitValues } from "./submit";

describe("listing editor submit helpers", () => {
	it("maps seeded boat-rent defaults into the oRPC submit shape", () => {
		const defaults = getListingEditorDefaults({
			mode: "create",
			listingTypeOptions,
			initialValue: {
				listingTypeSlug: "vessel",
				name: "Evening Charter",
				slug: "evening-charter",
				timezone: "Europe/Berlin",
				serviceFamilyDetails: {
					boatRent: {
						capacity: 10,
						captainMode: "captained_only",
						basePort: "Sochi Marine Station",
						departureArea: "Imeretinskaya Bay",
						fuelPolicy: "included",
						depositRequired: false,
						instantBookAllowed: false,
					},
				},
			},
		});

		const result = buildListingEditorSubmitValues(defaults, {
			mode: "create",
			listingTypeOptions,
		});

		expect(result).toEqual({
			ok: true,
			data: {
				listingTypeSlug: "vessel",
				name: "Evening Charter",
				slug: "evening-charter",
				timezone: "Europe/Berlin",
				description: undefined,
				metadata: {},
				serviceFamilyDetails: {
					boatRent: {
						capacity: 10,
						captainMode: "captained_only",
						basePort: "Sochi Marine Station",
						departureArea: "Imeretinskaya Bay",
						fuelPolicy: "included",
						depositRequired: false,
						instantBookAllowed: false,
					},
				},
			},
		});
	});

	it("rejects invalid metadata before submit mapping", () => {
		const result = buildListingEditorSubmitValues(
			{
				...getListingEditorDefaults({
					mode: "create",
					listingTypeOptions,
				}),
				metadataText: "[]",
			},
			{
				mode: "create",
				listingTypeOptions,
			},
		);

		expect(result).toEqual({
			ok: false,
			message: "Metadata must be a JSON object.",
		});
	});
});
