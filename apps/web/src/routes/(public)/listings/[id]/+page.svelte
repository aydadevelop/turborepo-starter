<script lang="ts">
	import { createQuery } from "@tanstack/svelte-query";
	import { page } from "$app/state";
	import { orpc } from "$lib/orpc";

	const listingQuery = createQuery(() => ({
		...orpc.storefront.get.queryOptions({ input: { id: page.params.id ?? "" } }),
	}));
</script>

<svelte:head>
	<title>{listingQuery.data?.name ?? "Listing"}</title>
</svelte:head>

<div class="mx-auto max-w-4xl px-4 py-8">
	<a href="/listings" class="mb-6 inline-block text-sm text-blue-600 hover:underline">
		← Back to listings
	</a>

	{#if listingQuery.isPending}
		<div class="animate-pulse">
			<div class="mb-4 h-8 w-2/3 rounded bg-gray-200"></div>
			<div class="mb-2 h-4 w-1/4 rounded bg-gray-100"></div>
			<div class="h-24 w-full rounded bg-gray-100"></div>
		</div>
	{:else if listingQuery.isError}
		<p class="text-red-600">Listing not found or unavailable.</p>
	{:else if listingQuery.data}
		{@const listing = listingQuery.data}

		{#if listing.primaryImageKey}
			<img
				src="/assets/{listing.primaryImageKey}"
				alt={listing.name}
				class="mb-6 h-64 w-full rounded-lg object-cover"
			/>
		{/if}

		<span class="mb-2 inline-block rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
			{listing.listingTypeSlug}
		</span>

		<h1 class="mb-4 text-3xl font-bold">{listing.name}</h1>

		{#if listing.description}
			<p class="mb-6 text-gray-700">{listing.description}</p>
		{/if}

		{#if listing.metadata}
			<div class="rounded-lg bg-gray-50 p-4">
				<h2 class="mb-2 text-sm font-semibold text-gray-600">Details</h2>
				<pre class="overflow-x-auto text-xs text-gray-700">{JSON.stringify(listing.metadata, null, 2)}</pre>
			</div>
		{/if}
	{/if}
</div>
