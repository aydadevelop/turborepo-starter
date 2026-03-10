import { oc } from "@orpc/contract";
import z from "zod";

const providerOutputSchema = z.object({
	provider: z.string(),
	configured: z.boolean(),
	supportedWebhookTypes: z.array(z.string()),
});

const createMockChargeInputSchema = z.object({
	amountCents: z.number().int().positive().max(10_000_000),
	currency: z.string().trim().min(3).max(8).default("USD"),
	description: z.string().trim().min(1).max(200),
});

const createMockChargeOutputSchema = z.object({
	eventIdempotencyKey: z.string(),
	queued: z.boolean(),
});

const orgPaymentConfigOutputSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	providerConfigId: z.string(),
	provider: z.string(),
	isActive: z.boolean(),
	publicKey: z.string().nullable(),
	webhookEndpointId: z.string(),
	validationStatus: z.string(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

const connectProviderInputSchema = z.object({
	providerConfigId: z.string().trim().min(1),
	provider: z.enum(["cloudpayments", "stripe"]),
	publicKey: z.string().trim().optional(),
	encryptedCredentials: z.string().trim().min(1),
});

const receiveWebhookInputSchema = z.object({
	endpointId: z.string().trim().min(1),
	webhookType: z.string().trim().min(1),
	payload: z.record(z.string(), z.unknown()),
});

const receiveWebhookOutputSchema = z.object({
	processed: z.boolean(),
	idempotent: z.boolean(),
	bookingId: z.string().nullable(),
});

export const paymentsContract = {
	providers: oc
		.route({
			tags: ["Payments"],
			summary: "List payment providers",
			description:
				"Returns configured payment webhook providers and supported webhook types.",
		})
		.output(z.array(providerOutputSchema)),

	createMockChargeNotification: oc
		.route({
			tags: ["Payments"],
			summary: "Emit mock charge notification",
			description:
				"Creates a notification event that simulates a successful charge for SaaS testing flows.",
		})
		.input(createMockChargeInputSchema)
		.output(createMockChargeOutputSchema),

	connectProvider: oc
		.route({
			tags: ["Payments"],
			summary: "Connect or update payment provider for the active org",
			description:
				"Upserts the organization payment config. Generates a webhook endpoint ID on first connect.",
		})
		.input(connectProviderInputSchema)
		.output(orgPaymentConfigOutputSchema),

	getOrgConfig: oc
		.route({
			tags: ["Payments"],
			summary: "Get the active org payment config",
		})
		.output(orgPaymentConfigOutputSchema.nullable()),

	receiveWebhook: oc
		.route({
			tags: ["Payments"],
			summary: "Receive and reconcile a payment provider webhook",
			description:
				"Idempotent. Verifies endpoint, deduplicates by TransactionId, and reconciles booking payment status.",
		})
		.input(receiveWebhookInputSchema)
		.output(receiveWebhookOutputSchema),
};
