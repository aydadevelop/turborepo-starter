import {
	createStep,
	createWorkflow,
	type WorkflowContext,
} from "@my-app/workflows";

import {
	applyPublishListingState,
	applyUnpublishListingState,
	emitPublicationReadinessChanged,
} from "../publication-service";
import type {
	Db,
	ListingPublicationRow,
	ListingRow,
	PublishListingInput,
} from "../types";

interface PublishedListingOutput {
	listing: ListingRow;
	publication: ListingPublicationRow;
}

interface UnpublishedListingOutput {
	listing: ListingRow;
}

const makePublishListingStateStep = (db: Db) =>
	createStep<PublishListingInput, PublishedListingOutput>(
		"catalog.publish-listing-state",
		(input) => applyPublishListingState(input, db),
		async (output, ctx) => {
			await applyUnpublishListingState(
				output.listing.id,
				ctx.organizationId,
				db
			);
		}
	);

const makeEmitListingPublishedEventStep = () =>
	createStep<
		PublishListingInput & PublishedListingOutput,
		PublishedListingOutput
	>("catalog.emit-listing-published", async (input, ctx: WorkflowContext) => {
		await emitPublicationReadinessChanged(
			ctx.organizationId,
			input.listing.id,
			input.publication.id,
			true,
			{
				actorUserId: ctx.actorUserId,
				eventBus: ctx.eventBus,
			}
		);

		return {
			listing: input.listing,
			publication: input.publication,
		};
	});

const makeUnpublishListingStateStep = (db: Db) =>
	createStep<
		{ listingId: string; organizationId: string },
		UnpublishedListingOutput
	>("catalog.unpublish-listing-state", async (input) => {
		const listing = await applyUnpublishListingState(
			input.listingId,
			input.organizationId,
			db
		);

		return { listing };
	});

const makeEmitListingUnpublishedEventStep = () =>
	createStep<
		{ listingId: string } & UnpublishedListingOutput,
		UnpublishedListingOutput
	>("catalog.emit-listing-unpublished", async (input, ctx: WorkflowContext) => {
		await emitPublicationReadinessChanged(
			ctx.organizationId,
			input.listingId,
			null,
			false,
			{
				actorUserId: ctx.actorUserId,
				eventBus: ctx.eventBus,
			}
		);

		return { listing: input.listing };
	});

export const publishListingWorkflow = (db: Db) => {
	const publishListingStateStep = makePublishListingStateStep(db);
	const emitListingPublishedEventStep = makeEmitListingPublishedEventStep();

	return createWorkflow<PublishListingInput, PublishedListingOutput>(
		"catalog.publish-listing",
		async (input, ctx) => {
			const published = await publishListingStateStep(input, ctx);
			return emitListingPublishedEventStep({ ...input, ...published }, ctx);
		}
	);
};

export const unpublishListingWorkflow = (db: Db) => {
	const unpublishListingStateStep = makeUnpublishListingStateStep(db);
	const emitListingUnpublishedEventStep = makeEmitListingUnpublishedEventStep();

	return createWorkflow<
		{ listingId: string; organizationId: string },
		UnpublishedListingOutput
	>("catalog.unpublish-listing", async (input, ctx) => {
		const unpublished = await unpublishListingStateStep(input, ctx);
		return emitListingUnpublishedEventStep(
			{ ...unpublished, listingId: input.listingId },
			ctx
		);
	});
};
