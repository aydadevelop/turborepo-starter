import { formatOrgAccountError, type MutationResult } from "../shared/errors";

interface InvitationMutationDependencies {
	acceptInvitation: (args: {
		invitationId: string;
	}) => Promise<{ error: unknown }>;
	invalidateInvitationList: () => Promise<unknown>;
	invalidateInvitationResponse: () => Promise<unknown>;
	rejectInvitation: (args: {
		invitationId: string;
	}) => Promise<{ error: unknown }>;
}

export async function acceptOrganizationInvitation(
	deps: InvitationMutationDependencies,
	invitationId: string
): Promise<MutationResult<void>> {
	if (!invitationId) {
		return { ok: false, message: "Invitation not found. Please try again." };
	}

	const { error } = await deps.acceptInvitation({ invitationId });
	if (error) {
		return {
			ok: false,
			message: formatOrgAccountError(error, "Failed to accept invitation."),
		};
	}

	await deps.invalidateInvitationResponse();
	return { ok: true, data: undefined };
}

export async function rejectOrganizationInvitation(
	deps: InvitationMutationDependencies,
	invitationId: string
): Promise<MutationResult<void>> {
	if (!invitationId) {
		return { ok: false, message: "Invitation not found. Please try again." };
	}

	const { error } = await deps.rejectInvitation({ invitationId });
	if (error) {
		return {
			ok: false,
			message: formatOrgAccountError(error, "Failed to reject invitation."),
		};
	}

	await deps.invalidateInvitationList();
	return { ok: true, data: undefined };
}
