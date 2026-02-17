<script lang="ts">
	import { createQuery } from "@tanstack/svelte-query";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { authClient } from "$lib/auth-client";
	import { orpc } from "$lib/orpc";

	const { children } = $props();
	const sessionQuery = authClient.useSession();

	const canManageQuery = createQuery({
		...orpc.canManageOrganization.queryOptions(),
		retry: false,
	});

	$effect(() => {
		if ($sessionQuery.isPending || $canManageQuery.isPending) return;
		if (!$sessionQuery.data) {
			goto(resolve("/login"));
			return;
		}
		if (!$canManageQuery.data?.canManageOrganization) {
			goto(resolve("/dashboard"));
		}
	});

	const orgRole = $derived($canManageQuery.data?.role ?? "");

	const navItems = [
		{ href: resolve("/org/team"), label: "Team" },
		{ href: resolve("/org/team/invite"), label: "Invite" },
	];

	const isActive = (href: string) => {
		if (href === resolve("/org/team"))
			return page.url.pathname === resolve("/org/team");
		return page.url.pathname.startsWith(href);
	};
</script>

{#if $sessionQuery.isPending || $canManageQuery.isPending}
	<div class="flex items-center justify-center min-h-[50vh]">
		<p class="text-muted-foreground">Loading...</p>
	</div>
{:else if !$canManageQuery.data?.canManageOrganization}
	<div class="flex items-center justify-center min-h-[50vh]">
		<p class="text-muted-foreground">Access denied</p>
	</div>
{:else}
	<div class="mx-auto max-w-4xl px-6 py-6">
		<div class="mb-6">
			<h1 class="text-2xl font-bold">Organization</h1>
			<p class="text-sm text-muted-foreground">
				Manage your team &middot; Role: {orgRole}
			</p>
			<nav class="mt-3 flex gap-1 border-b">
				{#each navItems as item (item.href)}<a
					href={item.href}
					class="whitespace-nowrap px-3 py-2 text-sm transition
							{isActive(item.href)
							? 'border-b-2 border-primary font-medium text-foreground'
							: 'text-muted-foreground hover:text-foreground'}"
				>
					{item.label}
				</a>{/each}
			</nav>
		</div>
		{@render children()}
	</div>
{/if}
