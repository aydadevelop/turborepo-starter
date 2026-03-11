import { organization } from "@my-app/db/schema/auth";
import {
	inboundMessage,
	supportTicket,
	supportTicketMessage,
} from "@my-app/db/schema/support";
import { bootstrapTestDatabase, type TestDatabase } from "@my-app/db/test";
import { clearEventPushers } from "@my-app/events";
import { count } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG_ID = "support-email-route-org-1";

const liveRouteTestDbState = bootstrapTestDatabase({
	seedStrategy: "beforeAll",
	seed: async (db: TestDatabase) => {
		await db.insert(organization).values({
			id: ORG_ID,
			name: "Support Email Route Org",
			slug: "support-email-route-org",
		});
	},
});

interface SupportEmailRouteEnv {
	BETTER_AUTH_SECRET: string;
	BETTER_AUTH_URL: string;
	CLOUDPAYMENTS_API_SECRET: string;
	CLOUDPAYMENTS_PUBLIC_ID: string;
	CORS_ORIGIN: string;
	SERVER_URL: string;
	SUPPORT_EMAIL_INTAKE_ORGANIZATION_ID: string;
	SUPPORT_EMAIL_INTAKE_SECRET: string;
}

const requiredServerEnv: SupportEmailRouteEnv = {
	BETTER_AUTH_SECRET: "test-secret-123456",
	BETTER_AUTH_URL: "http://localhost:3000/api/auth",
	CLOUDPAYMENTS_API_SECRET: "",
	CLOUDPAYMENTS_PUBLIC_ID: "",
	CORS_ORIGIN: "http://localhost:5173",
	SERVER_URL: "http://localhost:3000",
	SUPPORT_EMAIL_INTAKE_ORGANIZATION_ID: ORG_ID,
	SUPPORT_EMAIL_INTAKE_SECRET: "support-secret",
} as const;

const samplePayload = {
	attachments: [],
	from: { address: "sender@example.com", name: "Sender" },
	headers: {
		"message-id": ["<reply-message-id@example.com>"],
		references: [
			"<root-message-id@example.com> <reply-message-id@example.com>",
		],
	},
	inReplyTo: "<root-message-id@example.com>",
	messageId: "<reply-message-id@example.com>",
	references: [
		"<root-message-id@example.com>",
		"<reply-message-id@example.com>",
	],
	subject: "Re: Need help",
	text: "Hello from support email ingress",
	to: [{ address: "support@example.com" }],
};

const setupSupportEmailRoute = async (options?: {
	db?: unknown;
	env?: Partial<SupportEmailRouteEnv>;
	processInboundSupportIntent?: typeof import("@my-app/support")["processInboundSupportIntent"];
}) => {
	vi.resetModules();
	vi.doUnmock("@my-app/support");
	vi.doMock("@my-app/env/server", () => ({
		env: {
			...requiredServerEnv,
			...(options?.env ?? {}),
		},
	}));
	vi.doMock("@my-app/db", () => ({
		db: options?.db ?? liveRouteTestDbState.db,
	}));

	if (options?.processInboundSupportIntent) {
		vi.doMock("@my-app/support", async () => {
			const actual =
				await vi.importActual<typeof import("@my-app/support")>(
					"@my-app/support"
				);

			return {
				...actual,
				processInboundSupportIntent: options.processInboundSupportIntent,
			};
		});
	}

	const { supportEmailIntakeRoutes } = await import(
		"../routes/support-email-intake"
	);

	return { supportEmailIntakeRoutes };
};

describe("supportEmailIntakeRoutes", () => {
	beforeEach(() => {
		clearEventPushers();
		vi.restoreAllMocks();
	});

	it("returns 503 when support email intake is not configured", async () => {
		const { supportEmailIntakeRoutes } = await setupSupportEmailRoute({
			env: {
				SUPPORT_EMAIL_INTAKE_ORGANIZATION_ID: "",
				SUPPORT_EMAIL_INTAKE_SECRET: "",
			},
		});

		const response = await supportEmailIntakeRoutes.request(
			"/api/support/inbound/email",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify(samplePayload),
			}
		);

		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({
			error: "Support email intake is not configured",
		});
	});

	it("returns 404 when the shared secret is invalid", async () => {
		const { supportEmailIntakeRoutes } = await setupSupportEmailRoute();

		const response = await supportEmailIntakeRoutes.request(
			"/api/support/inbound/email",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-support-email-secret": "wrong-secret",
				},
				body: JSON.stringify(samplePayload),
			}
		);

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: "Not Found" });
	});

	it("maps validated transport payloads into the support workflow input", async () => {
		const processInboundSupportIntent = vi.fn().mockResolvedValue({
			inbound: { id: "inbound-1" },
			message: { id: "message-1" },
			ticket: { id: "ticket-1" },
		});
		const { supportEmailIntakeRoutes } = await setupSupportEmailRoute({
			processInboundSupportIntent,
		});

		const response = await supportEmailIntakeRoutes.request(
			"/api/support/inbound/email",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-support-email-secret":
						requiredServerEnv.SUPPORT_EMAIL_INTAKE_SECRET,
				},
				body: JSON.stringify(samplePayload),
			}
		);

		expect(response.status).toBe(202);
		expect(await response.json()).toEqual({
			inboundMessageId: "inbound-1",
			messageId: "message-1",
			ticketId: "ticket-1",
		});
		expect(processInboundSupportIntent).toHaveBeenCalledWith(
			expect.objectContaining({
				channel: "email",
				dedupeKey: "email:reply-message-id@example.com",
				externalMessageId: "reply-message-id@example.com",
				externalThreadId: "root-message-id@example.com",
				organizationId: ORG_ID,
			}),
			expect.anything(),
			expect.objectContaining({
				idempotencyKey: "support-email:<reply-message-id@example.com>",
				organizationId: ORG_ID,
			})
		);
	});
});

describe("supportEmailIntakeRoutes live ingress", () => {
	beforeEach(() => {
		clearEventPushers();
		vi.restoreAllMocks();
	});

	it("persists support inbound messages, tickets, and messages through the production route", async () => {
		const { supportEmailIntakeRoutes } = await setupSupportEmailRoute();

		const response = await supportEmailIntakeRoutes.request(
			"/api/support/inbound/email",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-support-email-secret":
						requiredServerEnv.SUPPORT_EMAIL_INTAKE_SECRET,
				},
				body: JSON.stringify(samplePayload),
			}
		);

		expect(response.status).toBe(202);

		const [inboundCountRow] = await liveRouteTestDbState.db
			.select({ value: count() })
			.from(inboundMessage);
		const [ticketCountRow] = await liveRouteTestDbState.db
			.select({ value: count() })
			.from(supportTicket);
		const [messageCountRow] = await liveRouteTestDbState.db
			.select({ value: count() })
			.from(supportTicketMessage);

		expect(inboundCountRow?.value).toBe(1);
		expect(ticketCountRow?.value).toBe(1);
		expect(messageCountRow?.value).toBe(1);
	});

	it("treats duplicate inbound deliveries as idempotent success instead of a retryable 500", async () => {
		const { supportEmailIntakeRoutes } = await setupSupportEmailRoute();

		const requestInit = {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-support-email-secret": requiredServerEnv.SUPPORT_EMAIL_INTAKE_SECRET,
			},
			body: JSON.stringify(samplePayload),
		} satisfies RequestInit;

		const firstResponse = await supportEmailIntakeRoutes.request(
			"/api/support/inbound/email",
			requestInit
		);
		const secondResponse = await supportEmailIntakeRoutes.request(
			"/api/support/inbound/email",
			requestInit
		);

		expect(firstResponse.status).toBe(202);
		expect(secondResponse.status).toBe(202);
		expect(await secondResponse.json()).toEqual({
			duplicate: true,
			messageId: "<reply-message-id@example.com>",
		});

		const [inboundCountRow] = await liveRouteTestDbState.db
			.select({ value: count() })
			.from(inboundMessage);
		const [ticketCountRow] = await liveRouteTestDbState.db
			.select({ value: count() })
			.from(supportTicket);
		const [messageCountRow] = await liveRouteTestDbState.db
			.select({ value: count() })
			.from(supportTicketMessage);

		expect(inboundCountRow?.value).toBe(1);
		expect(ticketCountRow?.value).toBe(1);
		expect(messageCountRow?.value).toBe(1);
	});
});
