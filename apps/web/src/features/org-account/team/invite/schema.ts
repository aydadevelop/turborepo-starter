import { z } from "zod";
import { ORG_ROLE_VALUES, type OrgRole } from "../../shared/roles";

export const inviteMemberSchema = z.object({
	email: z.email("Email is required."),
	role: z.enum(ORG_ROLE_VALUES),
});

export type InviteMemberFormValues = z.infer<typeof inviteMemberSchema>;

export type InviteMemberInput = InviteMemberFormValues & {
	organizationId: string;
};

export function getInviteMemberDefaults(): {
	email: string;
	role: OrgRole;
} {
	return {
		email: "",
		role: "agent",
	};
}
