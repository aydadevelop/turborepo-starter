import type { QueryClient } from "@tanstack/svelte-query";
import { orpc } from "$lib/orpc";
import { queryKeys } from "$lib/query-keys";

export type InvalidationKey = readonly unknown[];

export function getOrganizationStructureInvalidationKeys(): InvalidationKey[] {
	return [
		queryKeys.org.root,
		queryKeys.org.full,
		queryKeys.organizations.all,
		orpc.canManageOrganization.key(),
	];
}

export function getMembershipInvalidationKeys(): InvalidationKey[] {
	return [
		...getOrganizationStructureInvalidationKeys(),
		queryKeys.invitations.all,
	];
}

export function getInvitationListInvalidationKeys(): InvalidationKey[] {
	return [queryKeys.invitations.all];
}

export function getOrgSwitcherInvalidationKeys(): InvalidationKey[] {
	return [
		...getOrganizationStructureInvalidationKeys(),
		orpc.listing.key(),
		orpc.notifications.key(),
		orpc.todo.key(),
		queryKeys.assistant.root,
	];
}

export async function invalidateQueryKeys(
	queryClient: QueryClient,
	keys: readonly InvalidationKey[]
): Promise<void> {
	await Promise.all(
		keys.map((queryKey) => queryClient.invalidateQueries({ queryKey }))
	);
}
