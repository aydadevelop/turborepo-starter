import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { assistantChat, assistantMessage } from "../schema/assistant";
import {
	account,
	invitation,
	member,
	organization,
	user,
} from "../schema/auth";
import { userConsent } from "../schema/consent";
import {
	contaktlyCalendarConnection,
	contaktlyConversation,
	contaktlyMessage,
	contaktlyPrefillDraft,
	contaktlyTurn,
	contaktlyWorkspaceConfig,
} from "../schema/contaktly";
import {
	notificationDelivery,
	notificationEvent,
	notificationInApp,
	notificationIntent,
	notificationPreference,
} from "../schema/notification";
import { todo } from "../schema/todo";
import {
	bootstrapTestDatabase,
	clearTestDatabase,
	type TestDatabase,
} from "../test";

describe("Test Database Setup", () => {
	const testDatabase = bootstrapTestDatabase({ seedStrategy: "beforeEach" });
	let db: TestDatabase;

	beforeEach(() => {
		db = testDatabase.db;
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

	describe("Contaktly conversation table", () => {
		it("stores widget config overrides per public config id", async () => {
			await db.insert(organization).values({
				id: "ctly-org-1",
				name: "Contaktly Org",
				slug: "contaktly-org-1",
			});
			await db.insert(contaktlyWorkspaceConfig).values({
				id: "ctly-config-1",
				organizationId: "ctly-org-1",
				publicConfigId: "ctly-demo-founder",
				bookingUrl: "https://calendly.com/demo-team/intro",
				allowedDomains: ["localhost", "app.contaktly.com"],
			});

			const rows = await db.select().from(contaktlyWorkspaceConfig);
			expect(rows).toHaveLength(1);
			expect(rows[0]?.publicConfigId).toBe("ctly-demo-founder");
			expect(rows[0]?.bookingUrl).toBe("https://calendly.com/demo-team/intro");
		});

		it("enforces one widget config row per public config id", async () => {
			await db.insert(organization).values({
				id: "ctly-org-unique-1",
				name: "Contaktly Org Unique",
				slug: "contaktly-org-unique-1",
			});
			await db.insert(contaktlyWorkspaceConfig).values({
				id: "ctly-config-unique-1",
				organizationId: "ctly-org-unique-1",
				publicConfigId: "ctly-demo-founder",
				bookingUrl: "https://calendly.com/demo-team/intro",
			});

			await expect(
				db
					.insert(organization)
					.values({
						id: "ctly-org-unique-2",
						name: "Contaktly Org Unique 2",
						slug: "contaktly-org-unique-2",
					})
					.then(() =>
						db.insert(contaktlyWorkspaceConfig).values({
							id: "ctly-config-unique-2",
							organizationId: "ctly-org-unique-2",
							publicConfigId: "ctly-demo-founder",
							bookingUrl: "https://calendly.com/demo-team/follow-up",
						})
					)
			).rejects.toThrow();
		});

		it("stores generated prefill drafts per public config id", async () => {
			await db.insert(contaktlyPrefillDraft).values({
				id: "ctly-prefill-1",
				publicConfigId: "ctly-demo-founder",
				sourceUrl: "http://localhost:43275/",
				siteTitle: "Mary Gold Studio",
				businessSummary: "Mary Gold helps founders sharpen messaging.",
				openingMessage: "Hi, I'm Ava for Mary Gold Studio.",
				starterCards: ["I need a website redesign"],
				customInstructions: "Stay clarity-first.",
				qualifiedLeadDefinition:
					"Founder-led B2B teams with messy qualification.",
			});

			const rows = await db.select().from(contaktlyPrefillDraft);
			expect(rows).toHaveLength(1);
			expect(rows[0]?.publicConfigId).toBe("ctly-demo-founder");
			expect(rows[0]?.starterCards).toContain("I need a website redesign");
		});

		it("enforces one prefill draft row per public config id", async () => {
			await db.insert(contaktlyPrefillDraft).values({
				id: "ctly-prefill-unique-1",
				publicConfigId: "ctly-demo-founder",
				sourceUrl: "http://localhost:43275/",
				siteTitle: "Mary Gold Studio",
				businessSummary: "summary",
				openingMessage: "opening",
				starterCards: ["starter"],
				customInstructions: "instructions",
				qualifiedLeadDefinition: "definition",
			});

			await expect(
				db.insert(contaktlyPrefillDraft).values({
					id: "ctly-prefill-unique-2",
					publicConfigId: "ctly-demo-founder",
					sourceUrl: "http://localhost:43275/",
					siteTitle: "Mary Gold Studio",
					businessSummary: "summary",
					openingMessage: "opening",
					starterCards: ["starter"],
					customInstructions: "instructions",
					qualifiedLeadDefinition: "definition",
				})
			).rejects.toThrow();
		});

		it("stores one Google calendar connection per public config id", async () => {
			await db.insert(user).values({
				id: "ctly-user-1",
				name: "Calendar Admin",
				email: "calendar-admin@example.com",
				emailVerified: true,
			});
			await db.insert(account).values({
				id: "ctly-account-google-1",
				accountId: "google-calendar-admin",
				providerId: "google",
				userId: "ctly-user-1",
				scope: "https://www.googleapis.com/auth/calendar.events",
			});

			await db.insert(contaktlyCalendarConnection).values({
				id: "ctly-calendar-1",
				publicConfigId: "ctly-demo-founder",
				provider: "google",
				providerAccountId: "google-calendar-admin",
				connectedUserId: "ctly-user-1",
				accountEmail: "calendar-admin@example.com",
				calendarId: "primary",
				scopes: ["https://www.googleapis.com/auth/calendar.events"],
			});

			const rows = await db.select().from(contaktlyCalendarConnection);
			expect(rows).toHaveLength(1);
			expect(rows[0]?.publicConfigId).toBe("ctly-demo-founder");
			expect(rows[0]?.provider).toBe("google");
			expect(rows[0]?.calendarId).toBe("primary");
		});

		it("enforces one calendar connection row per public config id", async () => {
			await db.insert(user).values({
				id: "ctly-user-1",
				name: "Calendar Admin",
				email: "calendar-admin@example.com",
				emailVerified: true,
			});
			await db.insert(account).values({
				id: "ctly-account-google-1",
				accountId: "google-calendar-admin",
				providerId: "google",
				userId: "ctly-user-1",
				scope: "https://www.googleapis.com/auth/calendar.events",
			});
			await db.insert(contaktlyCalendarConnection).values({
				id: "ctly-calendar-unique-1",
				publicConfigId: "ctly-demo-founder",
				provider: "google",
				providerAccountId: "google-calendar-admin",
				connectedUserId: "ctly-user-1",
				accountEmail: "calendar-admin@example.com",
				calendarId: "primary",
				scopes: ["https://www.googleapis.com/auth/calendar.events"],
			});

			await expect(
				db.insert(contaktlyCalendarConnection).values({
					id: "ctly-calendar-unique-2",
					publicConfigId: "ctly-demo-founder",
					provider: "google",
					providerAccountId: "google-calendar-admin-2",
					connectedUserId: "ctly-user-1",
					accountEmail: "calendar-admin@example.com",
					calendarId: "primary",
					scopes: ["https://www.googleapis.com/auth/calendar.events"],
				})
			).rejects.toThrow();
		});

		it("persists conversation transcript and active prompt state", async () => {
			await db.insert(contaktlyConversation).values({
				id: "ctly-conv-1",
				configId: "ctly-demo-founder",
				visitorId: "visitor-1",
				lastWidgetInstanceId: "instance-1",
				activePromptKey: "goal",
				lastIntent: "general",
				stage: "qualification",
				stateVersion: 0,
				messages: [
					{
						id: "msg-1",
						role: "assistant",
						text: "What outcome do you need first?",
						createdAt: "2026-03-06T00:00:00.000Z",
						intent: "general",
						promptKey: "goal",
					},
				],
			});

			const rows = await db.select().from(contaktlyConversation);
			expect(rows).toHaveLength(1);
			expect(rows[0]?.messages).toHaveLength(1);
			expect(rows[0]?.activePromptKey).toBe("goal");
		});

		it("enforces one active conversation row per config and visitor", async () => {
			await db.insert(contaktlyConversation).values({
				id: "ctly-conv-2",
				configId: "ctly-demo-founder",
				visitorId: "visitor-unique",
				lastWidgetInstanceId: "instance-1",
			});

			await expect(
				db.insert(contaktlyConversation).values({
					id: "ctly-conv-3",
					configId: "ctly-demo-founder",
					visitorId: "visitor-unique",
					lastWidgetInstanceId: "instance-2",
				})
			).rejects.toThrow();
		});

		it("supports normalized turn and message rows", async () => {
			await db.insert(contaktlyConversation).values({
				id: "ctly-conv-4",
				configId: "ctly-demo-founder",
				visitorId: "visitor-turns",
				lastWidgetInstanceId: "instance-1",
				nextMessageOrder: 3,
			});

			await db.insert(contaktlyTurn).values({
				id: "ctly-turn-1",
				conversationId: "ctly-conv-4",
				clientTurnId: "client-turn-1",
				stateVersionBefore: 0,
				stateVersionAfter: 1,
				userInput: "Need better positioning",
			});

			await db.insert(contaktlyMessage).values([
				{
					id: "ctly-msg-1",
					conversationId: "ctly-conv-4",
					turnId: "ctly-turn-1",
					messageOrder: 1,
					role: "user",
					text: "Need better positioning",
				},
				{
					id: "ctly-msg-2",
					conversationId: "ctly-conv-4",
					turnId: "ctly-turn-1",
					messageOrder: 2,
					role: "assistant",
					text: "Who is the audience you want to convert first?",
					intent: "messaging",
					promptKey: "audience",
				},
			]);

			const turns = await db.select().from(contaktlyTurn);
			const messages = await db.select().from(contaktlyMessage);
			expect(turns).toHaveLength(1);
			expect(messages).toHaveLength(2);
		});

		it("enforces client turn id uniqueness per conversation", async () => {
			await db.insert(contaktlyConversation).values({
				id: "ctly-conv-5",
				configId: "ctly-demo-founder",
				visitorId: "visitor-turn-dedupe",
				lastWidgetInstanceId: "instance-1",
			});

			await db.insert(contaktlyTurn).values({
				id: "ctly-turn-2",
				conversationId: "ctly-conv-5",
				clientTurnId: "client-turn-duplicate",
				stateVersionBefore: 0,
				stateVersionAfter: 1,
				userInput: "Need more inbound leads",
			});

			await expect(
				db.insert(contaktlyTurn).values({
					id: "ctly-turn-3",
					conversationId: "ctly-conv-5",
					clientTurnId: "client-turn-duplicate",
					stateVersionBefore: 1,
					stateVersionAfter: 2,
					userInput: "Retry same turn",
				})
			).rejects.toThrow();
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

			await clearTestDatabase(db);

			const users = await db.select().from(user);
			const todos = await db.select().from(todo);
			expect(users).toHaveLength(0);
			expect(todos).toHaveLength(0);
		});
	});
});
