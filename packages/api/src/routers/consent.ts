import { db } from "@full-stack-cf-app/db";
import { userConsent } from "@full-stack-cf-app/db/schema/consent";
import { ORPCError } from "@orpc/server";
import { desc, eq } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../index";

const CURRENT_CONSENT_VERSIONS: Record<string, string> = {
	service_agreement: "2026-02-14",
	user_agreement: "2026-02-14",
	privacy_policy: "2026-02-14",
};

const consentTypeSchema = z.enum([
	"service_agreement",
	"user_agreement",
	"privacy_policy",
]);

export const consentRouter = {
	/** Check which consents the current user has given */
	status: protectedProcedure
		.output(
			z.object({
				consents: z.array(
					z.object({
						consentType: consentTypeSchema,
						consentVersion: z.string(),
						consentedAt: z.date(),
						isCurrent: z.boolean(),
					})
				),
				required: z.array(consentTypeSchema),
				missing: z.array(consentTypeSchema),
			})
		)
		.handler(async ({ context }) => {
			const userId = context.session?.user?.id;
			if (!userId) {
				throw new ORPCError("UNAUTHORIZED");
			}

			const records = await db
				.select({
					consentType: userConsent.consentType,
					consentVersion: userConsent.consentVersion,
					consentedAt: userConsent.consentedAt,
				})
				.from(userConsent)
				.where(eq(userConsent.userId, userId))
				.orderBy(desc(userConsent.consentedAt));

			const latestByType = new Map<
				string,
				{ consentType: string; consentVersion: string; consentedAt: Date }
			>();
			for (const record of records) {
				if (!latestByType.has(record.consentType)) {
					latestByType.set(record.consentType, record);
				}
			}

			const required = ["service_agreement"] as const;

			const consents = [...latestByType.values()].map((c) => ({
				consentType: c.consentType as z.infer<typeof consentTypeSchema>,
				consentVersion: c.consentVersion,
				consentedAt: c.consentedAt,
				isCurrent: c.consentVersion === CURRENT_CONSENT_VERSIONS[c.consentType],
			}));

			const missing = required.filter((type) => {
				const latest = latestByType.get(type);
				return (
					!latest || latest.consentVersion !== CURRENT_CONSENT_VERSIONS[type]
				);
			});

			return {
				consents,
				required: [...required],
				missing: missing as z.infer<typeof consentTypeSchema>[],
			};
		}),

	/** Record user consent */
	accept: protectedProcedure
		.input(
			z.object({
				consentTypes: z.array(consentTypeSchema).min(1).max(3),
			})
		)
		.output(
			z.object({
				accepted: z.array(consentTypeSchema),
			})
		)
		.handler(async ({ context, input }) => {
			const userId = context.session?.user?.id;
			if (!userId) {
				throw new ORPCError("UNAUTHORIZED");
			}

			const now = new Date();

			const rows = input.consentTypes.map((consentType) => ({
				id: crypto.randomUUID(),
				userId,
				consentType,
				consentVersion: CURRENT_CONSENT_VERSIONS[consentType] ?? "2026-02-14",
				consentedAt: now,
				ipAddress: null as string | null,
				userAgent: null as string | null,
			}));

			await db.insert(userConsent).values(rows);

			return {
				accepted: input.consentTypes,
			};
		}),
};
