import { oc } from "@orpc/contract";
import z from "zod";

const publicationChannelTypeSchema = z.enum([
	"own_site",
	"platform_marketplace",
]);

const onboardingStatusOutputSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	paymentConfigured: z.boolean(),
	calendarConnected: z.boolean(),
	listingPublished: z.boolean(),
	isComplete: z.boolean(),
	completedAt: z.string().datetime().nullable(),
	lastRecalculatedAt: z.string().datetime(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

const publishingSummaryOutputSchema = z.object({
	totalListingCount: z.number().int(),
	draftListingCount: z.number().int(),
	publishedListingCount: z.number().int(),
	unpublishedListingCount: z.number().int(),
	activePublicationCount: z.number().int(),
	reviewPendingCount: z.number().int(),
});

const moderationSummaryOutputSchema = z.object({
	approvedListingCount: z.number().int(),
	reviewPendingCount: z.number().int(),
	unapprovedActiveListingCount: z.number().int(),
});

const distributionSummaryOutputSchema = z.object({
	listingsWithoutPublicationCount: z.number().int(),
	marketplacePublicationCount: z.number().int(),
	ownSitePublicationCount: z.number().int(),
});

const blockerSummaryOutputSchema = z.object({
	missingCalendarCount: z.number().int(),
	missingLocationCount: z.number().int(),
	missingPricingCount: z.number().int(),
	missingPrimaryImageCount: z.number().int(),
	totalBlockingIssues: z.number().int(),
});

const manualOverrideOutputSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	scopeType: z.enum(["organization", "listing"]),
	scopeKey: z.string().nullable(),
	code: z.string(),
	title: z.string(),
	note: z.string().nullable(),
	isActive: z.boolean(),
	createdByUserId: z.string().nullable(),
	resolvedByUserId: z.string().nullable(),
	resolvedAt: z.string().datetime().nullable(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

const createManualOverrideInputSchema = z.object({
	scopeType: z.enum(["organization", "listing"]).default("organization"),
	scopeKey: z.string().nullable().optional(),
	code: z.string().trim().min(1),
	title: z.string().trim().min(1),
	note: z.string().trim().max(5000).optional(),
});

const moderationActionInputSchema = z.object({
	listingId: z.string(),
	note: z.string().trim().max(5000).optional(),
});

const listingModerationStateOutputSchema = z.object({
	listingId: z.string(),
	approvedAt: z.string().datetime().nullable(),
	isApproved: z.boolean(),
});

const listingModerationAuditEntryOutputSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	listingId: z.string(),
	action: z.enum(["approved", "approval_cleared"]),
	note: z.string().nullable(),
	actedByUserId: z.string().nullable(),
	actedByDisplayName: z.string().nullable(),
	actedAt: z.string().datetime(),
});

const listingDistributionStateOutputSchema = z.object({
	listingId: z.string(),
	activeChannels: z.array(publicationChannelTypeSchema),
	activePublicationCount: z.number().int(),
	isPublished: z.boolean(),
});

const overlaySummaryOutputSchema = z.object({
	blockers: blockerSummaryOutputSchema,
	distribution: distributionSummaryOutputSchema,
	manualOverrides: z.object({
		activeCount: z.number().int(),
		items: z.array(manualOverrideOutputSchema),
	}),
	moderation: moderationSummaryOutputSchema,
	onboarding: onboardingStatusOutputSchema,
	publishing: publishingSummaryOutputSchema,
});

export const organizationContract = {
	getOnboardingStatus: oc
		.route({
			tags: ["Organization"],
			summary: "Get persisted onboarding readiness for the active organization",
		})
		.input(z.object({}))
		.output(onboardingStatusOutputSchema),

	getOverlaySummary: oc
		.route({
			tags: ["Organization"],
			summary:
				"Get organization overlay state for operator readiness and publishing",
		})
		.input(z.object({}))
		.output(overlaySummaryOutputSchema),

	listManualOverrides: oc
		.route({
			tags: ["Organization"],
			summary: "List active manual overrides for the active organization",
		})
		.input(z.object({}))
		.output(z.array(manualOverrideOutputSchema)),

	createManualOverride: oc
		.route({
			tags: ["Organization"],
			summary: "Create an organization manual override note",
		})
		.input(createManualOverrideInputSchema)
		.output(manualOverrideOutputSchema),

	resolveManualOverride: oc
		.route({
			tags: ["Organization"],
			summary: "Resolve an active organization manual override note",
		})
		.input(z.object({ id: z.string() }))
		.output(manualOverrideOutputSchema),

	approveListing: oc
		.route({
			tags: ["Organization"],
			summary: "Approve a listing for moderation in the active organization",
		})
		.input(moderationActionInputSchema)
		.output(listingModerationStateOutputSchema),

	clearListingApproval: oc
		.route({
			tags: ["Organization"],
			summary: "Clear moderation approval for a listing in the active organization",
		})
		.input(moderationActionInputSchema)
		.output(listingModerationStateOutputSchema),

	getListingModerationAudit: oc
		.route({
			tags: ["Organization"],
			summary: "List moderation audit entries for a listing in the active organization",
		})
		.input(z.object({ listingId: z.string() }))
		.output(z.array(listingModerationAuditEntryOutputSchema)),

	publishListingToChannel: oc
		.route({
			tags: ["Organization"],
			summary: "Publish a listing to a specific distribution channel",
		})
		.input(
			z.object({
				listingId: z.string(),
				channelType: publicationChannelTypeSchema,
			})
		)
		.output(listingDistributionStateOutputSchema),

	unpublishListing: oc
		.route({
			tags: ["Organization"],
			summary: "Unpublish a listing from all active organization channels",
		})
		.input(z.object({ listingId: z.string() }))
		.output(listingDistributionStateOutputSchema),
};
