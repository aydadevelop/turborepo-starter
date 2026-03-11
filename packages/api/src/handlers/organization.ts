import { getOrganizationOnboardingStatus } from "../services/organization-onboarding";
import { db } from "@my-app/db";
import { organizationPermissionProcedure } from "../index";

export const organizationRouter = {
	getOnboardingStatus: organizationPermissionProcedure({
		organization: ["update"],
	}).organization.getOnboardingStatus.handler(async ({ context }) => {
		const row = await getOrganizationOnboardingStatus(
			context.activeMembership.organizationId,
			db,
		);

		return {
			...row,
			completedAt: row.completedAt?.toISOString() ?? null,
			lastRecalculatedAt: row.lastRecalculatedAt.toISOString(),
			createdAt: row.createdAt.toISOString(),
			updatedAt: row.updatedAt.toISOString(),
		};
	}),
};
