<script lang="ts">
	import * as Card from "@my-app/ui/components/card";
	import BookingRequestPanel from "../../../../components/public/BookingRequestPanel.svelte";
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
		<div class="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
			<div class="animate-pulse space-y-4">
				<div class="h-8 w-2/3 rounded bg-gray-200"></div>
				<div class="h-4 w-1/4 rounded bg-gray-100"></div>
				<div class="h-64 w-full rounded-lg bg-gray-100"></div>
			</div>
			<div class="h-[420px] rounded-lg border bg-gray-50"></div>
		</div>
	{:else if listingQuery.isError}
		<div class="rounded-lg border border-destructive bg-card p-6 text-red-600">
			Listing not found or unavailable.
		</div>
	{:else if listingQuery.data}
		{@const listing = listingQuery.data}

		<div class="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] lg:items-start">
			<div class="space-y-6">
				{#if listing.primaryImageUrl}
					<img
						src={listing.primaryImageUrl}
						alt={listing.name}
						class="h-64 w-full rounded-lg object-cover"
					/>
				{/if}

				<Card.Root>
					<Card.Content class="space-y-4 py-6">
						<span class="inline-block rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
							{listing.listingTypeSlug}
						</span>

						<div class="space-y-2">
							<h1 class="text-3xl font-bold">{listing.name}</h1>
							{#if listing.description}
								<p class="text-gray-700">{listing.description}</p>
							{:else}
								<p class="text-sm text-muted-foreground">
									The operator has not added a description yet.
								</p>
							{/if}
						</div>
					</Card.Content>
				</Card.Root>

				{#if listing.metadata}
					<Card.Root>
						<Card.Header>
							<Card.Title>Listing details</Card.Title>
							<Card.Description>
								Metadata published with this marketplace listing.
							</Card.Description>
						</Card.Header>
						<Card.Content>
							<pre class="overflow-x-auto rounded bg-gray-50 p-4 text-xs text-gray-700">{JSON.stringify(listing.metadata, null, 2)}</pre>
						</Card.Content>
					</Card.Root>
				{/if}
			</div>

			<BookingRequestPanel listingId={listing.id} listingName={listing.name} />
		</div>
	{/if}
</div>
