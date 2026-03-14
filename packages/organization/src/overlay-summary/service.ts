import { db as defaultDb } from "@my-app/db";
import { resolveOrganizationModerationSummary } from "../moderation/repository";
import { getOrganizationOnboardingStatus } from "../onboarding/service";
import { resolveOrganizationManualOverrideSummary } from "../overrides/repository";
import {
	resolveOrganizationDistributionSummary,
	resolveOrganizationPublishingSummary,
} from "../publishing/repository";
import type { Db, OrganizationOverlaySummary } from "../types";
import { resolveOrganizationBlockerSummary } from "./repository";

export const getOrganizationOverlaySummary = async (
	organizationId: string,
	db: Db = defaultDb,
): Promise<OrganizationOverlaySummary> => {
	const [
		onboarding,
		publishing,
		moderation,
		distribution,
		blockers,
		manualOverrides,
	] = await Promise.all([
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
