import { formatOrgAccountError, type MutationResult } from "../shared/errors";
import {
	type OrganizationSettingsInput,
	organizationSettingsSchema,
} from "./schema";

interface UpdateOrganizationArgs {
	data: {
		name: string;
		slug?: string;
	};
}

interface DeleteOrganizationArgs {
	organizationId?: string;
}

interface UpdateOrganizationDependencies {
	invalidateOrganizationStructure: () => Promise<unknown>;
	updateOrganization: (
		args: UpdateOrganizationArgs,
	) => Promise<{ error: unknown }>;
}

interface DeleteOrganizationDependencies {
	deleteOrganization: (
		args: DeleteOrganizationArgs,
	) => Promise<{ error: unknown }>;
	invalidateOrganizationStructure: () => Promise<unknown>;
}

export async function submitOrganizationSettings(
	deps: UpdateOrganizationDependencies,
	input: OrganizationSettingsInput,
): Promise<MutationResult<void>> {
	const parsed = organizationSettingsSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			message:
				parsed.error.issues[0]?.message ?? "Please correct the form errors.",
		};
	}

	const { error } = await deps.updateOrganization({
		data: {
			name: parsed.data.name,
			slug: parsed.data.slug || undefined,
		},
	});

	if (error) {
		return {
			ok: false,
			message: formatOrgAccountError(error, "Failed to update organization."),
		};
	}

	await deps.invalidateOrganizationStructure();
	return { ok: true, data: undefined };
}

export async function deleteOrganizationRecord(
	deps: DeleteOrganizationDependencies,
	organizationId?: string,
): Promise<MutationResult<void>> {
	if (!organizationId) {
		return { ok: false, message: "Organization not found. Please try again." };
	}

	const { error } = await deps.deleteOrganization({ organizationId });
	if (error) {
		return {
			ok: false,
			message: formatOrgAccountError(error, "Failed to delete organization."),
		};
	}

	await deps.invalidateOrganizationStructure();
	return { ok: true, data: undefined };
}
