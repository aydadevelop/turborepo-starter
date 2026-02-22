import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/organization/access";

export const organizationStatements = {
	...defaultStatements,
	task: ["create", "read", "update", "delete"],
	payment: ["create", "read", "update", "delete"],
	support: ["create", "read", "update", "delete"],
	intake: ["create", "read", "update", "delete"],
	notification: ["create", "read", "update", "delete"],
	yt_feed: ["create", "read", "update", "delete"],
	yt_video: ["create", "read", "update", "delete"],
	yt_signal: ["create", "read", "update", "delete"],
	yt_cluster: ["create", "read", "update", "delete"],
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
	task: ["create", "read", "update", "delete"],
	payment: ["create", "read", "update", "delete"],
	support: ["create", "read", "update", "delete"],
	intake: ["create", "read", "update", "delete"],
	notification: ["create", "read", "update", "delete"],
	yt_feed: ["create", "read", "update", "delete"],
	yt_video: ["create", "read", "update", "delete"],
	yt_signal: ["create", "read", "update", "delete"],
	yt_cluster: ["create", "read", "update", "delete"],
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
	yt_feed: ["create", "read", "update", "delete"],
	yt_video: ["create", "read", "update", "delete"],
	yt_signal: ["create", "read", "update", "delete"],
	yt_cluster: ["create", "read", "update", "delete"],
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
	yt_feed: ["create", "read", "update"],
	yt_video: ["create", "read", "update"],
	yt_signal: ["read"],
	yt_cluster: ["create", "read", "update"],
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
	yt_feed: ["read"],
	yt_video: ["create", "read"],
	yt_signal: ["read"],
	yt_cluster: ["read"],
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
	yt_feed: ["read"],
	yt_video: ["read"],
	yt_signal: ["read"],
	yt_cluster: ["read"],
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
	yt_feed: [],
	yt_video: [],
	yt_signal: [],
	yt_cluster: [],
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
