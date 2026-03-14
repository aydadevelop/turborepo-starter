import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/organization/access";

export const organizationStatements = {
	...defaultStatements,
	task: ["create", "read", "update", "delete"],
	payment: ["create", "read", "update", "delete"],
	support: ["create", "read", "update", "delete"],
	intake: ["create", "read", "update", "delete"],
	notification: ["create", "read", "update", "delete"],
	listing: ["create", "read", "update", "delete"],
	availability: ["create", "read", "update", "delete"],
	pricing: ["create", "read", "update", "delete"],
	booking: ["create", "read", "update", "delete"],
} as const;

export const organizationAccessControl = createAccessControl(
	organizationStatements,
);

export const orgOwnerAc = organizationAccessControl.newRole({
	organization: ["update", "delete"],
	member: ["create", "update", "delete"],
	invitation: ["create", "cancel"],
	team: ["create", "update", "delete"],
	ac: ["create", "read", "update", "delete"],
	task: ["create", "read", "update", "delete"],
	payment: ["create", "read", "update", "delete"],
	support: ["create", "read", "update", "delete"],
	intake: ["create", "read", "update", "delete"],
	notification: ["create", "read", "update", "delete"],
	listing: ["create", "read", "update", "delete"],
	availability: ["create", "read", "update", "delete"],
	pricing: ["create", "read", "update", "delete"],
	booking: ["create", "read", "update", "delete"],
});

export const orgAdminAc = organizationAccessControl.newRole({
	organization: ["update"],
	member: ["create", "update", "delete"],
	invitation: ["create", "cancel"],
	team: ["create", "update", "delete"],
	ac: ["read"],
	task: ["create", "read", "update", "delete"],
	payment: ["create", "read", "update", "delete"],
	support: ["create", "read", "update", "delete"],
	intake: ["create", "read", "update", "delete"],
	notification: ["create", "read", "update", "delete"],
	listing: ["create", "read", "update", "delete"],
	availability: ["create", "read", "update", "delete"],
	pricing: ["create", "read", "update", "delete"],
	booking: ["create", "read", "update", "delete"],
});

export const managerAc = organizationAccessControl.newRole({
	organization: ["update"],
	member: ["create", "update"],
	invitation: ["create", "cancel"],
	team: ["create", "update"],
	ac: ["read"],
	task: ["create", "read", "update"],
	payment: ["create", "read", "update"],
	support: ["create", "read", "update"],
	intake: ["create", "read", "update"],
	notification: ["create", "read", "update"],
	listing: ["create", "read", "update"],
	availability: ["create", "read", "update"],
	pricing: ["create", "read", "update"],
	booking: ["create", "read", "update", "delete"],
});

export const agentAc = organizationAccessControl.newRole({
	organization: [],
	member: [],
	invitation: ["create"],
	team: [],
	ac: ["read"],
	task: ["create", "read"],
	payment: ["read"],
	support: ["create", "read", "update"],
	intake: ["create", "read"],
	notification: ["create", "read"],
	listing: ["read"],
	availability: ["read"],
	pricing: ["read"],
	booking: ["read"],
});

export const memberAc = organizationAccessControl.newRole({
	organization: [],
	member: [],
	invitation: [],
	team: [],
	ac: ["read"],
	task: ["create", "read"],
	payment: ["read"],
	support: ["read"],
	intake: ["read"],
	notification: ["read"],
	listing: ["read"],
	availability: ["read"],
	pricing: ["read"],
	booking: ["read"],
});

export const customerAc = organizationAccessControl.newRole({
	organization: [],
	member: [],
	invitation: [],
	team: [],
	ac: ["read"],
	task: [],
	payment: [],
	support: ["read"],
	intake: [],
	notification: [],
	listing: [],
	availability: [],
	pricing: [],
	booking: [],
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
