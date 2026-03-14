import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { OrganizationOverlaySummary } from "$lib/orpc-types";
import { renderComponent } from "../../../test/browser/render";
import OrganizationOverlayPanel from "./OrganizationOverlayPanel.svelte";

const overlay: OrganizationOverlaySummary = {
	onboarding: {
		id: "onboarding-1",
		organizationId: "org-1",
		paymentConfigured: true,
		calendarConnected: true,
		listingPublished: false,
		isComplete: false,
		completedAt: null,
		lastRecalculatedAt: "2026-03-12T00:00:00.000Z",
		createdAt: "2026-03-12T00:00:00.000Z",
		updatedAt: "2026-03-12T00:00:00.000Z",
	},
	publishing: {
		totalListingCount: 4,
		draftListingCount: 1,
		publishedListingCount: 2,
		unpublishedListingCount: 1,
		activePublicationCount: 2,
		reviewPendingCount: 1,
	},
	moderation: {
		approvedListingCount: 1,
		reviewPendingCount: 1,
		unapprovedActiveListingCount: 1,
	},
	distribution: {
		listingsWithoutPublicationCount: 2,
		marketplacePublicationCount: 1,
		ownSitePublicationCount: 1,
	},
	blockers: {
		missingCalendarCount: 1,
		missingLocationCount: 2,
		missingPricingCount: 1,
		missingPrimaryImageCount: 1,
		totalBlockingIssues: 5,
	},
	manualOverrides: {
		activeCount: 1,
		items: [
			{
				id: "override-1",
				organizationId: "org-1",
				scopeType: "organization",
				scopeKey: null,
				code: "manual-pricing",
				title: "Allow manual pricing",
				note: "Temporary operator exception",
				isActive: true,
				createdByUserId: "user-1",
				resolvedByUserId: null,
				resolvedAt: null,
				createdAt: "2026-03-12T00:00:00.000Z",
				updatedAt: "2026-03-12T00:00:00.000Z",
			},
		],
	},
};

async function waitForCondition(check: () => boolean, timeoutMs = 1000) {
	const startedAt = Date.now();

	while (!check()) {
		if (Date.now() - startedAt >= timeoutMs) {
			throw new Error("Timed out waiting for condition");
		}

		await new Promise((resolve) => window.setTimeout(resolve, 10));
	}
}

test("creates and resolves manual overrides through the overlay panel contract", async () => {
	const onCreateManualOverride = vi.fn();
	const onResolveManualOverride = vi.fn();
	const onApproveListing = vi.fn();
	const onClearListingApproval = vi.fn();
	const onPublishListingToChannel = vi.fn();
	const onUnpublishListing = vi.fn();

	renderComponent(OrganizationOverlayPanel, {
		overlay,
		listingOptions: [
			{ id: "listing-1", name: "Evening Charter" },
			{ id: "listing-2", name: "Morning Tour" },
		],
		onCreateManualOverride,
		onResolveManualOverride,
		onApproveListing,
		onClearListingApproval,
		onPublishListingToChannel,
		onUnpublishListing,
	});

	await expect.element(page.getByText("Manual overrides")).toBeVisible();
	await expect.element(page.getByText("Allow manual pricing")).toBeVisible();
	await expect
		.element(page.getByRole("button", { name: "Add override" }))
		.toBeVisible();
	await expect
		.element(page.getByRole("button", { name: "Publish to channel" }))
		.toBeVisible();
	await expect
		.element(page.getByRole("button", { name: "Approve listing" }))
		.toBeVisible();
	await expect(document.body).toMatchScreenshot("organization-overlay-panel");

	expect(onCreateManualOverride).not.toHaveBeenCalled();

	await userEvent.click(
		page.getByRole("button", { name: "Publish to channel" }),
	);
	await userEvent.selectOptions(
		page.getByLabelText("Listing", { exact: true }),
		"listing-1",
	);
	(
		document.querySelector('[role="dialog"] form') as HTMLFormElement | null
	)?.requestSubmit();
	await waitForCondition(
		() => onPublishListingToChannel.mock.calls.length === 1,
	);
	expect(onPublishListingToChannel).toHaveBeenCalledWith({
		listingId: "listing-1",
		channelType: "platform_marketplace",
	});
	await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();

	await userEvent.click(page.getByRole("button", { name: "Approve listing" }));
	await userEvent.selectOptions(
		page.getByLabelText("Listing", { exact: true }),
		"listing-2",
	);
	await userEvent.fill(
		page.getByLabelText("Moderation note"),
		"Ready after compliance review",
	);
	(
		document.querySelector('[role="dialog"] form') as HTMLFormElement | null
	)?.requestSubmit();
	await waitForCondition(() => onApproveListing.mock.calls.length === 1);
	expect(onApproveListing).toHaveBeenCalledWith({
		listingId: "listing-2",
		note: "Ready after compliance review",
	});
	await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();

	await userEvent.click(page.getByRole("button", { name: "Add override" }));
	await userEvent.fill(page.getByLabelText("Code"), "manual-pricing-2");
	await userEvent.fill(page.getByLabelText("Title"), "Allow manual boarding");
	await userEvent.fill(
		page.getByLabelText("Note"),
		"Temporary operator exception",
	);
	(
		document.querySelector('[role="dialog"] form') as HTMLFormElement | null
	)?.requestSubmit();
	await waitForCondition(() => onCreateManualOverride.mock.calls.length === 1);
	expect(onCreateManualOverride).toHaveBeenCalledWith({
		scopeType: "organization",
		scopeKey: null,
		code: "manual-pricing-2",
		title: "Allow manual boarding",
		note: "Temporary operator exception",
	});
	await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();

	await userEvent.click(page.getByRole("button", { name: "Resolve" }));
	expect(onResolveManualOverride).toHaveBeenCalledWith("override-1");
});
