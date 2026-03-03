/**
 * Shared queryFn references and option builders for queries that wrap
 * the auth-client (not oRPC).  Hoisting the functions here avoids
 * re-creating identical closures in every component that shows orgs,
 * invitations, or the full-org payload.
 */
import type { CreateQueryOptions } from "@tanstack/svelte-query";

import { authClient } from "./auth-client";
import { queryKeys } from "./query-keys";

// ── Stable queryFn references ──────────────────────────

export const fetchUserOrganizations = async () => {
	const { data, error } = await authClient.organization.list();
	if (error) {
		throw error;
	}
	return data ?? [];
};

export const fetchUserInvitations = async () => {
	const { data, error } = await authClient.organization.listUserInvitations();
	if (error) {
		throw error;
	}
	return data ?? [];
};

export const fetchFullOrganization = async () => {
	const { data, error } = await authClient.organization.getFullOrganization();
	if (error) {
		throw error;
	}
	return data;
};

// ── Option builders (pass `enabled` from caller) ──────

type Opts<T> = Omit<CreateQueryOptions<T>, "queryKey" | "queryFn"> & {
	enabled?: boolean;
};

export function userOrganizationsQueryOptions(
	extra?: Opts<Awaited<ReturnType<typeof fetchUserOrganizations>>>
) {
	return {
		queryKey: queryKeys.organizations.all,
		queryFn: fetchUserOrganizations,
		staleTime: 30_000,
		retry: false,
		...extra,
	};
}

export function userInvitationsQueryOptions(
	extra?: Opts<Awaited<ReturnType<typeof fetchUserInvitations>>>
) {
	return {
		queryKey: queryKeys.invitations.all,
		queryFn: fetchUserInvitations,
		staleTime: 30_000,
		retry: false,
		...extra,
	};
}

export function fullOrganizationQueryOptions(
	extra?: Opts<Awaited<ReturnType<typeof fetchFullOrganization>>>
) {
	return {
		queryKey: queryKeys.org.full,
		queryFn: fetchFullOrganization,
		staleTime: 30_000,
		...extra,
	};
}
