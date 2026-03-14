import { db } from "@my-app/db";
import {
	approveOrganizationListing,
	clearOrganizationListingApproval,
	createOrganizationManualOverride,
	getOrganizationListingModerationAudit,
	getOrganizationOnboardingStatus,
	getOrganizationOverlaySummary,
	listOrganizationManualOverrides,
	publishOrganizationListingToChannel,
	resolveOrganizationManualOverride,
	unpublishOrganizationListing,
} from "@my-app/organization";
import { ORPCError } from "@orpc/server";
import { buildWorkflowContext } from "../context";
import { organizationPermissionProcedure } from "../index";

const formatOnboarding = (
	row: Awaited<ReturnType<typeof getOrganizationOnboardingStatus>>,
) => ({
	...row,
	completedAt: row.completedAt?.toISOString() ?? null,
	lastRecalculatedAt: row.lastRecalculatedAt.toISOString(),
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
});

const formatManualOverride = (row: {
	id: string;
	organizationId: string;
	scopeType: "organization" | "listing";
	scopeKey: string | null;
	code: string;
	title: string;
	note: string | null;
	isActive: boolean;
	createdByUserId: string | null;
	resolvedByUserId: string | null;
	resolvedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}) => ({
	...row,
	note: row.note ?? null,
	resolvedAt: row.resolvedAt?.toISOString() ?? null,
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
});

const formatListingModerationState = (row: {
	listingId: string;
	approvedAt: Date | null;
	isApproved: boolean;
}) => ({
	...row,
	approvedAt: row.approvedAt?.toISOString() ?? null,
});

const formatListingModerationAuditEntry = (row: {
	id: string;
	organizationId: string;
	listingId: string;
	action: "approved" | "approval_cleared";
	note: string | null;
	actedByUserId: string | null;
	actedByDisplayName: string | null;
	actedAt: Date;
}) => ({
	...row,
	note: row.note ?? null,
	actedByDisplayName: row.actedByDisplayName ?? null,
	actedAt: row.actedAt.toISOString(),
});

const throwOrganizationRouterError = (error: unknown): never => {
	if (error instanceof ORPCError) {
		throw error;
	}

	if (error instanceof Error && error.message === "NOT_FOUND") {
		throw new ORPCError("NOT_FOUND");
	}

	throw error;
};

export const organizationRouter = {
	getOnboardingStatus: organizationPermissionProcedure({
		organization: ["update"],
	}).organization.getOnboardingStatus.handler(async ({ context }) => {
		const row = await getOrganizationOnboardingStatus(
			context.activeMembership.organizationId,
			db,
		);

		return formatOnboarding(row);
	}),

	getOverlaySummary: organizationPermissionProcedure({
		organization: ["update"],
	}).organization.getOverlaySummary.handler(async ({ context }) => {
		const summary = await getOrganizationOverlaySummary(
			context.activeMembership.organizationId,
			db,
		);

		return {
			blockers: summary.blockers,
			distribution: summary.distribution,
			manualOverrides: {
				activeCount: summary.manualOverrides.activeCount,
				items: summary.manualOverrides.items.map(formatManualOverride),
			},
			moderation: summary.moderation,
			onboarding: formatOnboarding(summary.onboarding),
			publishing: summary.publishing,
		};
	}),

	listManualOverrides: organizationPermissionProcedure({
		organization: ["update"],
	}).organization.listManualOverrides.handler(async ({ context }) => {
		const rows = await listOrganizationManualOverrides(
			context.activeMembership.organizationId,
			db,
		);
		return rows.map(formatManualOverride);
	}),

	createManualOverride: organizationPermissionProcedure({
		organization: ["update"],
	}).organization.createManualOverride.handler(async ({ context, input }) => {
		const row = await createOrganizationManualOverride(
			{
				organizationId: context.activeMembership.organizationId,
				scopeType: input.scopeType,
				scopeKey: input.scopeKey,
				code: input.code,
				title: input.title,
				note: input.note,
				createdByUserId: context.session?.user?.id ?? undefined,
			},
			db,
		);
		return formatManualOverride(row);
	}),

	resolveManualOverride: organizationPermissionProcedure({
		organization: ["update"],
	}).organization.resolveManualOverride.handler(async ({ context, input }) => {
		const row = await resolveOrganizationManualOverride(
			input.id,
			context.activeMembership.organizationId,
			context.session?.user?.id ?? null,
			db,
		);
		return formatManualOverride(row);
	}),

	approveListing: organizationPermissionProcedure({
		listing: ["update"],
	}).organization.approveListing.handler(async ({ context, input }) => {
		try {
			const row = await approveOrganizationListing(
				{
					listingId: input.listingId,
					organizationId: context.activeMembership.organizationId,
					actorUserId: context.session?.user?.id ?? null,
					note: input.note,
				},
				db,
			);
			return formatListingModerationState(row);
		} catch (error) {
			return throwOrganizationRouterError(error);
		}
	}),

	clearListingApproval: organizationPermissionProcedure({
		listing: ["update"],
	}).organization.clearListingApproval.handler(async ({ context, input }) => {
		try {
			const row = await clearOrganizationListingApproval(
				{
					listingId: input.listingId,
					organizationId: context.activeMembership.organizationId,
					actorUserId: context.session?.user?.id ?? null,
					note: input.note,
				},
				db,
			);
			return formatListingModerationState(row);
		} catch (error) {
			return throwOrganizationRouterError(error);
		}
	}),

	getListingModerationAudit: organizationPermissionProcedure({
		listing: ["read"],
	}).organization.getListingModerationAudit.handler(
		async ({ context, input }) => {
			try {
				const rows = await getOrganizationListingModerationAudit(
					input.listingId,
					context.activeMembership.organizationId,
					db,
				);
				return rows.map(formatListingModerationAuditEntry);
			} catch (error) {
				return throwOrganizationRouterError(error);
			}
		},
	),

	publishListingToChannel: organizationPermissionProcedure({
		listing: ["update"],
	}).organization.publishListingToChannel.handler(
		async ({ context, input }) => {
			try {
				return await publishOrganizationListingToChannel(
					{
						listingId: input.listingId,
						organizationId: context.activeMembership.organizationId,
						channelType: input.channelType,
					},
					buildWorkflowContext(
						context,
						`organization:publish-listing:${input.listingId}:${input.channelType}`,
					),
					db,
				);
			} catch (error) {
				return throwOrganizationRouterError(error);
			}
		},
	),

	unpublishListing: organizationPermissionProcedure({
		listing: ["update"],
	}).organization.unpublishListing.handler(async ({ context, input }) => {
		try {
			return await unpublishOrganizationListing(
				input.listingId,
				context.activeMembership.organizationId,
				buildWorkflowContext(
					context,
					`organization:unpublish-listing:${input.listingId}`,
				),
				db,
			);
		} catch (error) {
			return throwOrganizationRouterError(error);
		}
	}),
};
