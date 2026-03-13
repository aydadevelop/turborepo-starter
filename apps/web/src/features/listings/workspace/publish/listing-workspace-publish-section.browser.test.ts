import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderComponent } from "../../../../test/browser/render";
import type { ListingModerationAuditEntry, ListingWorkspaceState } from "$lib/orpc-types";
import ListingWorkspacePublishSection from "./ListingWorkspacePublishSection.svelte";

const workspace: ListingWorkspaceState = {
	listing: {
		id: "listing-1",
		organizationId: "org-1",
		listingTypeSlug: "boat-charter",
		name: "Evening Charter",
		slug: "evening-charter",
		description: "Sunset ride",
		status: "active",
		isActive: true,
		metadata: {},
		timezone: "Europe/Moscow",
		createdAt: "2026-03-12T00:00:00.000Z",
		updatedAt: "2026-03-12T00:00:00.000Z",
	},
	listingType: null,
	boatRentProfile: null,
	excursionProfile: null,
	publication: {
		activePublicationCount: 1,
		isPublished: true,
		requiresReview: false,
	},
	serviceFamilyPolicy: {
		key: "boat_rent",
		label: "Boat rent",
		availabilityMode: "duration",
		operatorSections: ["basics", "publish"],
		defaults: {
			moderationRequired: false,
			requiresLocation: true,
		},
		customerPresentation: {
			bookingMode: "request",
			customerFocus: "asset",
			reviewsMode: "standard",
		},
		profileEditor: {
			title: "Boat rent profile",
			description: "Boat rent facts",
			fields: [],
		},
	},
};

const moderationAudit: ListingModerationAuditEntry[] = [
	{
		id: "audit-1",
		organizationId: "org-1",
		listingId: "listing-1",
		action: "approved",
		note: "Approved after dock verification",
		actedByUserId: "user-1",
		actedByDisplayName: "Captain Marina",
		actedAt: "2026-03-12T10:00:00.000Z",
	},
];

test("opens moderation and distribution actions in focused dialogs", async () => {
	const onApproveListing = vi.fn();
	const onPublishListingToChannel = vi.fn();
	const onUnpublishListing = vi.fn();

	renderComponent(ListingWorkspacePublishSection, {
		workspace,
		moderationAudit,
		onApproveListing,
		onPublishListingToChannel,
		onUnpublishListing,
	});

	await expect.element(page.getByRole("button", { name: "Approve listing" })).toBeVisible();
	await expect.element(page.getByRole("button", { name: "Publish to channel" })).toBeVisible();
	await expect.element(page.getByRole("button", { name: "Unpublish all" })).toBeVisible();
	await expect(document.body).toMatchScreenshot(
		"listing-workspace-publish-section"
	);

	await userEvent.click(page.getByRole("button", { name: "Approve listing" }));
	await expect.element(page.getByRole("heading", { name: "Approve listing" })).toBeVisible();
	await expect.element(page.getByLabelText("Moderation note")).toBeVisible();

	await userEvent.click(page.getByRole("button", { name: "Close" }));
	await userEvent.click(page.getByRole("button", { name: "Publish to channel" }));
	await expect.element(page.getByRole("heading", { name: "Publish to channel" })).toBeVisible();
	await expect
		.element(page.getByLabelText("Channel", { exact: true }))
		.toBeVisible();

	await userEvent.click(page.getByRole("button", { name: "Close" }));
	await userEvent.click(page.getByRole("button", { name: "Unpublish all" }));
	await expect.element(page.getByRole("heading", { name: "Unpublish all channels" })).toBeVisible();

	await userEvent.click(page.getByRole("button", { name: "Unpublish all" }).nth(1));
	expect(onUnpublishListing).toHaveBeenCalledWith("listing-1");
});
