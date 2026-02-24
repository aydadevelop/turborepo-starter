<script lang="ts">
	import { createQuery } from "@tanstack/svelte-query";
	import { derived } from "svelte/store";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { authClient } from "$lib/auth-client";
	import { hasAuthenticatedSession } from "$lib/auth-session";

	const sessionQuery = authClient.useSession();

	const orgsQueryOptions = derived(sessionQuery, ($session) => ({
		queryKey: ["user-organizations"],
		queryFn: async () => {
			const { data } = await authClient.organization.list();
			return data ?? [];
		},
		enabled: hasAuthenticatedSession($session.data),
	}));
	const orgsQuery = createQuery(orgsQueryOptions);

	const invitationsQueryOptions = derived(sessionQuery, ($session) => ({
		queryKey: ["user-invitations"],
		queryFn: async () => {
			const { data } = await authClient.organization.listUserInvitations();
			return data ?? [];
		},
		enabled: hasAuthenticatedSession($session.data),
	}));
	const invitationsQuery = createQuery(invitationsQueryOptions);

	const isLoading = $derived(
		$sessionQuery.isPending ||
			$orgsQuery.isPending ||
			$invitationsQuery.isPending
	);

	$effect(() => {
		if (isLoading) return;
		if (!hasAuthenticatedSession($sessionQuery.data)) return; // parent layout handles login redirect

		const hasPendingInvites = ($invitationsQuery.data ?? []).some(
			(inv) => inv.status === "pending"
		);
		const hasOrg = ($orgsQuery.data?.length ?? 0) > 0;

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
