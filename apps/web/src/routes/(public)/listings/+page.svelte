<script lang="ts">
	import { createQuery } from "@tanstack/svelte-query";
	import { page } from "$app/state";
	import { orpc } from "$lib/orpc";

	let typeFilter = $state(page.url.searchParams.get("type") ?? "");
	let keyword = $state(page.url.searchParams.get("q") ?? "");

	const listingsQuery = createQuery(() => ({
		...orpc.storefront.list.queryOptions({
			input: {
				type: page.url.searchParams.get("type") ?? undefined,
				q: page.url.searchParams.get("q") ?? undefined,
			},
		}),
	}));

	function updateUrl() {
		const params = new URLSearchParams();
		if (typeFilter) params.set("type", typeFilter);
		if (keyword) params.set("q", keyword);
		const search = params.toString();
		const url = search ? `?${search}` : page.url.pathname;
		history.pushState({}, "", url);
		// Force reactivity by dispatching a popstate event — TanStack Query picks
		// up new params on next render cycle
		window.dispatchEvent(new PopStateEvent("popstate"));
	}
</script>

<svelte:head>
	<title>Browse Listings</title>
</svelte:head>

<div class="mx-auto max-w-6xl px-4 py-8">
	<h1 class="mb-6 text-3xl font-bold">Browse Listings</h1>

	<!-- Filters -->
	<div class="mb-6 flex gap-3">
		<input
			type="text"
			placeholder="Search by name..."
			bind:value={keyword}
			oninput={updateUrl}
			class="rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
		/>
		<input
			type="text"
			placeholder="Type slug..."
			bind:value={typeFilter}
			oninput={updateUrl}
			class="rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
		/>
	</div>

	{#if listingsQuery.isPending}
		<!-- Loading skeleton -->
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
			{#each { length: 3 } as _}
				<div class="animate-pulse rounded-lg border p-4">
					<div class="mb-2 h-4 w-3/4 rounded bg-gray-200"></div>
					<div class="mb-1 h-3 w-1/2 rounded bg-gray-100"></div>
					<div class="h-3 w-full rounded bg-gray-100"></div>
				</div>
			{/each}
		</div>
	{:else if listingsQuery.isError}
		<p class="text-red-600">Failed to load listings. Please try again.</p>
	{:else if listingsQuery.data?.items.length === 0}
		<p class="text-gray-500">No listings found.</p>
	{:else}
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
			{#each listingsQuery.data?.items ?? [] as item (item.id)}
				<a
					href="/listings/{item.id}"
					class="block rounded-lg border p-4 transition-shadow hover:shadow-md"
				>
						{#if item.primaryImageUrl}
							<img
								src={item.primaryImageUrl}
								alt={item.name}
								class="mb-3 h-40 w-full rounded object-cover"
							/>
					{/if}
					<span class="mb-1 inline-block rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
						{item.listingTypeSlug}
					</span>
					<h2 class="text-lg font-semibold">{item.name}</h2>
					{#if item.description}
						<p class="mt-1 text-sm text-gray-600">
							{item.description.length > 150
								? item.description.slice(0, 150) + "…"
								: item.description}
						</p>
					{/if}
				</a>
			{/each}
		</div>
		<p class="mt-4 text-sm text-gray-500">
			{listingsQuery.data?.total ?? 0} listing{listingsQuery.data?.total === 1 ? "" : "s"} found
		</p>
	{/if}
</div>
