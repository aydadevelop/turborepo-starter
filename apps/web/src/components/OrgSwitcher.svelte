<script lang="ts">
	import {
		Content as SelectContent,
		Item as SelectItem,
		Root as SelectRoot,
		Trigger as SelectTrigger,
	} from "@my-app/ui/components/select";
	import { createMutation, createQuery } from "@tanstack/svelte-query";
	import { authClient } from "$lib/auth-client";
	import {
		hasAuthenticatedSession,
		resolveSessionData,
		type AuthSessionData,
	} from "$lib/auth-session";
	import { queryClient } from "$lib/orpc";
	import { userOrganizationsQueryOptions } from "$lib/query-options";
	import {
		getOrgSwitcherInvalidationKeys,
		invalidateQueryKeys,
	} from "../features/org-account/shared/invalidations";
	import { switchActiveOrganization } from "../features/org-account/switcher/mutations";

	let {
		sessionQuery,
		initialSession = undefined,
	}: {
		sessionQuery: ReturnType<typeof authClient.useSession>;
		initialSession?: AuthSessionData | null;
	} = $props();

	const sessionData = $derived(
		resolveSessionData($sessionQuery, initialSession),
	);

	const orgsQuery = createQuery(() =>
		userOrganizationsQueryOptions({
			enabled: hasAuthenticatedSession(sessionData),
		}),
	);

	const activeOrgId = $derived(
		(sessionData?.session as { activeOrganizationId?: string } | undefined)
			?.activeOrganizationId ?? undefined,
	);

	const switchOrganization = createMutation(() => ({
		mutationFn: async ({ organizationId }: { organizationId: string }) => {
			const result = await switchActiveOrganization(
				{
					setActiveOrganization: authClient.organization.setActive,
					invalidateOrgSwitcher: () =>
						invalidateQueryKeys(
							queryClient,
							getOrgSwitcherInvalidationKeys(),
						),
				},
				organizationId,
			);

			if (!result.ok) {
				throw new Error(result.message);
			}
		},
	}));
</script>

{#if (orgsQuery.data?.length ?? 0) > 1}
	<SelectRoot
		type="single"
		value={activeOrgId}
		onValueChange={(organizationId) => {
			if (!organizationId || organizationId === activeOrgId) return;
			switchOrganization.mutate({ organizationId });
		}}
		disabled={switchOrganization.isPending}
	>
		<SelectTrigger
			size="sm"
			class="max-w-[180px]"
			data-testid="org-switcher-trigger"
		>
			{#if switchOrganization.isPending}
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
