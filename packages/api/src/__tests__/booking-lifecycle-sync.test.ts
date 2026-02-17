import { member, organization, user } from "@full-stack-cf-app/db/schema/auth";
import { boat } from "@full-stack-cf-app/db/schema/boat";
import {
	booking,
	bookingCalendarLink,
	bookingCancellationRequest,
	bookingShiftRequest,
} from "@full-stack-cf-app/db/schema/booking";
import {
	clearTestDatabase,
	createTestDatabase,
} from "@full-stack-cf-app/db/test";
import { eq, sql } from "drizzle-orm";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

const testDbState = createTestDatabase();

vi.doMock("@full-stack-cf-app/db", () => ({
	db: testDbState.db,
}));

const notificationsPusherMock = vi.fn();
vi.mock("@full-stack-cf-app/notifications/pusher", () => ({
	notificationsPusher: notificationsPusherMock,
}));

const { syncManagedBookingLifecycleFromExternalEvent } = await import(
	"../calendar/sync/booking-lifecycle-sync"
);

const queueStub = {
	send: vi.fn(async () => undefined),
};

const seedBase = () => {
	testDbState.db
		.insert(organization)
		.values({
			id: "org-1",
			name: "Org 1",
			slug: "org-1",
		})
		.run();

	testDbState.db
		.insert(user)
		.values([
			{
				id: "customer-1",
				name: "Customer",
				email: "customer@example.com",
			},
			{
				id: "creator-1",
				name: "Creator",
				email: "creator@example.com",
			},
			{
				id: "owner-1",
				name: "Owner",
				email: "owner@example.com",
			},
		])
		.run();

	testDbState.db
		.insert(member)
		.values({
			id: "membership-1",
			organizationId: "org-1",
			userId: "owner-1",
			role: "org_owner",
		})
		.run();

	testDbState.db
		.insert(boat)
		.values({
			id: "boat-1",
			organizationId: "org-1",
			name: "Aurora",
			slug: "aurora",
			status: "active",
			passengerCapacity: 10,
			minimumHours: 1,
			timezone: "UTC",
		})
		.run();

	testDbState.db
		.insert(booking)
		.values({
			id: "booking-1",
			organizationId: "org-1",
			boatId: "boat-1",
			customerUserId: "customer-1",
			createdByUserId: "creator-1",
			status: "confirmed",
			paymentStatus: "paid",
			startsAt: new Date("2026-03-18T09:00:00.000Z"),
			endsAt: new Date("2026-03-18T11:00:00.000Z"),
			passengers: 2,
			timezone: "UTC",
			basePriceCents: 30_000,
			discountAmountCents: 0,
			totalPriceCents: 30_000,
			currency: "RUB",
		})
		.run();

	testDbState.db
		.insert(bookingCalendarLink)
		.values({
			id: "calendar-link-1",
			bookingId: "booking-1",
			provider: "google",
			externalCalendarId: "calendar-1",
			externalEventId: "event-1",
		})
		.run();
};

describe("syncManagedBookingLifecycleFromExternalEvent", () => {
	beforeAll(() => {
		testDbState.db.run(sql`PRAGMA foreign_keys = ON`);
	});

	afterAll(() => {
		testDbState.close();
	});

	beforeEach(() => {
		clearTestDatabase(testDbState.db);
		notificationsPusherMock.mockReset();
		queueStub.send.mockClear();
		seedBase();
	});

	it("creates pending shift request when linked event time changes", async () => {
		const result = await syncManagedBookingLifecycleFromExternalEvent({
			provider: "google",
			externalCalendarId: "calendar-1",
			event: {
				externalEventId: "event-1",
				status: "confirmed",
				startsAt: new Date("2026-03-18T10:00:00.000Z"),
				endsAt: new Date("2026-03-18T12:00:00.000Z"),
			},
			syncedAt: new Date("2026-02-17T12:00:00.000Z"),
			notificationQueue: queueStub,
		});

		expect(result).toMatchObject({
			handled: true,
			action: "shift_requested",
			changed: true,
		});

		const [savedShiftRequest] = testDbState.db
			.select()
			.from(bookingShiftRequest)
			.where(eq(bookingShiftRequest.bookingId, "booking-1"))
			.all();
		expect(savedShiftRequest?.status).toBe("pending");
		expect(savedShiftRequest?.initiatedByRole).toBe("manager");
		expect(savedShiftRequest?.customerDecision).toBe("pending");
		expect(savedShiftRequest?.managerDecision).toBe("approved");
		expect(savedShiftRequest?.proposedStartsAt.toISOString()).toBe(
			"2026-03-18T10:00:00.000Z"
		);
		expect(savedShiftRequest?.proposedEndsAt.toISOString()).toBe(
			"2026-03-18T12:00:00.000Z"
		);

		expect(notificationsPusherMock).toHaveBeenCalledTimes(1);
		const call = notificationsPusherMock.mock.calls[0]?.[0];
		expect(call?.input.eventType).toBe("booking.shift.requested.external");
		const recipientUserIds =
			call?.input.payload.recipients.map(
				(recipient: { userId: string }) => recipient.userId
			) ?? [];
		expect(recipientUserIds.sort()).toEqual([
			"creator-1",
			"customer-1",
			"owner-1",
		]);
	});

	it("creates requested cancellation when linked event is deleted", async () => {
		const result = await syncManagedBookingLifecycleFromExternalEvent({
			provider: "google",
			externalCalendarId: "calendar-1",
			event: {
				externalEventId: "event-1",
				status: "cancelled",
			},
			syncedAt: new Date("2026-02-17T12:05:00.000Z"),
			notificationQueue: queueStub,
		});

		expect(result).toMatchObject({
			handled: true,
			action: "cancellation_requested",
			changed: true,
		});

		const [savedCancellationRequest] = testDbState.db
			.select()
			.from(bookingCancellationRequest)
			.where(eq(bookingCancellationRequest.bookingId, "booking-1"))
			.all();
		expect(savedCancellationRequest?.status).toBe("requested");
		expect(savedCancellationRequest?.requestedByUserId).toBeNull();
		expect(savedCancellationRequest?.reason).toBe(
			"Requested from external calendar event deletion"
		);

		expect(notificationsPusherMock).toHaveBeenCalledTimes(1);
		const call = notificationsPusherMock.mock.calls[0]?.[0];
		expect(call?.input.eventType).toBe(
			"booking.cancellation.requested.external"
		);
	});
});
