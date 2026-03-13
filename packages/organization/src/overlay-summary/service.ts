import { db as defaultDb } from "@my-app/db";

import { getOrganizationOnboardingStatus } from "../onboarding/service";
import { resolveOrganizationDistributionSummary, resolveOrganizationPublishingSummary } from "../publishing/repository";
import { resolveOrganizationManualOverrideSummary } from "../overrides/repository";
import { resolveOrganizationModerationSummary } from "../moderation/repository";
import { resolveOrganizationBlockerSummary } from "./repository";
import type { Db, OrganizationOverlaySummary } from "../types";

export const getOrganizationOverlaySummary = async (
	organizationId: string,
	db: Db = defaultDb
): Promise<OrganizationOverlaySummary> => {
	const [onboarding, publishing, moderation, distribution, blockers, manualOverrides] = await Promise.all([
		getOrganizationOnboardingStatus(organizationId, db),
		resolveOrganizationPublishingSummary(organizationId, db),
		resolveOrganizationModerationSummary(organizationId, db),
		resolveOrganizationDistributionSummary(organizationId, db),
		resolveOrganizationBlockerSummary(organizationId, db),
		resolveOrganizationManualOverrideSummary(organizationId, db),
	]);

	return {
		blockers,
		distribution,
		manualOverrides,
		moderation,
		onboarding,
		publishing,
	};
};
