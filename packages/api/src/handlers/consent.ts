import type { ConsentType } from "@my-app/api-contract/routers/consent";
import { db } from "@my-app/db";
import { userConsent } from "@my-app/db/schema/consent";
import { ORPCError } from "@orpc/server";
import { desc, eq } from "drizzle-orm";

import { protectedProcedure } from "../index";

const CURRENT_CONSENT_VERSIONS: Record<ConsentType, string> = {
	service_agreement: "2026-02-14",
	user_agreement: "2026-02-14",
	privacy_policy: "2026-02-14",
};

export const consentRouter = {
	status: protectedProcedure.consent.status.handler(async ({ context }) => {
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
			ConsentType,
			{ consentType: ConsentType; consentVersion: string; consentedAt: Date }
		>();
		for (const record of records) {
			const consentType = record.consentType as ConsentType;
			if (!latestByType.has(consentType)) {
				latestByType.set(consentType, {
					consentType,
					consentVersion: record.consentVersion,
					consentedAt: record.consentedAt,
				});
			}
		}

		const required: ConsentType[] = ["service_agreement"];

		const consents = [...latestByType.values()].map((c) => ({
			consentType: c.consentType,
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
			required,
			missing,
		};
	}),

	accept: protectedProcedure.consent.accept.handler(
		async ({ context, input }) => {
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
		},
	),
};
