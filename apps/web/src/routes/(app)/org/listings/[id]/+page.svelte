<script lang="ts">
	import { createMutation, createQuery } from "@tanstack/svelte-query";
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { orpc, queryClient } from "$lib/orpc";
	import ListingEditorForm from "../../../../../components/org/ListingEditorForm.svelte";

	const listingId = $derived(page.params.id ?? "");

	const listingQuery = createQuery(() => ({
		...orpc.listing.get.queryOptions({ input: { id: listingId } }),
		enabled: Boolean(listingId),
	}));

	const updateListingMutation = createMutation(() =>
		orpc.listing.update.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({ queryKey: orpc.listing.key() });
				await goto("/org/listings");
			},
		})
	);

	function handleSubmit(input: {
		listingTypeSlug: string;
		name: string;
		slug: string;
		timezone: string;
		description?: string;
		metadata?: Record<string, unknown>;
	}) {
		updateListingMutation.mutate({
			id: listingId,
			name: input.name,
			timezone: input.timezone,
			description: input.description,
			metadata: input.metadata,
		});
	}

	const initialValue = $derived(
		listingQuery.data
			? {
				listingTypeSlug: listingQuery.data.listingTypeSlug,
				name: listingQuery.data.name,
				slug: listingQuery.data.slug,
				timezone: listingQuery.data.timezone,
				description: listingQuery.data.description,
				metadata: listingQuery.data.metadata,
			}
			: undefined
	);
</script>

<svelte:head>
	<title>{listingQuery.data?.name ?? "Edit listing"}</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-4">
	<div class="space-y-1">
		<h2 class="text-2xl font-semibold tracking-tight">Edit listing</h2>
		<p class="text-sm text-muted-foreground">
			Update your listing details and metadata using the live organization-scoped API.
		</p>
	</div>

	{#if listingQuery.isPending}
		<div class="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
			Loading listing...
		</div>
	{:else if listingQuery.isError}
		<div class="rounded-lg border border-destructive bg-card p-6 text-sm text-destructive">
			{listingQuery.error?.message ?? "Failed to load listing."}
		</div>
	{:else if initialValue}
		<ListingEditorForm
			mode="edit"
			{initialValue}
			submitLabel="Save changes"
			pending={updateListingMutation.isPending}
			errorMessage={updateListingMutation.error?.message ?? null}
			onSubmit={handleSubmit}
		/>
	{/if}
</div>