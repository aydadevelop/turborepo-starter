import {
	publishListingWorkflow,
	unpublishListingWorkflow,
} from "@my-app/catalog";
import { db as defaultDb } from "@my-app/db";
import type { WorkflowContext } from "@my-app/workflows";
import { ensureOrganizationListingExists } from "../moderation/repository";
import type {
	Db,
	OrganizationListingDistributionState,
	OrganizationPublicationChannelType,
} from "../types";
import { resolveOrganizationListingDistributionState } from "./repository";

export const publishOrganizationListingToChannel = async (
	input: {
		channelType: OrganizationPublicationChannelType;
		listingId: string;
		organizationId: string;
	},
	workflowContext: WorkflowContext,
	db: Db = defaultDb
): Promise<OrganizationListingDistributionState> => {
	const result = await publishListingWorkflow(db).execute(
		{
			listingId: input.listingId,
			organizationId: input.organizationId,
			channelType: input.channelType,
		},
		workflowContext
	);

	if (!result.success) {
		throw result.error;
	}

	return resolveOrganizationListingDistributionState(
		input.listingId,
		input.organizationId,
		db
	);
};

export const unpublishOrganizationListing = async (
	listingId: string,
	organizationId: string,
	workflowContext: WorkflowContext,
	db: Db = defaultDb
): Promise<OrganizationListingDistributionState> => {
	await ensureOrganizationListingExists(listingId, organizationId, db);

	const result = await unpublishListingWorkflow(db).execute(
		{
			listingId,
			organizationId,
		},
		workflowContext
	);

	if (!result.success) {
		throw result.error;
	}

	return resolveOrganizationListingDistributionState(
		listingId,
		organizationId,
		db
	);
};
