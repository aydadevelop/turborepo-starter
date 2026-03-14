import {
	formatOrgAccountError,
	type MutationResult,
} from "../../shared/errors";
import { type InviteMemberInput, inviteMemberSchema } from "./schema";

interface InviteMemberDependencies {
	invalidateMembership: () => Promise<unknown>;
	inviteMember: (args: {
		email: string;
		role: string;
		organizationId: string;
	}) => Promise<{ error: unknown }>;
}

export async function submitInviteMember(
	deps: InviteMemberDependencies,
	input: InviteMemberInput,
): Promise<MutationResult<{ message: string }>> {
	const parsed = inviteMemberSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			message:
				parsed.error.issues[0]?.message ?? "Please correct the form errors.",
		};
	}

	const organizationId = input.organizationId.trim();
	if (!organizationId) {
		return { ok: false, message: "Organization not found. Please try again." };
	}

	const { error } = await deps.inviteMember({
		email: parsed.data.email,
		role: parsed.data.role,
		organizationId,
	});

	if (error) {
		return {
			ok: false,
			message: formatOrgAccountError(error, "Failed to send invitation."),
		};
	}

	await deps.invalidateMembership();
	return {
		ok: true,
		data: {
			message: `Invitation sent to ${parsed.data.email} as ${parsed.data.role}.`,
		},
	};
}
