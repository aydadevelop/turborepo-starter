import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { assistantChat, assistantMessage } from "../schema/assistant";
import { invitation, member, organization, user } from "../schema/auth";
import { userConsent } from "../schema/consent";
import {
	notificationDelivery,
	notificationEvent,
	notificationInApp,
	notificationIntent,
	notificationPreference,
} from "../schema/notification";
import { todo } from "../schema/todo";
import {
	clearTestDatabase,
	createTestDatabase,
	type TestDatabase,
} from "../test";

describe("Test Database Setup", () => {
	let db: TestDatabase;
	let close: () => void;

	beforeEach(async () => {
		const testDb = await createTestDatabase();
		db = testDb.db;
		close = testDb.close;
	});

	afterEach(() => {
		close();
	});

	describe("User table", () => {
		it("can create a user", async () => {
			await db.insert(user).values({
				id: "user-1",
				name: "John Doe",
				email: "john@example.com",
				emailVerified: false,
			});

			const users = await db.select().from(user);
			expect(users).toHaveLength(1);
			expect(users[0]?.email).toBe("john@example.com");
		});

		it("enforces unique email constraint", async () => {
			await db.insert(user).values({
				id: "user-1",
				name: "John Doe",
				email: "john@example.com",
				emailVerified: false,
			});

			await expect(
				db.insert(user).values({
					id: "user-2",
					name: "Jane Doe",
					email: "john@example.com",
					emailVerified: true,
				})
			).rejects.toThrow();
		});
	});

	describe("Todo table", () => {
		it("supports create, update, and delete", async () => {
			const [inserted] = await db
				.insert(todo)
				.values({ text: "Ship starter" })
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
			expect(updated?.completed).toBe(true);

			await db.delete(todo).where(eq(todo.id, inserted.id));
			const rows = await db.select().from(todo);
			expect(rows).toHaveLength(0);
		});
	});

	describe("Organization membership", () => {
		it("enforces one membership per user per organization", async () => {
			await db.insert(organization).values({
				id: "org-1",
				name: "Primary Org",
				slug: "primary-org",
			});
			await db.insert(user).values({
				id: "user-1",
				name: "Org User",
				email: "org-user@example.com",
				emailVerified: true,
			});

			await db.insert(member).values({
				id: "member-1",
				organizationId: "org-1",
				userId: "user-1",
				role: "org_owner",
			});

			await expect(
				db.insert(member).values({
					id: "member-2",
					organizationId: "org-1",
					userId: "user-1",
					role: "manager",
				})
			).rejects.toThrow();
		});

		it("supports invitation rows", async () => {
			await db.insert(organization).values({
				id: "org-inv-1",
				name: "Inv Org",
				slug: "inv-org",
			});
			await db.insert(user).values({
				id: "user-inv-1",
				name: "Inviter",
				email: "inviter@example.com",
				emailVerified: true,
			});

			await db.insert(invitation).values({
				id: "inv-1",
				organizationId: "org-inv-1",
				email: "new-user@example.com",
				role: "member",
				status: "pending",
				expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
				inviterId: "user-inv-1",
			});

			const invitations = await db.select().from(invitation);
			expect(invitations).toHaveLength(1);
			expect(invitations[0]?.email).toBe("new-user@example.com");
		});
	});

	describe("Assistant tables", () => {
		it("creates chats with messages", async () => {
			await db.insert(user).values({
				id: "user-chat-1",
				name: "Chat User",
				email: "chat@example.com",
				emailVerified: true,
			});

			await db.insert(assistantChat).values({
				id: "chat-1",
				title: "Starter chat",
				userId: "user-chat-1",
				visibility: "private",
			});

			await db.insert(assistantMessage).values({
				id: "msg-1",
				chatId: "chat-1",
				role: "assistant",
				parts: [{ type: "text", text: "Hello" }],
				attachments: [],
			});

			const messages = await db.select().from(assistantMessage);
			expect(messages).toHaveLength(1);
			expect(messages[0]?.chatId).toBe("chat-1");
		});
	});

	describe("Consent table", () => {
		it("records user consent versions", async () => {
			await db.insert(user).values({
				id: "user-consent-1",
				name: "Consent User",
				email: "consent@example.com",
				emailVerified: true,
			});

			await db.insert(userConsent).values({
				id: "consent-1",
				userId: "user-consent-1",
				consentType: "service_agreement",
				consentVersion: "2026-02-14",
				consentedAt: new Date(),
				ipAddress: "127.0.0.1",
				userAgent: "vitest",
			});

			const rows = await db.select().from(userConsent);
			expect(rows).toHaveLength(1);
			expect(rows[0]?.consentType).toBe("service_agreement");
		});
	});

	describe("Notification tables", () => {
		it("enforces event idempotency key uniqueness per organization", async () => {
			await db.insert(organization).values({
				id: "org-notify-1",
				name: "Notify Org",
				slug: "notify-org",
			});

			await db.insert(notificationEvent).values({
				id: "event-1",
				organizationId: "org-notify-1",
				eventType: "task.recurring.tick",
				idempotencyKey: "notify:org-notify-1:1",
				payload: JSON.stringify({ recipients: [] }),
			});

			await expect(
				db.insert(notificationEvent).values({
					id: "event-2",
					organizationId: "org-notify-1",
					eventType: "task.recurring.tick",
					idempotencyKey: "notify:org-notify-1:1",
					payload: JSON.stringify({ recipients: [] }),
				})
			).rejects.toThrow();
		});

		it("supports event -> intent -> delivery -> in-app flow", async () => {
			await db.insert(organization).values({
				id: "org-notify-2",
				name: "Notify Org 2",
				slug: "notify-org-2",
			});
			await db.insert(user).values({
				id: "user-notify-1",
				name: "Notify User",
				email: "notify@example.com",
				emailVerified: true,
			});

			await db.insert(notificationEvent).values({
				id: "event-flow-1",
				organizationId: "org-notify-2",
				eventType: "payment.mock.charge.succeeded",
				idempotencyKey: "notify:org-notify-2:charge:1",
				payload: JSON.stringify({ recipients: [{ userId: "user-notify-1" }] }),
				status: "queued",
			});

			await db.insert(notificationIntent).values({
				id: "intent-1",
				eventId: "event-flow-1",
				organizationId: "org-notify-2",
				recipientUserId: "user-notify-1",
				channel: "in_app",
				templateKey: "payment.mock.charge",
				title: "Charge succeeded",
				body: "Your payment succeeded",
				status: "sent",
			});

			await db.insert(notificationDelivery).values({
				id: "delivery-1",
				intentId: "intent-1",
				organizationId: "org-notify-2",
				provider: "in_app",
				providerRecipient: "user-notify-1",
				attempt: 1,
				status: "sent",
				sentAt: new Date(),
			});

			await expect(
				db.insert(notificationDelivery).values({
					id: "delivery-2",
					intentId: "intent-1",
					organizationId: "org-notify-2",
					provider: "in_app",
					attempt: 1,
					status: "queued",
				})
			).rejects.toThrow();

			await db.insert(notificationInApp).values({
				id: "in-app-1",
				eventId: "event-flow-1",
				intentId: "intent-1",
				organizationId: "org-notify-2",
				userId: "user-notify-1",
				title: "Charge succeeded",
				body: "Your payment succeeded",
				ctaUrl: "/dashboard",
				severity: "success",
				deliveredAt: new Date(),
			});

			const intents = await db.select().from(notificationIntent);
			const deliveries = await db.select().from(notificationDelivery);
			const inApp = await db.select().from(notificationInApp);
			expect(intents).toHaveLength(1);
			expect(deliveries).toHaveLength(1);
			expect(inApp).toHaveLength(1);
		});

		it("enforces notification preference scope uniqueness", async () => {
			await db.insert(user).values({
				id: "user-pref-1",
				name: "Preference User",
				email: "prefs@example.com",
				emailVerified: true,
			});

			await db.insert(notificationPreference).values({
				id: "pref-1",
				userId: "user-pref-1",
				organizationId: null,
				organizationScopeKey: "global",
				eventType: "*",
				channel: "in_app",
				enabled: true,
			});

			await expect(
				db.insert(notificationPreference).values({
					id: "pref-2",
					userId: "user-pref-1",
					organizationId: null,
					organizationScopeKey: "global",
					eventType: "*",
					channel: "in_app",
					enabled: false,
				})
			).rejects.toThrow();
		});
	});

	describe("clearTestDatabase", () => {
		it("clears all data", async () => {
			await db.insert(user).values({
				id: "user-clear-1",
				name: "Clear User",
				email: "clear@example.com",
				emailVerified: false,
			});
			await db.insert(todo).values({ text: "to clear" });

			clearTestDatabase(db);

			const users = await db.select().from(user);
			const todos = await db.select().from(todo);
			expect(users).toHaveLength(0);
			expect(todos).toHaveLength(0);
		});
	});
});
