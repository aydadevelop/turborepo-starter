import { oc } from "@orpc/contract";
import z from "zod";

const consentTypeSchema = z.enum([
	"service_agreement",
	"user_agreement",
	"privacy_policy",
]);

export const consentContract = {
	status: oc.output(
		z.object({
			consents: z.array(
				z.object({
					consentType: consentTypeSchema,
					consentVersion: z.string(),
					consentedAt: z.coerce.date(),
					isCurrent: z.boolean(),
				}),
			),
			required: z.array(consentTypeSchema),
			missing: z.array(consentTypeSchema),
		}),
	),

	accept: oc
		.input(
			z.object({
				consentTypes: z.array(consentTypeSchema).min(1).max(3),
			}),
		)
		.output(
			z.object({
				accepted: z.array(consentTypeSchema),
			}),
		),
};

export type ConsentType = z.infer<typeof consentTypeSchema>;
