import type { notificationEvent } from "@my-app/db/schema/notification";
import { afterEach, describe, expect, it } from "vitest";
import { notificationRecipientSchema } from "../../contracts";
import {
	createFakeEmailProvider,
	DEFAULT_NOTIFICATION_EMAIL_PROVIDER_ID,
	EmailNotificationProvider,
	registerEmailProvider,
	resetEmailProviderRegistry,
} from "..";

const buildEvent = (): typeof notificationEvent.$inferSelect => ({
	actorUserId: null,
	createdAt: new Date("2026-03-11T12:00:00Z"),
	eventType: "support.ticket.created",
	failureReason: null,
	id: "evt_123",
	idempotencyKey: "support.ticket.created:evt_123",
	organizationId: "org_123",
	payload: {},
	processedAt: null,
	processingStartedAt: null,
	sourceId: null,
	sourceType: null,
	status: "queued",
	updatedAt: new Date("2026-03-11T12:00:00Z"),
});

describe("EmailNotificationProvider", () => {
	afterEach(() => {
		resetEmailProviderRegistry();
	});

	it("sends email notifications through the registered EmailProvider", async () => {
		const fakeProvider = createFakeEmailProvider({
			providerId: DEFAULT_NOTIFICATION_EMAIL_PROVIDER_ID,
		});
		registerEmailProvider(fakeProvider);

		const provider = new EmailNotificationProvider({
			emailProviderId: DEFAULT_NOTIFICATION_EMAIL_PROVIDER_ID,
		});
		const recipient = notificationRecipientSchema.parse({
			body: "A new support ticket is waiting for review.",
			channels: ["email"],
			ctaUrl: "/org/support/tickets/ticket_123",
			metadata: { email: "agent@example.com" },
			title: "Support ticket created",
			userId: "user_123",
		});

		const result = await provider.send({
			event: buildEvent(),
			intentId: "intent_123",
			recipient,
		});

		expect(result.status).toBe("sent");
		expect(result.providerRecipient).toBe("agent@example.com");
		expect(fakeProvider.sent).toHaveLength(1);
		expect(fakeProvider.sent[0]?.message.subject).toBe(
			"Support ticket created"
		);
		expect(fakeProvider.sent[0]?.message.to).toEqual([
			{ address: "agent@example.com" },
		]);
		expect(fakeProvider.sent[0]?.message.text).toContain(
			"A new support ticket is waiting for review."
		);
		expect(fakeProvider.sent[0]?.message.html).toContain("Open notification");
	});

	it("fails fast when recipient email metadata is missing", async () => {
		const provider = new EmailNotificationProvider({
			emailProviderId: DEFAULT_NOTIFICATION_EMAIL_PROVIDER_ID,
		});
		const recipient = notificationRecipientSchema.parse({
			channels: ["email"],
			title: "Support ticket created",
			userId: "user_123",
		});

		const result = await provider.send({
			event: buildEvent(),
			intentId: "intent_123",
			recipient,
		});

		expect(result.status).toBe("failed");
		expect(result.failureReason).toBe("email is missing in recipient metadata");
	});
});
