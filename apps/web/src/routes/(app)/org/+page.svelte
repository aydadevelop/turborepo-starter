<script lang="ts">
	import { createQuery } from "@tanstack/svelte-query";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { authClient } from "$lib/auth-client";
	import {
		getPageInitialSessionData,
		hasAuthenticatedSession,
		isSessionPending,
		resolveSessionData,
	} from "$lib/auth-session";
	import {
		userInvitationsQueryOptions,
		userOrganizationsQueryOptions,
	} from "$lib/query-options";

	const sessionQuery = authClient.useSession();
	const initialSession = $derived(getPageInitialSessionData(page.data));
	const sessionData = $derived(
		resolveSessionData($sessionQuery, initialSession),
	);
	const sessionPending = $derived(
		isSessionPending($sessionQuery, initialSession),
	);

	const orgsQuery = createQuery(() =>
		userOrganizationsQueryOptions({
			enabled: hasAuthenticatedSession(sessionData),
		}),
	);

	const invitationsQuery = createQuery(() =>
		userInvitationsQueryOptions({
			enabled: hasAuthenticatedSession(sessionData),
		}),
	);

	const isLoading = $derived(
		sessionPending || orgsQuery.isPending || invitationsQuery.isPending,
	);

	$effect(() => {
		if (isLoading) return;
		if (!hasAuthenticatedSession(sessionData)) return; // parent layout handles login redirect

		const hasPendingInvites = (invitationsQuery.data ?? []).some(
			(inv) => inv.status === "pending",
		);
		const hasOrg = (orgsQuery.data?.length ?? 0) > 0;

		if (hasOrg) {
			goto(resolve("/org/team"), { replaceState: true });
		} else if (hasPendingInvites) {
			goto(resolve("/org/invitations"), { replaceState: true });
		} else {
			goto(resolve("/org/create"), { replaceState: true });
		}
	});
</script>

<div class="flex items-center justify-center min-h-[30vh]">
	<p class="text-muted-foreground">Loading...</p>
</div>
