import { isSupportedTimezone } from "@my-app/reference-data/timezones";
import { z } from "zod";

import type { ListingEditorContext } from "./types";
import {
	findListingTypeOption,
	parseMetadataObject,
	parsePositiveInteger,
} from "./shared";

const listingEditorBaseSchema = z.object({
	boatRentBasePort: z.string(),
	boatRentCapacity: z.string(),
	boatRentCaptainMode: z.enum([
		"captained_only",
		"self_drive_only",
		"captain_optional",
	]),
	boatRentDepartureArea: z.string(),
	boatRentDepositRequired: z.boolean(),
	boatRentFuelPolicy: z.enum([
		"included",
		"charged_by_usage",
		"return_same_level",
	]),
	boatRentInstantBookAllowed: z.boolean(),
	description: z.string().max(2000),
	excursionChildFriendly: z.boolean(),
	excursionDurationMinutes: z.string(),
	excursionGroupFormat: z.enum(["group", "private", "both"]),
	excursionInstantBookAllowed: z.boolean(),
	excursionMaxGroupSize: z.string(),
	excursionMeetingPoint: z.string(),
	excursionPrimaryLanguage: z.string(),
	excursionTicketsIncluded: z.boolean(),
	listingTypeSlug: z.string(),
	metadataText: z.string(),
	name: z.string().trim().min(1, "Name is required.").max(200),
	slug: z
		.string()
		.trim()
		.min(1, "Slug is required.")
		.max(200)
		.regex(
			/^[a-z0-9-]+$/,
			"Slug can only contain lowercase letters, numbers, and hyphens."
		),
	timezone: z
		.string()
		.trim()
		.min(1, "Timezone is required.")
		.refine(
			(value) => isSupportedTimezone(value),
			"Use a valid IANA timezone such as UTC or Europe/Berlin."
		),
});

export function createListingEditorSchema({
	mode,
	listingTypeOptions,
}: ListingEditorContext) {
	return listingEditorBaseSchema.superRefine((value, ctx) => {
		const selectedListingType = findListingTypeOption(
			listingTypeOptions,
			value.listingTypeSlug
		);

		if (mode === "create" && !selectedListingType) {
			ctx.addIssue({
				code: "custom",
				path: ["listingTypeSlug"],
				message:
					listingTypeOptions.length === 0
						? "No listing types are currently available for this organization."
						: "Select a listing type.",
			});
		}

		const metadataResult = parseMetadataObject(value.metadataText);
		if (!metadataResult.ok) {
			ctx.addIssue({
				code: "custom",
				path: ["metadataText"],
				message: metadataResult.message,
			});
		}

		if (selectedListingType?.serviceFamily === "boat_rent") {
			const capacityResult = parsePositiveInteger(
				value.boatRentCapacity,
				"Capacity is required for boat-rent listings.",
				"Capacity must be a positive whole number for boat-rent listings."
			);
			if (!capacityResult.ok) {
				ctx.addIssue({
					code: "custom",
					path: ["boatRentCapacity"],
					message: capacityResult.message,
				});
			}

			if (value.boatRentBasePort.trim().length === 0) {
				ctx.addIssue({
					code: "custom",
					path: ["boatRentBasePort"],
					message: "Base port is required for boat-rent listings.",
				});
			}

			if (value.boatRentDepartureArea.trim().length === 0) {
				ctx.addIssue({
					code: "custom",
					path: ["boatRentDepartureArea"],
					message: "Departure area is required for boat-rent listings.",
				});
			}
		}

		if (selectedListingType?.serviceFamily === "excursions") {
			if (value.excursionMeetingPoint.trim().length === 0) {
				ctx.addIssue({
					code: "custom",
					path: ["excursionMeetingPoint"],
					message: "Meeting point is required for excursion listings.",
				});
			}

			const durationResult = parsePositiveInteger(
				value.excursionDurationMinutes,
				"Duration is required for excursion listings.",
				"Duration must be a positive whole number of minutes for excursion listings."
			);
			if (!durationResult.ok) {
				ctx.addIssue({
					code: "custom",
					path: ["excursionDurationMinutes"],
					message: durationResult.message,
				});
			}

			const groupSizeResult = parsePositiveInteger(
				value.excursionMaxGroupSize,
				"Max group size is required for excursion listings.",
				"Max group size must be a positive whole number for excursion listings."
			);
			if (!groupSizeResult.ok) {
				ctx.addIssue({
					code: "custom",
					path: ["excursionMaxGroupSize"],
					message: groupSizeResult.message,
				});
			}

			if (value.excursionPrimaryLanguage.trim().length === 0) {
				ctx.addIssue({
					code: "custom",
					path: ["excursionPrimaryLanguage"],
					message: "Primary language is required for excursion listings.",
				});
			}
		}
	});
}
