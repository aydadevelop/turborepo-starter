import type { QueryClient } from "@tanstack/svelte-query";
import { orpc } from "$lib/orpc";
import { queryKeys } from "$lib/query-keys";

export type InvalidationKey = readonly unknown[];

/**
 * Invalidation key registries for common entity groups.
 *
 * When adding a new domain, register its invalidation keys here
 * so mutations can reference entity names instead of raw key arrays.
 */
export const invalidationKeys = {
	/** Organization structure: org root, full org, org list, management check */
	organizationStructure(): InvalidationKey[] {
		return [
			queryKeys.org.root,
			queryKeys.org.full,
			queryKeys.organizations.all,
			orpc.canManageOrganization.key(),
		];
	},

	/** Membership: org structure + invitations */
	membership(): InvalidationKey[] {
		return [...this.organizationStructure(), queryKeys.invitations.all];
	},

	/** Invitation list only */
	invitations(): InvalidationKey[] {
		return [queryKeys.invitations.all];
	},

	/** Full org switcher: org structure + listings, notifications, todos, assistant */
	orgSwitcher(): InvalidationKey[] {
		return [
			...this.organizationStructure(),
			orpc.listing.key(),
			orpc.notifications.key(),
			orpc.todo.key(),
			queryKeys.assistant.root,
		];
	},

	/** Listings: org context + listing data */
	listings(): InvalidationKey[] {
		return [orpc.organization.key(), orpc.listing.key()];
	},
};

/**
 * Invalidate multiple query key groups in parallel.
 */
export async function invalidateQueryKeys(
	queryClient: QueryClient,
	keys: readonly InvalidationKey[],
): Promise<void> {
	await Promise.all(
		keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
	);
}
