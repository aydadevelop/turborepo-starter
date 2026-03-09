import { oc } from "@orpc/contract";
import z from "zod";

const storefrontListItemSchema = z.object({
	id: z.string(),
	listingTypeSlug: z.string(),
	name: z.string(),
	slug: z.string(),
	description: z.string().nullable(),
	metadata: z.record(z.string(), z.unknown()).nullable(),
	primaryImageKey: z.string().nullable(),
	createdAt: z.string().datetime(),
});

export const storefrontContract = {
	list: oc
		.route({
			tags: ["Storefront"],
			summary: "Browse published listings",
			description: "Returns published marketplace listings with optional type and keyword filters.",
		})
		.input(
			z.object({
				type: z.string().optional(),
				q: z.string().max(200).optional(),
				limit: z.number().int().min(1).max(100).default(20),
				offset: z.number().int().min(0).default(0),
			}),
		)
		.output(
			z.object({
				items: z.array(storefrontListItemSchema),
				total: z.number().int(),
			}),
		),

	get: oc
		.route({
			tags: ["Storefront"],
			summary: "Get published listing detail",
			description: "Returns detail for a single published marketplace listing.",
		})
		.input(z.object({ id: z.string() }))
		.output(storefrontListItemSchema),
};
