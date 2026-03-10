<script lang="ts">
	import { Button } from "@my-app/ui/components/button";
	import * as Card from "@my-app/ui/components/card";
	import { Badge } from "@my-app/ui/components/badge";
	import { createQuery } from "@tanstack/svelte-query";
	import { orpc } from "$lib/orpc";
	import ListingPublicationButton from "../../../../components/org/ListingPublicationButton.svelte";

	const listingsQuery = createQuery(() =>
		orpc.listing.list.queryOptions({
			input: {
				limit: 50,
				offset: 0,
			},
		})
	);

	const listings = $derived(listingsQuery.data?.items ?? []);

	const getPublicationState = (item: {
		status: string;
		isActive: boolean;
	}) => item.status === "active" && item.isActive;

	const getStatusLabel = (item: {
		status: string;
		isActive: boolean;
	}) => {
		if (getPublicationState(item)) return "Published";
		if (item.status === "draft") return "Draft";
		if (!item.isActive || item.status === "inactive") return "Unpublished";
		return item.status;
	};

	const getStatusVariant = (item: {
		status: string;
		isActive: boolean;
	}) => {
		if (getPublicationState(item)) return "default" as const;
		if (item.status === "draft") return "secondary" as const;
		return "outline" as const;
	};
</script>

<div class="space-y-6">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div class="space-y-1">
			<h2 class="text-2xl font-semibold tracking-tight">Listings</h2>
			<p class="text-sm text-muted-foreground">
				Manage your organization’s catalog and marketplace publication state.
			</p>
		</div>

		<Button href="/org/listings/new">Create listing</Button>
	</div>

	{#if listingsQuery.isPending}
		<div class="grid gap-4 md:grid-cols-2">
			{#each Array.from({ length: 4 }) as _, index (`skeleton-${index}`)}
				<Card.Root class="animate-pulse">
					<Card.Content class="space-y-3 py-6">
						<div class="h-5 w-2/3 rounded bg-muted"></div>
						<div class="h-4 w-1/3 rounded bg-muted/70"></div>
						<div class="h-16 rounded bg-muted/60"></div>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{:else if listingsQuery.isError}
		<Card.Root class="border-destructive">
			<Card.Content class="py-6">
				<p class="text-sm text-destructive">
					{listingsQuery.error?.message ?? "Failed to load listings."}
				</p>
			</Card.Content>
		</Card.Root>
	{:else if listings.length === 0}
		<Card.Root>
			<Card.Content class="space-y-3 py-6">
				<p class="text-sm text-muted-foreground">
					No listings yet. Create your first listing to start building your catalog.
				</p>
				<Button href="/org/listings/new" variant="outline">
					Create your first listing
				</Button>
			</Card.Content>
		</Card.Root>
	{:else}
		<div class="grid gap-4 md:grid-cols-2">
			{#each listings as item (item.id)}
				{@const isPublished = getPublicationState(item)}
				<Card.Root>
					<Card.Header class="space-y-3">
						<div class="flex items-start justify-between gap-3">
							<div class="space-y-1">
								<Card.Title>{item.name}</Card.Title>
								<Card.Description>
									/{item.slug} · {item.listingTypeSlug}
								</Card.Description>
							</div>
							<Badge variant={getStatusVariant(item)}>
								{getStatusLabel(item)}
							</Badge>
						</div>
					</Card.Header>
					<Card.Content class="space-y-4">
						{#if item.description}
							<p class="text-sm text-muted-foreground line-clamp-3">
								{item.description}
							</p>
						{:else}
							<p class="text-sm text-muted-foreground">
								No description yet.
							</p>
						{/if}

						<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
							<Button href={`/org/listings/${item.id}`} variant="outline">
								Edit listing
							</Button>
							<ListingPublicationButton listingId={item.id} {isPublished} />
						</div>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>

		<p class="text-sm text-muted-foreground">
			{listingsQuery.data?.total ?? listings.length} listing{(listingsQuery.data?.total ?? listings.length) === 1
				? ""
				: "s"}
		</p>
	{/if}
</div>