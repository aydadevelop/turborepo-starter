/**
 * Shared queryFn references and option builders for queries that wrap
 * the auth-client (not oRPC).  Hoisting the functions here avoids
 * re-creating identical closures in every component that shows orgs,
 * invitations, or the full-org payload.
 */
import { queryOptions } from "@tanstack/svelte-query";

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

interface Extra {
	enabled?: boolean;
	retry?: boolean | number;
	staleTime?: number;
}

export const userOrganizationsQueryOptions = (extra?: Extra) =>
	queryOptions({
		queryKey: queryKeys.organizations.all,
		queryFn: fetchUserOrganizations,
		staleTime: 30_000,
		retry: false,
		...extra,
	});

export const userInvitationsQueryOptions = (extra?: Extra) =>
	queryOptions({
		queryKey: queryKeys.invitations.all,
		queryFn: fetchUserInvitations,
		staleTime: 30_000,
		retry: false,
		...extra,
	});

export const fullOrganizationQueryOptions = (extra?: Extra) =>
	queryOptions({
		queryKey: queryKeys.org.full,
		queryFn: fetchFullOrganization,
		staleTime: 30_000,
		...extra,
	});
