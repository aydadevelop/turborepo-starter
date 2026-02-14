import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { member, organization, user } from "../schema/auth";
import {
	boat,
	boatAmenity,
	boatCalendarConnection,
	boatDock,
	boatPricingProfile,
	boatPricingRule,
	calendarWebhookEvent,
} from "../schema/boat";
import {
	booking,
	bookingCalendarLink,
	bookingCancellationRequest,
	bookingDiscountApplication,
	bookingDiscountCode,
	bookingDispute,
	bookingPaymentAttempt,
	bookingRefund,
} from "../schema/booking";
import {
	inboundMessage,
	supportTicket,
	supportTicketMessage,
	telegramNotification,
	telegramWebhookEvent,
} from "../schema/support";
import { todo } from "../schema/todo";
import {
	clearTestDatabase,
	createTestDatabase,
	type TestDatabase,
} from "../test";

const BOOKING_OVERLAP_REGEX = /BOOKING_OVERLAP/;
const BOOKING_INVALID_RANGE_REGEX = /BOOKING_INVALID_RANGE/;

describe("Test Database Setup", () => {
	let db: TestDatabase;
	let close: () => void;

	beforeEach(() => {
		const testDb = createTestDatabase();
		db = testDb.db;
		close = testDb.close;
	});

	afterEach(() => {
		close();
	});

	describe("User table", () => {
		it("can create a user", async () => {
			const testUser = {
				id: "user-1",
				name: "John Doe",
				email: "john@example.com",
				emailVerified: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			await db.insert(user).values(testUser);

			const users = await db.select().from(user);
			expect(users).toHaveLength(1);
			expect(users[0]).toBeDefined();
			expect(users[0]?.email).toBe("john@example.com");
		});

		it("enforces unique email constraint", async () => {
			const testUser = {
				id: "user-1",
				name: "John Doe",
				email: "john@example.com",
				emailVerified: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			await db.insert(user).values(testUser);

			await expect(
				db.insert(user).values({ ...testUser, id: "user-2" })
			).rejects.toThrow();
		});
	});

	describe("Todo table", () => {
		it("can create a todo", async () => {
			await db.insert(todo).values({ text: "Buy milk" });

			const todos = await db.select().from(todo);
			expect(todos).toHaveLength(1);
			expect(todos[0]).toBeDefined();
			expect(todos[0]?.text).toBe("Buy milk");
			expect(todos[0]?.completed).toBe(false);
		});

		it("can toggle todo completion", async () => {
			const [inserted] = await db
				.insert(todo)
				.values({ text: "Buy milk" })
				.returning();
			expect(inserted).toBeDefined();
			if (!inserted) {
				throw new Error("Insert returned no row");
			}

			await db
				.update(todo)
				.set({ completed: true })
				.where(eq(todo.id, inserted.id));

			const [updated] = await db
				.select()
				.from(todo)
				.where(eq(todo.id, inserted.id));
			expect(updated).toBeDefined();
			expect(updated?.completed).toBe(true);
		});

		it("can delete a todo", async () => {
			const [inserted] = await db
				.insert(todo)
				.values({ text: "Buy milk" })
				.returning();
			expect(inserted).toBeDefined();
			if (!inserted) {
				throw new Error("Insert returned no row");
			}

			await db.delete(todo).where(eq(todo.id, inserted.id));

			const todos = await db.select().from(todo);
			expect(todos).toHaveLength(0);
		});
	});

	describe("Organization membership table", () => {
		it("can create organization member relation", async () => {
			await db.insert(user).values({
				id: "org-user-1",
				name: "Org User",
				email: "org-user@example.com",
				emailVerified: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await db.insert(organization).values({
				id: "org-1",
				name: "Primary Org",
				slug: "primary-org",
				createdAt: new Date(),
			});

			await db.insert(member).values({
				id: "member-1",
				organizationId: "org-1",
				userId: "org-user-1",
				role: "org_owner",
				createdAt: new Date(),
			});

			const members = await db.select().from(member);
			expect(members).toHaveLength(1);
			expect(members[0]?.role).toBe("org_owner");
		});

		it("enforces one membership per user per organization", async () => {
			await db.insert(user).values({
				id: "org-user-2",
				name: "Org User 2",
				email: "org-user-2@example.com",
				emailVerified: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await db.insert(organization).values({
				id: "org-2",
				name: "Secondary Org",
				slug: "secondary-org",
				createdAt: new Date(),
			});

			await db.insert(member).values({
				id: "member-2",
				organizationId: "org-2",
				userId: "org-user-2",
				role: "manager",
				createdAt: new Date(),
			});

			await expect(
				db.insert(member).values({
					id: "member-3",
					organizationId: "org-2",
					userId: "org-user-2",
					role: "agent",
					createdAt: new Date(),
				})
			).rejects.toThrow();
		});
	});

	describe("Boat table", () => {
		it("can create a boat with dock relation scoped to an organization", async () => {
			await db.insert(organization).values({
				id: "org-boat-1",
				name: "Boat Org",
				slug: "boat-org",
				createdAt: new Date(),
			});

			await db.insert(boatDock).values({
				id: "dock-1",
				organizationId: "org-boat-1",
				name: "Central Dock",
				slug: "central-dock",
				address: "Main embankment",
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await db.insert(boat).values({
				id: "boat-1",
				organizationId: "org-boat-1",
				dockId: "dock-1",
				name: "Sea Explorer",
				slug: "sea-explorer",
				type: "motor",
				passengerCapacity: 8,
				crewCapacity: 1,
				timezone: "UTC",
				status: "active",
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const boats = await db.select().from(boat);
			expect(boats).toHaveLength(1);
			expect(boats[0]?.organizationId).toBe("org-boat-1");
			expect(boats[0]?.slug).toBe("sea-explorer");
			expect(boats[0]?.dockId).toBe("dock-1");
		});

		it("enforces unique slug inside the same organization", async () => {
			await db.insert(organization).values({
				id: "org-boat-2",
				name: "Boat Org 2",
				slug: "boat-org-2",
				createdAt: new Date(),
			});

			await db.insert(boat).values({
				id: "boat-2",
				organizationId: "org-boat-2",
				name: "Wave Rider",
				slug: "wave-rider",
				type: "motor",
				passengerCapacity: 6,
				timezone: "UTC",
				status: "draft",
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await expect(
				db.insert(boat).values({
					id: "boat-3",
					organizationId: "org-boat-2",
					name: "Wave Rider 2",
					slug: "wave-rider",
					type: "yacht",
					passengerCapacity: 10,
					timezone: "UTC",
					status: "active",
					isActive: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				})
			).rejects.toThrow();
		});

		it("enforces unique amenity key per boat", async () => {
			await db.insert(organization).values({
				id: "org-boat-3",
				name: "Boat Org 3",
				slug: "boat-org-3",
				createdAt: new Date(),
			});

			await db.insert(boat).values({
				id: "boat-4",
				organizationId: "org-boat-3",
				name: "Sea Fox",
				slug: "sea-fox",
				type: "motor",
				passengerCapacity: 4,
				status: "active",
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await db.insert(boatAmenity).values({
				id: "amenity-1",
				boatId: "boat-4",
				key: "toilet",
				label: "Toilet",
				isEnabled: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await expect(
				db.insert(boatAmenity).values({
					id: "amenity-2",
					boatId: "boat-4",
					key: "toilet",
					label: "Toilet Duplicate",
					isEnabled: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				})
			).rejects.toThrow();
		});

		it("supports pricing profile and pricing rules relation", async () => {
			await db.insert(organization).values({
				id: "org-boat-4",
				name: "Boat Org 4",
				slug: "boat-org-4",
				createdAt: new Date(),
			});

			await db.insert(boat).values({
				id: "boat-5",
				organizationId: "org-boat-4",
				name: "Aurora",
				slug: "aurora",
				type: "catamaran",
				passengerCapacity: 12,
				status: "active",
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await db.insert(boatPricingProfile).values({
				id: "profile-1",
				boatId: "boat-5",
				name: "Default",
				currency: "RUB",
				baseHourlyPriceCents: 120_000,
				minimumHours: 2,
				depositPercentage: 20,
				serviceFeePercentage: 5,
				affiliateFeePercentage: 0,
				taxPercentage: 6,
				acquiringFeePercentage: 3,
				validFrom: new Date(),
				isDefault: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await db.insert(boatPricingRule).values({
				id: "rule-1",
				boatId: "boat-5",
				pricingProfileId: "profile-1",
				name: "Weekend surcharge",
				ruleType: "weekend_surcharge",
				conditionJson: '{"days":[6,0]}',
				adjustmentType: "percentage",
				adjustmentValue: 15,
				priority: 10,
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const rules = await db.select().from(boatPricingRule);
			expect(rules).toHaveLength(1);
			expect(rules[0]?.pricingProfileId).toBe("profile-1");
		});
	});

	describe("Booking table", () => {
		it("can create booking with applied discount code", async () => {
			await db.insert(organization).values({
				id: "org-booking-1",
				name: "Booking Org",
				slug: "booking-org",
				createdAt: new Date(),
			});

			await db.insert(user).values({
				id: "user-booking-1",
				name: "Booking Agent",
				email: "booking-agent@example.com",
				emailVerified: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await db.insert(boat).values({
				id: "boat-booking-1",
				organizationId: "org-booking-1",
				name: "North Star",
				slug: "north-star",
				type: "motor",
				passengerCapacity: 8,
				status: "active",
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await db.insert(bookingDiscountCode).values({
				id: "discount-1",
				organizationId: "org-booking-1",
				code: "WELCOME10",
				name: "Welcome 10",
				discountType: "percentage",
				discountValue: 10,
				minimumSubtotalCents: 0,
				usageCount: 0,
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await db.insert(booking).values({
				id: "booking-1",
				organizationId: "org-booking-1",
				boatId: "boat-booking-1",
				customerUserId: "user-booking-1",
				createdByUserId: "user-booking-1",
				source: "manual",
				status: "pending",
				paymentStatus: "unpaid",
				calendarSyncStatus: "linked",
				startsAt: new Date("2026-03-01T10:00:00.000Z"),
				endsAt: new Date("2026-03-01T13:00:00.000Z"),
				passengers: 4,
				basePriceCents: 100_000,
				discountAmountCents: 10_000,
				totalPriceCents: 90_000,
				currency: "RUB",
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await db.insert(bookingCalendarLink).values({
				id: "calendar-link-1",
				bookingId: "booking-1",
				provider: "google",
				externalCalendarId: "primary",
				externalEventId: "event-1",
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await db.insert(bookingDiscountApplication).values({
				id: "discount-app-1",
				bookingId: "booking-1",
				discountCodeId: "discount-1",
				code: "WELCOME10",
				discountType: "percentage",
				discountValue: 10,
				appliedAmountCents: 10_000,
				appliedAt: new Date(),
			});

			const bookings = await db.select().from(booking);
			const discountApplications = await db
				.select()
				.from(bookingDiscountApplication);
			const calendarLinks = await db.select().from(bookingCalendarLink);

			expect(bookings).toHaveLength(1);
			expect(discountApplications).toHaveLength(1);
			expect(calendarLinks).toHaveLength(1);
			expect(bookings[0]?.totalPriceCents).toBe(90_000);
			expect(discountApplications[0]?.code).toBe("WELCOME10");
			expect(bookings[0]?.calendarSyncStatus).toBe("linked");
		});

		it("enforces unique discount code in an organization", async () => {
			await db.insert(organization).values({
				id: "org-booking-2",
				name: "Booking Org 2",
				slug: "booking-org-2",
				createdAt: new Date(),
			});

			await db.insert(bookingDiscountCode).values({
				id: "discount-2",
				organizationId: "org-booking-2",
				code: "SPRING25",
				name: "Spring",
				discountType: "percentage",
				discountValue: 25,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await expect(
				db.insert(bookingDiscountCode).values({
					id: "discount-3",
					organizationId: "org-booking-2",
					code: "SPRING25",
					name: "Spring duplicate",
					discountType: "fixed_cents",
					discountValue: 5000,
					createdAt: new Date(),
					updatedAt: new Date(),
				})
			).rejects.toThrow();
		});

		it("enforces no-overlap for blocking booking statuses", async () => {
			await db.insert(organization).values({
				id: "org-booking-overlap-1",
				name: "Booking Overlap Org",
				slug: "booking-overlap-org",
				createdAt: new Date(),
			});

			await db.insert(boat).values({
				id: "boat-booking-overlap-1",
				organizationId: "org-booking-overlap-1",
				name: "Overlap Boat",
				slug: "overlap-boat",
				type: "motor",
				passengerCapacity: 8,
				status: "active",
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await db.insert(booking).values({
				id: "booking-overlap-1",
				organizationId: "org-booking-overlap-1",
				boatId: "boat-booking-overlap-1",
				source: "manual",
				status: "confirmed",
				paymentStatus: "paid",
				calendarSyncStatus: "linked",
				startsAt: new Date("2026-03-10T10:00:00.000Z"),
				endsAt: new Date("2026-03-10T12:00:00.000Z"),
				passengers: 4,
				basePriceCents: 100_000,
				discountAmountCents: 0,
				totalPriceCents: 100_000,
				currency: "RUB",
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await expect(
				db.insert(booking).values({
					id: "booking-overlap-2",
					organizationId: "org-booking-overlap-1",
					boatId: "boat-booking-overlap-1",
					source: "manual",
					status: "pending",
					paymentStatus: "unpaid",
					calendarSyncStatus: "pending",
					startsAt: new Date("2026-03-10T11:00:00.000Z"),
					endsAt: new Date("2026-03-10T13:00:00.000Z"),
					passengers: 2,
					basePriceCents: 80_000,
					discountAmountCents: 0,
					totalPriceCents: 80_000,
					currency: "RUB",
					createdAt: new Date(),
					updatedAt: new Date(),
				})
			).rejects.toThrow(BOOKING_OVERLAP_REGEX);
		});

		it("allows overlap when existing booking status is non-blocking", async () => {
			await db.insert(organization).values({
				id: "org-booking-overlap-2",
				name: "Booking Overlap Org 2",
				slug: "booking-overlap-org-2",
				createdAt: new Date(),
			});

			await db.insert(boat).values({
				id: "boat-booking-overlap-2",
				organizationId: "org-booking-overlap-2",
				name: "Overlap Boat 2",
				slug: "overlap-boat-2",
				type: "motor",
				passengerCapacity: 8,
				status: "active",
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await db.insert(booking).values({
				id: "booking-overlap-3",
				organizationId: "org-booking-overlap-2",
				boatId: "boat-booking-overlap-2",
				source: "manual",
				status: "cancelled",
				paymentStatus: "refunded",
				calendarSyncStatus: "sync_error",
				startsAt: new Date("2026-03-11T10:00:00.000Z"),
				endsAt: new Date("2026-03-11T12:00:00.000Z"),
				passengers: 3,
				basePriceCents: 60_000,
				discountAmountCents: 0,
				totalPriceCents: 60_000,
				currency: "RUB",
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await expect(
				db.insert(booking).values({
					id: "booking-overlap-4",
					organizationId: "org-booking-overlap-2",
					boatId: "boat-booking-overlap-2",
					source: "manual",
					status: "confirmed",
					paymentStatus: "paid",
					calendarSyncStatus: "linked",
					startsAt: new Date("2026-03-11T11:00:00.000Z"),
					endsAt: new Date("2026-03-11T13:00:00.000Z"),
					passengers: 3,
					basePriceCents: 70_000,
					discountAmountCents: 0,
					totalPriceCents: 70_000,
					currency: "RUB",
					createdAt: new Date(),
					updatedAt: new Date(),
				})
			).resolves.toBeDefined();
		});

		it("rejects booking intervals where start is not before end", async () => {
			await db.insert(organization).values({
				id: "org-booking-range-1",
				name: "Booking Range Org",
				slug: "booking-range-org",
				createdAt: new Date(),
			});

			await db.insert(boat).values({
				id: "boat-booking-range-1",
				organizationId: "org-booking-range-1",
				name: "Range Boat",
				slug: "range-boat",
				type: "motor",
				passengerCapacity: 6,
				status: "active",
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await expect(
				db.insert(booking).values({
					id: "booking-range-1",
					organizationId: "org-booking-range-1",
					boatId: "boat-booking-range-1",
					source: "manual",
					status: "pending",
					paymentStatus: "unpaid",
					calendarSyncStatus: "pending",
					startsAt: new Date("2026-03-12T10:00:00.000Z"),
					endsAt: new Date("2026-03-12T10:00:00.000Z"),
					passengers: 2,
					basePriceCents: 50_000,
					discountAmountCents: 0,
					totalPriceCents: 50_000,
					currency: "RUB",
					createdAt: new Date(),
					updatedAt: new Date(),
				})
			).rejects.toThrow(BOOKING_INVALID_RANGE_REGEX);
		});

		it("allows only one discount application per booking", async () => {
			await db.insert(organization).values({
				id: "org-booking-3",
				name: "Booking Org 3",
				slug: "booking-org-3",
				createdAt: new Date(),
			});

			await db.insert(boat).values({
				id: "boat-booking-3",
				organizationId: "org-booking-3",
				name: "Blue Wave",
				slug: "blue-wave",
				type: "motor",
				passengerCapacity: 6,
				status: "active",
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await db.insert(booking).values({
				id: "booking-3",
				organizationId: "org-booking-3",
				boatId: "boat-booking-3",
				source: "manual",
				status: "pending",
				paymentStatus: "unpaid",
				calendarSyncStatus: "linked",
				startsAt: new Date("2026-03-05T08:00:00.000Z"),
				endsAt: new Date("2026-03-05T11:00:00.000Z"),
				passengers: 2,
				basePriceCents: 60_000,
				discountAmountCents: 6000,
				totalPriceCents: 54_000,
				currency: "RUB",
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await db.insert(bookingDiscountApplication).values({
				id: "discount-app-3",
				bookingId: "booking-3",
				code: "TRY10",
				discountType: "percentage",
				discountValue: 10,
				appliedAmountCents: 6000,
				appliedAt: new Date(),
			});

			await expect(
				db.insert(bookingDiscountApplication).values({
					id: "discount-app-4",
					bookingId: "booking-3",
					code: "EXTRA",
					discountType: "fixed_cents",
					discountValue: 1000,
					appliedAmountCents: 1000,
					appliedAt: new Date(),
				})
			).rejects.toThrow();
		});

		it("allows only one calendar link per booking", async () => {
			await db.insert(organization).values({
				id: "org-booking-4",
				name: "Booking Org 4",
				slug: "booking-org-4",
				createdAt: new Date(),
			});

			await db.insert(boat).values({
				id: "boat-booking-4",
				organizationId: "org-booking-4",
				name: "Night Owl",
				slug: "night-owl",
				type: "motor",
				passengerCapacity: 6,
				status: "active",
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await db.insert(booking).values({
				id: "booking-4",
				organizationId: "org-booking-4",
				boatId: "boat-booking-4",
				source: "manual",
				status: "pending",
				paymentStatus: "unpaid",
				calendarSyncStatus: "linked",
				startsAt: new Date("2026-03-06T08:00:00.000Z"),
				endsAt: new Date("2026-03-06T11:00:00.000Z"),
				passengers: 2,
				basePriceCents: 50_000,
				discountAmountCents: 0,
				totalPriceCents: 50_000,
				currency: "RUB",
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await db.insert(bookingCalendarLink).values({
				id: "calendar-link-4",
				bookingId: "booking-4",
				provider: "google",
				externalCalendarId: "primary",
				externalEventId: "event-4",
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await expect(
				db.insert(bookingCalendarLink).values({
					id: "calendar-link-5",
					bookingId: "booking-4",
					provider: "google",
					externalCalendarId: "primary",
					externalEventId: "event-5",
					createdAt: new Date(),
					updatedAt: new Date(),
				})
			).rejects.toThrow();
		});
	});

	describe("Booking lifecycle tables", () => {
		it("tracks cancellation request, dispute, and refund records", async () => {
			await db.insert(organization).values({
				id: "org-booking-lifecycle-1",
				name: "Lifecycle Org",
				slug: "lifecycle-org",
				createdAt: new Date(),
			});

			await db.insert(user).values({
				id: "user-booking-lifecycle-1",
				name: "Lifecycle User",
				email: "lifecycle@example.com",
				emailVerified: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await db.insert(boat).values({
				id: "boat-booking-lifecycle-1",
				organizationId: "org-booking-lifecycle-1",
				name: "Lifecycle Boat",
				slug: "lifecycle-boat",
				type: "motor",
				passengerCapacity: 6,
				status: "active",
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await db.insert(booking).values({
				id: "booking-lifecycle-1",
				organizationId: "org-booking-lifecycle-1",
				boatId: "boat-booking-lifecycle-1",
				customerUserId: "user-booking-lifecycle-1",
				createdByUserId: "user-booking-lifecycle-1",
				source: "web",
				status: "confirmed",
				paymentStatus: "paid",
				calendarSyncStatus: "linked",
				startsAt: new Date("2026-04-01T10:00:00.000Z"),
				endsAt: new Date("2026-04-01T13:00:00.000Z"),
				passengers: 4,
				basePriceCents: 120_000,
				discountAmountCents: 0,
				totalPriceCents: 120_000,
				currency: "RUB",
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await db.insert(bookingCancellationRequest).values({
				id: "cancel-request-1",
				bookingId: "booking-lifecycle-1",
				organizationId: "org-booking-lifecycle-1",
				requestedByUserId: "user-booking-lifecycle-1",
				reason: "Weather conditions",
				status: "requested",
				requestedAt: new Date(),
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await db.insert(bookingDispute).values({
				id: "booking-dispute-1",
				bookingId: "booking-lifecycle-1",
				organizationId: "org-booking-lifecycle-1",
				raisedByUserId: "user-booking-lifecycle-1",
				status: "open",
				reasonCode: "service_quality",
				details: "Boat condition did not match description",
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await db.insert(bookingRefund).values({
				id: "booking-refund-1",
				bookingId: "booking-lifecycle-1",
				organizationId: "org-booking-lifecycle-1",
				requestedByUserId: "user-booking-lifecycle-1",
				status: "requested",
				amountCents: 30_000,
				currency: "RUB",
				reason: "Partial compensation",
				requestedAt: new Date(),
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const cancellationRequests = await db
				.select()
				.from(bookingCancellationRequest);
			const disputes = await db.select().from(bookingDispute);
			const refunds = await db.select().from(bookingRefund);

			expect(cancellationRequests).toHaveLength(1);
			expect(disputes).toHaveLength(1);
			expect(refunds).toHaveLength(1);
			expect(cancellationRequests[0]?.status).toBe("requested");
			expect(disputes[0]?.status).toBe("open");
			expect(refunds[0]?.status).toBe("requested");
		});

		it("enforces one cancellation request per booking", async () => {
			await db.insert(organization).values({
				id: "org-booking-lifecycle-2",
				name: "Lifecycle Org 2",
				slug: "lifecycle-org-2",
				createdAt: new Date(),
			});

			await db.insert(boat).values({
				id: "boat-booking-lifecycle-2",
				organizationId: "org-booking-lifecycle-2",
				name: "Lifecycle Boat 2",
				slug: "lifecycle-boat-2",
				type: "motor",
				passengerCapacity: 6,
				status: "active",
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await db.insert(booking).values({
				id: "booking-lifecycle-2",
				organizationId: "org-booking-lifecycle-2",
				boatId: "boat-booking-lifecycle-2",
				source: "web",
				status: "confirmed",
				paymentStatus: "paid",
				calendarSyncStatus: "linked",
				startsAt: new Date("2026-04-02T10:00:00.000Z"),
				endsAt: new Date("2026-04-02T13:00:00.000Z"),
				passengers: 4,
				basePriceCents: 120_000,
				discountAmountCents: 0,
				totalPriceCents: 120_000,
				currency: "RUB",
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await db.insert(bookingCancellationRequest).values({
				id: "cancel-request-2",
				bookingId: "booking-lifecycle-2",
				organizationId: "org-booking-lifecycle-2",
				status: "requested",
				requestedAt: new Date(),
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await expect(
				db.insert(bookingCancellationRequest).values({
					id: "cancel-request-3",
					bookingId: "booking-lifecycle-2",
					organizationId: "org-booking-lifecycle-2",
					status: "requested",
					requestedAt: new Date(),
					createdAt: new Date(),
					updatedAt: new Date(),
				})
			).rejects.toThrow();
		});
	});

	describe("Booking payment attempt table", () => {
		it("enforces booking-level idempotency keys", async () => {
			await db.insert(organization).values({
				id: "org-booking-payment-1",
				name: "Payment Org",
				slug: "payment-org",
				createdAt: new Date(),
			});

			await db.insert(boat).values({
				id: "boat-booking-payment-1",
				organizationId: "org-booking-payment-1",
				name: "Payment Boat",
				slug: "payment-boat",
				type: "motor",
				passengerCapacity: 8,
				status: "active",
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await db.insert(booking).values({
				id: "booking-payment-1",
				organizationId: "org-booking-payment-1",
				boatId: "boat-booking-payment-1",
				source: "web",
				status: "pending",
				paymentStatus: "unpaid",
				calendarSyncStatus: "pending",
				startsAt: new Date("2026-04-03T10:00:00.000Z"),
				endsAt: new Date("2026-04-03T12:00:00.000Z"),
				passengers: 2,
				basePriceCents: 90_000,
				discountAmountCents: 0,
				totalPriceCents: 90_000,
				currency: "RUB",
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await db.insert(bookingPaymentAttempt).values({
				id: "payment-attempt-1",
				bookingId: "booking-payment-1",
				organizationId: "org-booking-payment-1",
				provider: "manual",
				idempotencyKey: "idem-1",
				status: "initiated",
				amountCents: 90_000,
				currency: "RUB",
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await expect(
				db.insert(bookingPaymentAttempt).values({
					id: "payment-attempt-2",
					bookingId: "booking-payment-1",
					organizationId: "org-booking-payment-1",
					provider: "manual",
					idempotencyKey: "idem-1",
					status: "initiated",
					amountCents: 90_000,
					currency: "RUB",
					createdAt: new Date(),
					updatedAt: new Date(),
				})
			).rejects.toThrow();
		});
	});

	describe("Calendar webhook event table", () => {
		it("supports idempotency by provider/channel/message_number", async () => {
			await db.insert(organization).values({
				id: "org-calendar-webhook-1",
				name: "Calendar Org",
				slug: "calendar-org",
				createdAt: new Date(),
			});

			await db.insert(boat).values({
				id: "boat-calendar-webhook-1",
				organizationId: "org-calendar-webhook-1",
				name: "Calendar Boat",
				slug: "calendar-boat",
				type: "motor",
				passengerCapacity: 8,
				status: "active",
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await db.insert(boatCalendarConnection).values({
				id: "connection-calendar-webhook-1",
				boatId: "boat-calendar-webhook-1",
				provider: "google",
				externalCalendarId: "calendar-1",
				syncStatus: "idle",
				isPrimary: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await db.insert(calendarWebhookEvent).values({
				id: "webhook-event-1",
				provider: "google",
				channelId: "channel-1",
				resourceId: "resource-1",
				messageNumber: 1,
				resourceState: "exists",
				calendarConnectionId: "connection-calendar-webhook-1",
				status: "processed",
				receivedAt: new Date(),
				processedAt: new Date(),
				updatedAt: new Date(),
			});

			await expect(
				db.insert(calendarWebhookEvent).values({
					id: "webhook-event-2",
					provider: "google",
					channelId: "channel-1",
					resourceId: "resource-1",
					messageNumber: 1,
					resourceState: "exists",
					status: "processed",
					receivedAt: new Date(),
					updatedAt: new Date(),
				})
			).rejects.toThrow();
		});
	});

	describe("Support and messaging tables", () => {
		it("creates support ticket with message thread", async () => {
			await db.insert(organization).values({
				id: "org-support-1",
				name: "Support Org",
				slug: "support-org",
				createdAt: new Date(),
			});

			await db.insert(supportTicket).values({
				id: "ticket-1",
				organizationId: "org-support-1",
				source: "manual",
				status: "open",
				priority: "normal",
				subject: "Customer requested availability details",
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await db.insert(supportTicketMessage).values({
				id: "ticket-msg-1",
				ticketId: "ticket-1",
				organizationId: "org-support-1",
				channel: "internal",
				body: "Initial ticket note",
				isInternal: true,
				createdAt: new Date(),
			});

			const tickets = await db.select().from(supportTicket);
			const messages = await db.select().from(supportTicketMessage);

			expect(tickets).toHaveLength(1);
			expect(messages).toHaveLength(1);
			expect(messages[0]?.ticketId).toBe("ticket-1");
		});

		it("enforces inbound message dedupe by channel and dedupe key", async () => {
			await db.insert(inboundMessage).values({
				id: "inbound-1",
				channel: "telegram",
				externalMessageId: "ext-1",
				dedupeKey: "telegram:ext-1",
				payload: JSON.stringify({ text: "hello" }),
				status: "received",
				receivedAt: new Date(),
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await expect(
				db.insert(inboundMessage).values({
					id: "inbound-2",
					channel: "telegram",
					externalMessageId: "ext-2",
					dedupeKey: "telegram:ext-1",
					payload: JSON.stringify({ text: "duplicate" }),
					status: "received",
					receivedAt: new Date(),
					createdAt: new Date(),
					updatedAt: new Date(),
				})
			).rejects.toThrow();
		});

		it("enforces telegram notification idempotency per organization", async () => {
			await db.insert(organization).values({
				id: "org-telegram-notify-1",
				name: "Telegram Org",
				slug: "telegram-org",
				createdAt: new Date(),
			});

			await db.insert(telegramNotification).values({
				id: "notify-1",
				organizationId: "org-telegram-notify-1",
				templateKey: "booking.confirmed",
				recipientChatId: "123",
				idempotencyKey: "idem-notify-1",
				status: "queued",
				attemptCount: 0,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await expect(
				db.insert(telegramNotification).values({
					id: "notify-2",
					organizationId: "org-telegram-notify-1",
					templateKey: "booking.confirmed",
					recipientChatId: "123",
					idempotencyKey: "idem-notify-1",
					status: "queued",
					attemptCount: 0,
					createdAt: new Date(),
					updatedAt: new Date(),
				})
			).rejects.toThrow();
		});

		it("enforces telegram webhook event update_id uniqueness", async () => {
			await db.insert(telegramWebhookEvent).values({
				id: "tg-webhook-1",
				updateId: 1001,
				eventType: "message",
				payload: JSON.stringify({ message: { text: "hello" } }),
				status: "received",
				receivedAt: new Date(),
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await expect(
				db.insert(telegramWebhookEvent).values({
					id: "tg-webhook-2",
					updateId: 1001,
					eventType: "message",
					payload: JSON.stringify({ message: { text: "dupe" } }),
					status: "received",
					receivedAt: new Date(),
					createdAt: new Date(),
					updatedAt: new Date(),
				})
			).rejects.toThrow();
		});
	});

	describe("clearTestDatabase", () => {
		it("clears all data", async () => {
			await db.insert(user).values({
				id: "user-1",
				name: "John",
				email: "john@example.com",
				emailVerified: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			await db.insert(todo).values({ text: "Test" });

			clearTestDatabase(db);

			const users = await db.select().from(user);
			const todos = await db.select().from(todo);
			expect(users).toHaveLength(0);
			expect(todos).toHaveLength(0);
		});
	});
});
