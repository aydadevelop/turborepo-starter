import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import type {
	AvailabilityWorkspaceState,
	CalendarWorkspaceState,
	ListingAssetWorkspaceState,
	ListingModerationAuditEntry,
	ListingWorkspaceState,
	OrpcInputs,
	PricingWorkspaceState,
} from "$lib/orpc-types";
import { renderComponent } from "../../../test/browser/render";
import ListingWorkspaceSections from "./ListingWorkspaceSections.svelte";

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
		metadata: { captainIncluded: true },
		timezone: "Europe/Moscow",
		createdAt: "2026-03-12T00:00:00.000Z",
		updatedAt: "2026-03-12T00:00:00.000Z",
	},
	listingType: {
		value: "boat-charter",
		label: "Boat charter",
		isDefault: true,
		defaultAmenityKeys: ["captain"],
		metadataJsonSchema: {},
		requiredFields: ["name", "slug", "timezone"],
		serviceFamily: "boat_rent",
		serviceFamilyPolicy: {
			key: "boat_rent",
			label: "Boat rent",
			availabilityMode: "duration",
			operatorSections: [
				"basics",
				"pricing",
				"availability",
				"assets",
				"calendar",
				"publish",
			],
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
				description:
					"Core operating facts that shape how this listing is sold and requested.",
				fields: [],
			},
		},
		supportedPricingModels: ["hourly"],
		icon: null,
	},
	boatRentProfile: {
		listingId: "listing-1",
		capacity: 10,
		captainMode: "captained_only",
		basePort: "Sochi Marine Station",
		departureArea: "Imeretinskaya Bay",
		fuelPolicy: "included",
		depositRequired: true,
		instantBookAllowed: false,
	},
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
		operatorSections: [
			"basics",
			"pricing",
			"availability",
			"assets",
			"calendar",
			"publish",
		],
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
			description:
				"Core operating facts that shape how this listing is sold and requested.",
			fields: [],
		},
	},
};

const pricing: PricingWorkspaceState = {
	currencies: ["RUB"],
	defaultProfileId: "profile-1",
	hasPricing: true,
	profileRuleSummaries: [
		{ profileId: "profile-1", totalRuleCount: 2, activeRuleCount: 1 },
	],
	profiles: [
		{
			id: "profile-1",
			listingId: "listing-1",
			name: "Base",
			currency: "RUB",
			baseHourlyPriceCents: 120_000,
			minimumHours: 2,
			serviceFeeBps: 0,
			taxBps: 0,
			isDefault: true,
			createdAt: "2026-03-12T00:00:00.000Z",
			updatedAt: "2026-03-12T00:00:00.000Z",
		},
	],
	totalActiveRuleCount: 1,
	totalRuleCount: 2,
};

const availability: AvailabilityWorkspaceState = {
	activeBlockCount: 1,
	activeRuleCount: 2,
	exceptionCount: 1,
	hasAvailability: true,
	rules: [
		{
			id: "rule-1",
			listingId: "listing-1",
			dayOfWeek: 5,
			startMinute: 600,
			endMinute: 1320,
			isActive: true,
			createdAt: "2026-03-12T00:00:00.000Z",
			updatedAt: "2026-03-12T00:00:00.000Z",
		},
	],
	blocks: [],
	exceptions: [],
};

const assets: ListingAssetWorkspaceState = {
	totalCount: 2,
	imageCount: 1,
	documentCount: 1,
	primaryImageId: "asset-1",
	items: [
		{
			id: "asset-1",
			kind: "image",
			storageProvider: "s3",
			storageKey: "boats/1.jpg",
			access: "public",
			altText: "Boat",
			isPrimary: true,
			sortOrder: 0,
			publicUrl: "https://example.test/boat.jpg",
		},
		{
			id: "asset-2",
			kind: "document",
			storageProvider: "s3",
			storageKey: "boats/spec.pdf",
			access: "private",
			altText: null,
			isPrimary: false,
			sortOrder: 1,
			publicUrl: null,
		},
	],
};

const calendar: CalendarWorkspaceState = {
	accountCount: 1,
	activeConnectionCount: 1,
	connectedAccountCount: 1,
	accounts: [
		{
			id: "account-1",
			organizationId: "org-1",
			provider: "google",
			externalAccountId: "google-account-1",
			accountEmail: "fleet@example.com",
			displayName: "Fleet Calendar",
			status: "connected",
			lastSyncedAt: null,
			lastError: null,
			createdAt: "2026-03-12T00:00:00.000Z",
			updatedAt: "2026-03-12T00:00:00.000Z",
		},
	],
	sourceCount: 2,
	activeSourceCount: 2,
	sources: [
		{
			id: "source-1",
			organizationId: "org-1",
			calendarAccountId: "account-1",
			provider: "google",
			externalCalendarId: "calendar-primary",
			name: "Fleet Primary",
			timezone: "Europe/Moscow",
			isPrimary: true,
			isHidden: false,
			isActive: true,
			lastDiscoveredAt: "2026-03-12T00:00:00.000Z",
			createdAt: "2026-03-12T00:00:00.000Z",
			updatedAt: "2026-03-12T00:00:00.000Z",
		},
		{
			id: "source-2",
			organizationId: "org-1",
			calendarAccountId: "account-1",
			provider: "google",
			externalCalendarId: "calendar-backup",
			name: "Fleet Backup",
			timezone: "Europe/Moscow",
			isPrimary: false,
			isHidden: false,
			isActive: true,
			lastDiscoveredAt: "2026-03-12T00:00:00.000Z",
			createdAt: "2026-03-12T00:00:00.000Z",
			updatedAt: "2026-03-12T00:00:00.000Z",
		},
	],
	hasConnectedCalendar: true,
	providers: ["google", "manual"],
	connections: [
		{
			id: "connection-1",
			listingId: "listing-1",
			organizationId: "org-1",
			calendarAccountId: "account-1",
			calendarSourceId: "source-1",
			provider: "google",
			externalCalendarId: "abc",
			syncStatus: "idle",
			syncRetryCount: 0,
			lastSyncedAt: null,
			lastError: null,
			watchExpiration: null,
			isActive: true,
			createdAt: "2026-03-12T00:00:00.000Z",
			updatedAt: "2026-03-12T00:00:00.000Z",
		},
	],
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

async function waitForCondition(check: () => boolean, timeoutMs = 1000) {
	const startedAt = Date.now();

	while (!check()) {
		if (Date.now() - startedAt >= timeoutMs) {
			throw new Error("Timed out waiting for condition");
		}

		await new Promise((resolve) => window.setTimeout(resolve, 10));
	}
}

describe("ListingWorkspaceSections", () => {
	it("renders backend-owned operator sections for the listing workspace", async () => {
		const rendered = renderComponent(ListingWorkspaceSections, {
			workspace,
			pricing,
			availability,
			assets,
			calendar,
			moderationAudit,
			googleCalendarConnectUrl:
				"http://localhost:43100/api/calendar/oauth/google/start",
		});

		await expect.element(page.getByText("Boat rent")).toBeVisible();
		await expect
			.element(page.getByRole("tab", { name: "pricing" }))
			.toBeVisible();
		await expect
			.element(page.getByRole("tab", { name: "availability" }))
			.toBeVisible();
		await expect
			.element(page.getByRole("tab", { name: "assets" }))
			.toBeVisible();
		await expect
			.element(page.getByRole("tab", { name: "calendar" }))
			.toBeVisible();
		await expect
			.element(page.getByRole("tab", { name: "publish" }))
			.toBeVisible();
		await expect
			.element(
				page.getByText("Core listing details and current family policy.")
			)
			.toBeVisible();
		await expect.element(page.getByText("Sochi Marine Station")).toBeVisible();
		await page.getByRole("tab", { name: "calendar" }).click();
		await expect.element(page.getByText("Fleet Calendar")).toBeVisible();
		await expect
			.element(page.getByRole("button", { name: "Manage calendars" }))
			.toBeVisible();
		await expect.element(page.getByText("Listing attachments")).toBeVisible();
		await expect.element(page.getByText("Source-backed")).toBeVisible();

		await page.getByRole("tab", { name: "publish" }).click();
		await expect
			.element(page.getByText("Approved after dock verification"))
			.toBeVisible();
		await expect(document.body).toMatchScreenshot("listing-workspace-sections");

		await rendered.cleanup();
	});

	it("renders a Google connect CTA for account-first calendar onboarding", async () => {
		const rendered = renderComponent(ListingWorkspaceSections, {
			workspace,
			calendar,
			googleCalendarConnectUrl:
				"http://localhost:43100/api/calendar/oauth/google/start",
		});

		await page.getByRole("tab", { name: "calendar" }).click();
		const connectLink = page.getByRole("link", { name: "Connect Google" });
		await expect
			.element(page.getByRole("button", { name: "Manage calendars" }))
			.toBeVisible();
		await expect.element(connectLink).toBeVisible();
		await expect
			.element(connectLink)
			.toHaveAttribute(
				"href",
				"http://localhost:43100/api/calendar/oauth/google/start"
			);

		await rendered.cleanup();
	});

	it("wires refresh and attach callbacks for discovered calendar sources", async () => {
		let refreshedAccountId: string | null = null;
		let attachedSourceId: string | null = null;

		const rendered = renderComponent(ListingWorkspaceSections, {
			workspace,
			calendar,
			googleCalendarConnectUrl:
				"http://localhost:43100/api/calendar/oauth/google/start",
			onRefreshCalendarAccountSources: (accountId: string) => {
				refreshedAccountId = accountId;
			},
			onAttachCalendarSource: (sourceId: string) => {
				attachedSourceId = sourceId;
			},
		});

		await page.getByRole("tab", { name: "calendar" }).click();
		await page.getByRole("button", { name: "Manage calendars" }).click();
		await page.getByRole("button", { name: "Refresh calendars" }).click();
		expect(refreshedAccountId).toBe("account-1");

		await page.getByRole("button", { name: "Attach" }).click();
		expect(attachedSourceId).toBe("source-2");

		await rendered.cleanup();
	});

	it("renders typed excursion facts when the workspace belongs to the excursions family", async () => {
		const excursionWorkspace: ListingWorkspaceState = {
			...workspace,
			listing: {
				...workspace.listing,
				id: "listing-2",
				listingTypeSlug: "walking-tour",
				name: "Historic walk",
			},
			listingType: workspace.listingType
				? {
						...workspace.listingType,
						value: "walking-tour",
						label: "Walking tour",
						serviceFamily: "excursions",
						serviceFamilyPolicy: {
							...workspace.listingType.serviceFamilyPolicy,
							key: "excursions",
							label: "Excursions",
							availabilityMode: "schedule",
							customerPresentation: {
								bookingMode: "book",
								customerFocus: "experience",
								reviewsMode: "validated",
							},
							profileEditor: {
								title: "Excursion profile",
								description: "Excursion facts",
								fields: [],
							},
						},
					}
				: null,
			boatRentProfile: null,
			excursionProfile: {
				listingId: "listing-2",
				meetingPoint: "Central fountain",
				durationMinutes: 180,
				groupFormat: "both",
				maxGroupSize: 12,
				primaryLanguage: "English",
				ticketsIncluded: true,
				childFriendly: true,
				instantBookAllowed: true,
			},
			serviceFamilyPolicy: {
				key: "excursions",
				label: "Excursions",
				availabilityMode: "schedule",
				operatorSections: workspace.serviceFamilyPolicy?.operatorSections ?? [
					"basics",
				],
				defaults: {
					moderationRequired: true,
					requiresLocation: true,
				},
				customerPresentation: {
					bookingMode: "book",
					customerFocus: "experience",
					reviewsMode: "validated",
				},
				profileEditor: {
					title: "Excursion profile",
					description: "Excursion facts",
					fields: [],
				},
			},
		};

		const rendered = renderComponent(ListingWorkspaceSections, {
			workspace: excursionWorkspace,
		});

		await expect.element(page.getByText("Excursions")).toBeVisible();
		await expect.element(page.getByText("Central fountain")).toBeVisible();
		await expect.element(page.getByText("180 min")).toBeVisible();
		await expect.element(page.getByText("Private or group")).toBeVisible();

		await rendered.cleanup();
	});

	it("opens basics editing in a focused dialog and submits through the workspace action seam", async () => {
		let submittedName: string | null = null;

		const rendered = renderComponent(ListingWorkspaceSections, {
			workspace,
			initialValue: {
				listingTypeSlug: workspace.listing.listingTypeSlug,
				name: workspace.listing.name,
				slug: workspace.listing.slug,
				timezone: workspace.listing.timezone,
				description: workspace.listing.description,
				metadata: workspace.listing.metadata,
				serviceFamilyDetails: {
					boatRent: workspace.boatRentProfile,
				},
			},
			listingTypeOptions: workspace.listingType ? [workspace.listingType] : [],
			onUpdateListing: (input: OrpcInputs["listing"]["create"]) => {
				submittedName = input.name;
				return true;
			},
		});

		await page.getByRole("button", { name: "Edit basics" }).click();
		await expect.element(page.getByRole("dialog")).toBeVisible();
		await expect
			.element(page.getByRole("button", { name: "Save basics" }))
			.toBeVisible();

		await page.getByLabelText("Name").fill("Evening Charter Plus");
		const dialogForm = document.querySelector(
			'[role="dialog"] form'
		) as HTMLFormElement | null;
		dialogForm?.requestSubmit();

		await waitForCondition(() => submittedName === "Evening Charter Plus");
		expect(submittedName).toBe("Evening Charter Plus");
		await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();

		await rendered.cleanup();
	});
});
