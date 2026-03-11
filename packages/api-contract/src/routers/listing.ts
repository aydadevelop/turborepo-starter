import { oc } from "@orpc/contract";
import { isSupportedTimezone } from "@my-app/reference-data/timezones";
import z from "zod";

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
	icon: z.string().nullable().optional(),
	isDefault: z.boolean(),
	label: z.string(),
	metadataJsonSchema: z.record(z.string(), z.unknown()),
	value: z.string(),
});

const timezoneSchema = z
	.string()
	.refine(isSupportedTimezone, "Timezone must be a valid IANA timezone");

const createListingInputSchema = z.object({
	listingTypeSlug: z.string().min(1),
	name: z.string().min(1).max(200),
	slug: z.string().regex(/^[a-z0-9-]+$/),
	description: z.string().max(2000).optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
	timezone: timezoneSchema.optional(),
});

const updateListingInputSchema = z.object({
	id: z.string(),
	name: z.string().min(1).max(200).optional(),
	description: z.string().max(2000).optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
	timezone: timezoneSchema.optional(),
});

const listListingsOutputSchema = z.object({
	items: z.array(listingOutputSchema),
	total: z.number().int(),
});

const listAvailableTypesOutputSchema = z.object({
	defaultValue: z.string().nullable(),
	items: z.array(listingTypeOptionSchema),
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

	list: oc
		.route({ tags: ["Listings"], summary: "List listings for the organization" })
		.input(
			z.object({
				limit: z.number().int().min(1).max(100).default(20),
				offset: z.number().int().min(0).default(0),
			}),
		)
		.output(listListingsOutputSchema),

	listAvailableTypes: oc
		.route({
			tags: ["Listings"],
			summary: "List available listing types for the organization",
		})
		.input(z.object({}))
		.output(listAvailableTypesOutputSchema),

	publish: oc
		.route({ tags: ["Listings"], summary: "Publish a listing" })
		.input(z.object({ id: z.string(), channelType: channelTypeSchema }))
		.output(listingOutputSchema),

	unpublish: oc
		.route({ tags: ["Listings"], summary: "Unpublish a listing" })
		.input(z.object({ id: z.string() }))
		.output(listingOutputSchema),
};
