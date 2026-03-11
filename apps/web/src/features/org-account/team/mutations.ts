import { formatOrgAccountError, type MutationResult } from "../shared/errors";
import { ORG_ROLE_VALUES, type OrgRole } from "../shared/roles";

interface TeamMutationDependencies {
	cancelInvitation: (args: {
		invitationId: string;
	}) => Promise<{ error: unknown }>;
	invalidateMembership: () => Promise<unknown>;
	removeMember: (args: {
		memberIdOrEmail: string;
	}) => Promise<{ error: unknown }>;
	updateMemberRole: (args: {
		memberId: string;
		role: string;
	}) => Promise<{ error: unknown }>;
}

export async function removeOrganizationMember(
	deps: TeamMutationDependencies,
	memberId: string
): Promise<MutationResult<void>> {
	if (!memberId) {
		return { ok: false, message: "Member not found. Please try again." };
	}

	const { error } = await deps.removeMember({ memberIdOrEmail: memberId });
	if (error) {
		return {
			ok: false,
			message: formatOrgAccountError(error, "Failed to remove member."),
		};
	}

	await deps.invalidateMembership();
	return { ok: true, data: undefined };
}

export async function updateOrganizationMemberRole(
	deps: TeamMutationDependencies,
	input: {
		memberId: string;
		role: OrgRole;
	}
): Promise<MutationResult<void>> {
	if (!input.memberId) {
		return { ok: false, message: "Member not found. Please try again." };
	}

	if (!ORG_ROLE_VALUES.includes(input.role)) {
		return { ok: false, message: "Please select a valid role." };
	}

	const { error } = await deps.updateMemberRole({
		memberId: input.memberId,
		role: input.role,
	});

	if (error) {
		return {
			ok: false,
			message: formatOrgAccountError(error, "Failed to change role."),
		};
	}

	await deps.invalidateMembership();
	return { ok: true, data: undefined };
}

export async function cancelOrganizationInvitation(
	deps: TeamMutationDependencies,
	invitationId: string
): Promise<MutationResult<void>> {
	if (!invitationId) {
		return { ok: false, message: "Invitation not found. Please try again." };
	}

	const { error } = await deps.cancelInvitation({ invitationId });
	if (error) {
		return {
			ok: false,
			message: formatOrgAccountError(error, "Failed to cancel invitation."),
		};
	}

	await deps.invalidateMembership();
	return { ok: true, data: undefined };
}
