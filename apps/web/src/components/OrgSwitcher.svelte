<script lang="ts">
	import {
		Content as SelectContent,
		Item as SelectItem,
		Root as SelectRoot,
		Trigger as SelectTrigger,
	} from "@my-app/ui/components/select";
	import { createQuery } from "@tanstack/svelte-query";
	import { resolve } from "$app/paths";
	import { authClient } from "$lib/auth-client";
	import { hasAuthenticatedSession } from "$lib/auth-session";
	import { orpc, queryClient } from "$lib/orpc";
	import { queryKeys } from "$lib/query-keys";
	import { userOrganizationsQueryOptions } from "$lib/query-options";

	const sessionQuery = authClient.useSession();

	const orgsQuery = createQuery(() =>
		userOrganizationsQueryOptions({
			enabled: hasAuthenticatedSession($sessionQuery.data),
		})
	);

	const activeOrgId = $derived(
		($sessionQuery.data?.session as { activeOrganizationId?: string })
			?.activeOrganizationId ?? undefined
	);

	let switching = $state(false);

	const handleSwitch = async (orgId: string | undefined) => {
		if (!orgId || orgId === activeOrgId) return;
		switching = true;
		const { error } = await authClient.organization.setActive({
			organizationId: orgId,
		});
		switching = false;
		if (error) return;
		queryClient.invalidateQueries({ queryKey: queryKeys.org.root });
		queryClient.invalidateQueries({
			queryKey: orpc.canManageOrganization.key(),
		});
		queryClient.invalidateQueries({ queryKey: orpc.listing.key() });
		queryClient.invalidateQueries({ queryKey: orpc.notifications.key() });
		queryClient.invalidateQueries({ queryKey: orpc.todo.key() });
		queryClient.invalidateQueries({ queryKey: queryKeys.assistant.root });
	};
</script>

{#if (orgsQuery.data?.length ?? 0) > 1}
	<SelectRoot
		type="single"
		value={activeOrgId}
		onValueChange={(v) => void handleSwitch(v)}
		disabled={switching}
	>
		<SelectTrigger
			size="sm"
			class="max-w-[180px]"
			data-testid="org-switcher-trigger"
		>
			{#if switching}
				<span class="text-muted-foreground">Switching...</span>
			{:else}
				{orgsQuery.data?.find((o) => o.id === activeOrgId)?.name ??
					"Select org"}
			{/if}
		</SelectTrigger>
		<SelectContent>
			{#each orgsQuery.data ?? [] as org (org.id)}
				<SelectItem value={org.id} label={org.name} />
			{/each}
		</SelectContent>
	</SelectRoot>
{:else if (orgsQuery.data?.length ?? 0) === 1}
	<span class="text-xs text-muted-foreground hidden sm:inline">
		{orgsQuery.data?.[0]?.name}
	</span>
{/if}
