import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/organization/access";

export const organizationStatements = {
	...defaultStatements,
	boat: ["create", "read", "update", "delete"],
} as const;

export const organizationAccessControl = createAccessControl(
	organizationStatements
);

export const orgOwnerAc = organizationAccessControl.newRole({
	organization: ["update", "delete"],
	member: ["create", "update", "delete"],
	invitation: ["create", "cancel"],
	team: ["create", "update", "delete"],
	ac: ["create", "read", "update", "delete"],
	boat: ["create", "read", "update", "delete"],
});

export const orgAdminAc = organizationAccessControl.newRole({
	organization: ["update"],
	member: ["create", "update", "delete"],
	invitation: ["create", "cancel"],
	team: ["create", "update", "delete"],
	ac: ["read"],
	boat: ["create", "read", "update", "delete"],
});

export const managerAc = organizationAccessControl.newRole({
	organization: ["update"],
	member: ["create", "update"],
	invitation: ["create", "cancel"],
	team: ["create", "update"],
	ac: ["read"],
	boat: ["create", "read", "update"],
});

export const agentAc = organizationAccessControl.newRole({
	organization: [],
	member: [],
	invitation: ["create"],
	team: [],
	ac: ["read"],
	boat: ["read"],
});

export const memberAc = organizationAccessControl.newRole({
	organization: [],
	member: [],
	invitation: [],
	team: [],
	ac: ["read"],
	boat: ["read"],
});

export const customerAc = organizationAccessControl.newRole({
	organization: [],
	member: [],
	invitation: [],
	team: [],
	ac: ["read"],
	boat: ["read"],
});

export const organizationRoles = {
	org_owner: orgOwnerAc,
	org_admin: orgAdminAc,
	owner: orgOwnerAc,
	admin: orgAdminAc,
	member: memberAc,
	manager: managerAc,
	agent: agentAc,
	customer: customerAc,
};

export type OrganizationRoleName = keyof typeof organizationRoles;
