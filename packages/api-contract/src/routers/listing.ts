import { isSupportedTimezone } from "@my-app/reference-data/timezones";
import { oc } from "@orpc/contract";
import z from "zod";
import {
	createCollectionOutputSchema,
	createOffsetPageInputSchema,
	optionalTrimmedString,
	sortDirectionSchema,
} from "../contracts/shared";

const listingOutputSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	listingTypeSlug: z.string(),
	name: z.string(),
	slug: z.string(),
	description: z.string().nullable(),
	status: z.enum(["draft", "active", "maintenance", "inactive"]),
	isActive: z.boolean(),
	metadata: z.record(z.string(), z.unknown()).nullable(),
	timezone: z.string(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

const listingTypeOptionSchema = z.object({
	defaultAmenityKeys: z.array(z.string()),
	icon: z.string().nullable().optional(),
	isDefault: z.boolean(),
	label: z.string(),
	metadataJsonSchema: z.record(z.string(), z.unknown()),
	requiredFields: z.array(z.string()),
	serviceFamily: z.enum(["boat_rent", "excursions"]),
	serviceFamilyPolicy: z.object({
		availabilityMode: z.enum(["duration", "schedule"]),
		customerPresentation: z.object({
			bookingMode: z.enum(["request", "book"]),
			customerFocus: z.enum(["asset", "experience"]),
			reviewsMode: z.enum(["standard", "validated"]),
		}),
		defaults: z.object({
			moderationRequired: z.boolean(),
			requiresLocation: z.boolean(),
		}),
		key: z.enum(["boat_rent", "excursions"]),
		label: z.string(),
		operatorSections: z.array(
			z.enum([
				"basics",
				"pricing",
				"availability",
				"assets",
				"calendar",
				"publish",
			])
		),
		profileEditor: z.object({
			title: z.string(),
			description: z.string(),
			fields: z.array(
				z.object({
					key: z.string(),
					label: z.string(),
					kind: z.enum(["text", "integer", "boolean", "enum"]),
					required: z.boolean(),
					helpText: z.string().optional(),
					options: z
						.array(
							z.object({
								value: z.string(),
								label: z.string(),
							})
						)
						.optional(),
				})
			),
		}),
	}),
	supportedPricingModels: z.array(z.string()),
	value: z.string(),
});

const boatRentProfileSchema = z.object({
	capacity: z.number().int().positive().nullable(),
	captainMode: z.enum([
		"captained_only",
		"self_drive_only",
		"captain_optional",
	]),
	basePort: z.string().nullable(),
	departureArea: z.string().nullable(),
	fuelPolicy: z.enum(["included", "charged_by_usage", "return_same_level"]),
	depositRequired: z.boolean(),
	instantBookAllowed: z.boolean(),
});

const excursionProfileSchema = z.object({
	meetingPoint: z.string().nullable(),
	durationMinutes: z.number().int().positive().nullable(),
	groupFormat: z.enum(["group", "private", "both"]),
	maxGroupSize: z.number().int().positive().nullable(),
	primaryLanguage: z.string().nullable(),
	ticketsIncluded: z.boolean(),
	childFriendly: z.boolean(),
	instantBookAllowed: z.boolean(),
});

const serviceFamilyDetailsInputSchema = z
	.object({
		boatRent: boatRentProfileSchema.partial().optional(),
		excursion: excursionProfileSchema.partial().optional(),
	})
	.optional();

const timezoneSchema = z
	.string()
	.refine(isSupportedTimezone, "Timezone must be a valid IANA timezone");

const createListingInputSchema = z.object({
	listingTypeSlug: z.string().min(1),
	name: z.string().min(1).max(200),
	slug: z.string().regex(/^[a-z0-9-]+$/),
	description: z.string().max(2000).optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
	serviceFamilyDetails: serviceFamilyDetailsInputSchema,
	timezone: timezoneSchema.optional(),
});

const updateListingInputSchema = z.object({
	id: z.string(),
	name: z.string().min(1).max(200).optional(),
	description: z.string().max(2000).optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
	serviceFamilyDetails: serviceFamilyDetailsInputSchema,
	timezone: timezoneSchema.optional(),
});

const listingListSortBySchema = z.enum([
	"created_at",
	"updated_at",
	"name",
	"status",
]);

const listingListFilterSchema = z.object({
	listingTypeSlug: z.string().min(1).optional(),
	serviceFamily: z.enum(["boat_rent", "excursions"]).optional(),
	status: listingOutputSchema.shape.status.optional(),
});

const listListingsInputSchema = z.object({
	filter: listingListFilterSchema.optional(),
	page: createOffsetPageInputSchema({
		defaultLimit: 20,
		maxLimit: 100,
	}).default({
		limit: 20,
		offset: 0,
	}),
	search: optionalTrimmedString(200),
	sort: z
		.object({
			by: listingListSortBySchema,
			dir: sortDirectionSchema,
		})
		.optional(),
});

const listListingsOutputSchema = createCollectionOutputSchema(listingOutputSchema);

const listAvailableTypesOutputSchema = z.object({
	defaultValue: z.string().nullable(),
	items: z.array(listingTypeOptionSchema),
});

const getCreateEditorStateOutputSchema = z.object({
	defaults: z.object({
		timezone: timezoneSchema,
	}),
	listingTypes: listAvailableTypesOutputSchema,
});

const publicationStateOutputSchema = z.object({
	activePublicationCount: z.number().int(),
	isPublished: z.boolean(),
	requiresReview: z.boolean(),
});

const getWorkspaceStateOutputSchema = z.object({
	boatRentProfile: boatRentProfileSchema
		.extend({
			listingId: z.string(),
		})
		.nullable(),
	excursionProfile: excursionProfileSchema
		.extend({
			listingId: z.string(),
		})
		.nullable(),
	listing: listingOutputSchema,
	listingType: listingTypeOptionSchema.nullable(),
	publication: publicationStateOutputSchema,
	serviceFamilyPolicy:
		listingTypeOptionSchema.shape.serviceFamilyPolicy.nullable(),
});

const listingAssetWorkspaceItemSchema = z.object({
	access: z.enum(["public", "private"]),
	altText: z.string().nullable(),
	id: z.string(),
	isPrimary: z.boolean(),
	kind: z.enum(["image", "document", "other"]),
	publicUrl: z.string().nullable(),
	sortOrder: z.number().int(),
	storageKey: z.string(),
	storageProvider: z.string(),
});

const assetWorkspaceStateOutputSchema = z.object({
	documentCount: z.number().int(),
	imageCount: z.number().int(),
	items: z.array(listingAssetWorkspaceItemSchema),
	primaryImageId: z.string().nullable(),
	totalCount: z.number().int(),
});

const channelTypeSchema = z
	.enum(["own_site", "platform_marketplace"])
	.optional();

export const listingContract = {
	create: oc
		.route({ tags: ["Listings"], summary: "Create a listing" })
		.input(createListingInputSchema)
		.output(listingOutputSchema),

	update: oc
		.route({ tags: ["Listings"], summary: "Update a listing" })
		.input(updateListingInputSchema)
		.output(listingOutputSchema),

	get: oc
		.route({ tags: ["Listings"], summary: "Get a listing by ID" })
		.input(z.object({ id: z.string() }))
		.output(listingOutputSchema),

	getWorkspaceState: oc
		.route({
			tags: ["Listings"],
			summary: "Get backend-owned workspace state for listing editing",
		})
		.input(z.object({ id: z.string() }))
		.output(getWorkspaceStateOutputSchema),

	getAssetWorkspaceState: oc
		.route({
			tags: ["Listings"],
			summary: "Get asset workspace state for a listing",
		})
		.input(z.object({ id: z.string() }))
		.output(assetWorkspaceStateOutputSchema),

	list: oc
		.route({
			tags: ["Listings"],
			summary: "List listings for the organization",
		})
		.input(listListingsInputSchema)
		.output(listListingsOutputSchema),

	listAvailableTypes: oc
		.route({
			tags: ["Listings"],
			summary: "List available listing types for the organization",
		})
		.input(z.object({}))
		.output(listAvailableTypesOutputSchema),

	getCreateEditorState: oc
		.route({
			tags: ["Listings"],
			summary: "Get backend-owned editor state for listing creation",
		})
		.input(z.object({}))
		.output(getCreateEditorStateOutputSchema),

	publish: oc
		.route({ tags: ["Listings"], summary: "Publish a listing" })
		.input(z.object({ id: z.string(), channelType: channelTypeSchema }))
		.output(listingOutputSchema),

	unpublish: oc
		.route({ tags: ["Listings"], summary: "Unpublish a listing" })
		.input(z.object({ id: z.string() }))
		.output(listingOutputSchema),
};
