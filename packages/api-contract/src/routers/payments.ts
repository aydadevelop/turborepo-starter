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
};
