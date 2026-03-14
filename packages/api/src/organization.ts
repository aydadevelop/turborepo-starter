import {
	type OrganizationRoleName,
	organizationRoles,
} from "@my-app/auth/organization-access";

export type OrganizationPermission = Parameters<
	(typeof organizationRoles)[OrganizationRoleName]["authorize"]
>[0];

export const hasOrganizationPermission = (
	role: string,
	permission: OrganizationPermission,
): boolean => {
	const roleConfig = organizationRoles[role as OrganizationRoleName];

	if (!roleConfig) {
		return false;
	}

	// Cast breaks the union type loop that TS2590 triggers during declaration emit
	const authorize = roleConfig.authorize as unknown as (
		p: OrganizationPermission,
	) => { success: boolean };
	return authorize(permission).success;
};
