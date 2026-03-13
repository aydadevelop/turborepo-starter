<script lang="ts">
	import { createQuery } from "@tanstack/svelte-query";
	import { resolve } from "$app/paths";
	import SurfaceCard from "../../../components/operator/SurfaceCard.svelte";
	import { orpc } from "$lib/orpc";

	const orgsQuery = createQuery(() =>
		orpc.admin.organizations.listOrgs.queryOptions({ input: { limit: 5 } })
	);
	const usersQuery = createQuery(() =>
		orpc.admin.organizations.listUsers.queryOptions({ input: { limit: 5 } })
	);

	const cards = $derived([
		{
			title: "Organizations",
			value: orgsQuery.data?.total ?? "—",
			href: resolve("/admin/organizations"),
		},
		{
			title: "Users",
			value: usersQuery.data?.total ?? "—",
			href: resolve("/admin/users"),
		},
	]);
</script>

<div class="grid gap-4 sm:grid-cols-2">
	{#each cards as card (card.title)}
		<SurfaceCard title={card.title}>
			{#snippet children()}
				<p class="text-3xl font-semibold">{card.value}</p>
			{/snippet}
			{#snippet action()}
				<a href={card.href} class="text-sm text-primary hover:underline">
					View all &rarr;
				</a>
			{/snippet}
		</SurfaceCard>
	{/each}
</div>
