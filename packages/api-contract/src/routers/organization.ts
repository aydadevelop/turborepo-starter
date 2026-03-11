import { oc } from "@orpc/contract";
import z from "zod";

const onboardingStatusOutputSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	paymentConfigured: z.boolean(),
	calendarConnected: z.boolean(),
	listingPublished: z.boolean(),
	isComplete: z.boolean(),
	completedAt: z.string().datetime().nullable(),
	lastRecalculatedAt: z.string().datetime(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

export const organizationContract = {
	getOnboardingStatus: oc
		.route({
			tags: ["Organization"],
			summary: "Get persisted onboarding readiness for the active organization",
		})
		.input(z.object({}))
		.output(onboardingStatusOutputSchema),
};
