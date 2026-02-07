import {
	type OrganizationRoleName,
	organizationRoles,
} from "@full-stack-cf-app/auth/organization-access";

export type OrganizationPermission = Parameters<
	(typeof organizationRoles)[OrganizationRoleName]["authorize"]
>[0];

export const hasOrganizationPermission = (
	role: string,
	permission: OrganizationPermission
) => {
	const roleConfig = organizationRoles[role as OrganizationRoleName];

	if (!roleConfig) {
		return false;
	}

	return roleConfig.authorize(permission).success;
};
