import { invalidationKeys } from "$lib/invalidation";

export {
	type InvalidationKey,
	invalidateQueryKeys,
	invalidationKeys,
} from "$lib/invalidation";

/**
 * @deprecated Use `invalidationKeys.organizationStructure()` from `$lib/invalidation`.
 */
export const getOrganizationStructureInvalidationKeys = () =>
	invalidationKeys.organizationStructure();

/**
 * @deprecated Use `invalidationKeys.membership()` from `$lib/invalidation`.
 */
export const getMembershipInvalidationKeys = () =>
	invalidationKeys.membership();

/**
 * @deprecated Use `invalidationKeys.invitations()` from `$lib/invalidation`.
 */
export const getInvitationListInvalidationKeys = () =>
	invalidationKeys.invitations();

/**
 * @deprecated Use `invalidationKeys.orgSwitcher()` from `$lib/invalidation`.
 */
export const getOrgSwitcherInvalidationKeys = () =>
	invalidationKeys.orgSwitcher();
