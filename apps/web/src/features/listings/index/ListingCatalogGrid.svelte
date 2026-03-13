<script lang="ts">
	import { Badge } from "@my-app/ui/components/badge";
	import { Button } from "@my-app/ui/components/button";
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle,
	} from "@my-app/ui/components/card";
	import ListingPublicationButton from "../../../components/org/ListingPublicationButton.svelte";
	import type { ListingListItem } from "$lib/orpc-types";

	let {
		listings,
		total,
	}: {
		listings: ListingListItem[];
		total: number;
	} = $props();

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

<div class="grid gap-4 md:grid-cols-2">
	{#each listings as item (item.id)}
		{@const isPublished = getPublicationState(item)}
		<Card>
			<CardHeader class="space-y-3">
				<div class="flex items-start justify-between gap-3">
					<div class="space-y-1">
						<CardTitle>{item.name}</CardTitle>
						<CardDescription>
							/{item.slug} · {item.listingTypeSlug}
						</CardDescription>
					</div>
					<Badge variant={getStatusVariant(item)}>{getStatusLabel(item)}</Badge>
				</div>
			</CardHeader>
			<CardContent class="space-y-4">
				{#if item.description}
					<p class="line-clamp-3 text-sm text-muted-foreground">
						{item.description}
					</p>
				{:else}
					<p class="text-sm text-muted-foreground">No description yet.</p>
				{/if}

				<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<Button href={`/org/listings/${item.id}`} variant="outline">
						Edit listing
					</Button>
					<ListingPublicationButton listingId={item.id} {isPublished} />
				</div>
			</CardContent>
		</Card>
	{/each}
</div>

<p class="text-sm text-muted-foreground">
	{total} listing{total === 1 ? "" : "s"}
</p>
