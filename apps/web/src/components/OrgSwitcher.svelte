<script lang="ts">
	import {
		Content as SelectContent,
		Item as SelectItem,
		Root as SelectRoot,
		Trigger as SelectTrigger,
	} from "@my-app/ui/components/select";
	import { createQuery } from "@tanstack/svelte-query";
	import { derived } from "svelte/store";
	import { authClient } from "$lib/auth-client";
	import { hasAuthenticatedSession } from "$lib/auth-session";
	import { queryClient } from "$lib/orpc";

	const sessionQuery = authClient.useSession();

	const orgsQueryOptions = derived(sessionQuery, ($session) => ({
		queryKey: ["user-organizations"],
		queryFn: async () => {
			const { data, error } = await authClient.organization.list();
			if (error) throw error;
			return data ?? [];
		},
		retry: false,
		enabled: hasAuthenticatedSession($session.data),
	}));
	const orgsQuery = createQuery(orgsQueryOptions);

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
		queryClient.invalidateQueries({ queryKey: ["organization"] });
		queryClient.invalidateQueries({ queryKey: ["canManageOrganization"] });
		queryClient.invalidateQueries({ queryKey: ["notifications"] });
		queryClient.invalidateQueries({ queryKey: ["todos"] });
		queryClient.invalidateQueries({ queryKey: ["assistant"] });
	};
</script>

{#if ($orgsQuery.data?.length ?? 0) > 1}
	<SelectRoot
		type="single"
		value={activeOrgId}
		onValueChange={(v) => void handleSwitch(v)}
		disabled={switching}
	>
		<SelectTrigger size="sm" class="max-w-[180px]">
			{#if switching}
				<span class="text-muted-foreground">Switching...</span>
			{:else}
				{$orgsQuery.data?.find((o) => o.id === activeOrgId)?.name ??
					"Select org"}
			{/if}
		</SelectTrigger>
		<SelectContent>
			{#each $orgsQuery.data ?? [] as org (org.id)}
				<SelectItem value={org.id} label={org.name} />
			{/each}
		</SelectContent>
	</SelectRoot>
{:else if ($orgsQuery.data?.length ?? 0) === 1}
	<span class="text-xs text-muted-foreground hidden sm:inline">
		{$orgsQuery.data?.[0]?.name}
	</span>
{/if}
