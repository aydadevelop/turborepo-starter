import { account, user } from "@my-app/db/schema/auth";
import { bootstrapTestDatabase } from "@my-app/db/test";
import { describe, expect, it, vi } from "vitest";

const testDbState = bootstrapTestDatabase();

vi.doMock("@my-app/db", () => ({
	get db() {
		return testDbState.db;
	},
}));

const {
	connectContaktlyGoogleCalendar,
	getContaktlyGoogleCalendarConnectionStatus,
} = await import("../lib/contaktly-google-calendar");

describe("contaktly booking roadmap", () => {
	it.todo(
		"maps a saved booking URL override through public bootstrap and widget CTA rendering"
	);

	it("shows a linked Google account with calendar scopes before the workspace connection is persisted", async () => {
		await testDbState.db.insert(user).values({
			id: "seed-user-admin",
			name: "Admin User",
			email: "admin@admin.com",
			emailVerified: true,
		});
		await testDbState.db.insert(account).values({
			id: "seed-account-admin-google",
			accountId: "google-admin-sub",
			providerId: "google",
			userId: "seed-user-admin",
			scope: [
				"https://www.googleapis.com/auth/calendar.events",
				"https://www.googleapis.com/auth/calendar.readonly",
			].join(","),
			accessToken: "google-access-token",
			refreshToken: "google-refresh-token",
		});

		const status = await getContaktlyGoogleCalendarConnectionStatus({
			configId: "ctly-demo-founder",
			userId: "seed-user-admin",
		});

		expect(status.status).toBe("linked_account");
		expect(status.accountEmail).toBe("admin@admin.com");
		expect(status.calendarId).toBeNull();
		expect(status.scopes).toContain(
			"https://www.googleapis.com/auth/calendar.events"
		);
		expect(status.connectedAt).toBeNull();
	});

	it("persists Google OAuth calendar connection metadata for the MVP path", async () => {
		await testDbState.db.insert(user).values({
			id: "seed-user-admin",
			name: "Admin User",
			email: "admin@admin.com",
			emailVerified: true,
		});
		await testDbState.db.insert(account).values({
			id: "seed-account-admin-google",
			accountId: "google-admin-sub",
			providerId: "google",
			userId: "seed-user-admin",
			scope: [
				"https://www.googleapis.com/auth/calendar.events",
				"https://www.googleapis.com/auth/calendar.readonly",
			].join(","),
			accessToken: "google-access-token",
			refreshToken: "google-refresh-token",
		});

		const connected = await connectContaktlyGoogleCalendar({
			configId: "ctly-demo-founder",
			userId: "seed-user-admin",
		});

		const reloaded = await getContaktlyGoogleCalendarConnectionStatus({
			configId: "ctly-demo-founder",
			userId: "seed-user-admin",
		});

		expect(connected.status).toBe("connected");
		expect(connected.accountEmail).toBe("admin@admin.com");
		expect(connected.calendarId).toBe("primary");
		expect(connected.connectedAt).toBeTruthy();
		expect(connected.scopes).toContain(
			"https://www.googleapis.com/auth/calendar.events"
		);
		expect(reloaded).toEqual(connected);
	});

	it("rejects the MVP connect step when the linked Google account does not have calendar scopes", async () => {
		await testDbState.db.insert(user).values({
			id: "seed-user-admin",
			name: "Admin User",
			email: "admin@admin.com",
			emailVerified: true,
		});
		await testDbState.db.insert(account).values({
			id: "seed-account-admin-google",
			accountId: "google-admin-sub",
			providerId: "google",
			userId: "seed-user-admin",
			scope: "openid,email,profile",
			accessToken: "google-access-token",
			refreshToken: "google-refresh-token",
		});

		const status = await getContaktlyGoogleCalendarConnectionStatus({
			configId: "ctly-demo-founder",
			userId: "seed-user-admin",
		});

		await expect(
			connectContaktlyGoogleCalendar({
				configId: "ctly-demo-founder",
				userId: "seed-user-admin",
			})
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
		expect(status.status).toBe("missing_scope");
		expect(status.scopes).toEqual(["openid", "email", "profile"]);
	});

	it.todo("maps connected calendar availability into appointment types");
	it.todo("creates a booking record and returns confirmation details");
});
