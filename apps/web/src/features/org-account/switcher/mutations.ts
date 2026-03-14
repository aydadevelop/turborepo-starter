import { formatOrgAccountError, type MutationResult } from "../shared/errors";

interface SwitchOrganizationDependencies {
	invalidateOrgSwitcher: () => Promise<unknown>;
	setActiveOrganization: (args: {
		organizationId: string;
	}) => Promise<{ error: unknown }>;
}

export async function switchActiveOrganization(
	deps: SwitchOrganizationDependencies,
	organizationId: string,
): Promise<MutationResult<void>> {
	if (!organizationId) {
		return { ok: false, message: "Organization not found. Please try again." };
	}

	const { error } = await deps.setActiveOrganization({ organizationId });
	if (error) {
		return {
			ok: false,
			message: formatOrgAccountError(error, "Failed to switch organization."),
		};
	}

	await deps.invalidateOrgSwitcher();
	return { ok: true, data: undefined };
}
