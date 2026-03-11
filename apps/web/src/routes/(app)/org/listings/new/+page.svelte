<script lang="ts">
	import { createQuery } from "@tanstack/svelte-query";
	import { createMutation } from "@tanstack/svelte-query";
	import { goto } from "$app/navigation";
	import { orpc, queryClient } from "$lib/orpc";
	import ListingEditorForm from "../../../../../components/org/ListingEditorForm.svelte";

	const availableListingTypesQuery = createQuery(() =>
		orpc.listing.listAvailableTypes.queryOptions({
			input: {},
		})
	);

	const createListingMutation = createMutation(() =>
		orpc.listing.create.mutationOptions({
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
		createListingMutation.mutate(input);
	}
</script>

<svelte:head>
	<title>Create listing</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-4">
	<div class="space-y-1">
		<h2 class="text-2xl font-semibold tracking-tight">New listing</h2>
		<p class="text-sm text-muted-foreground">
			Add a listing to your organization’s catalog and prepare it for publication.
		</p>
	</div>

	{#if availableListingTypesQuery.isPending}
		<div class="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
			Loading listing types...
		</div>
	{:else if availableListingTypesQuery.isError}
		<div class="rounded-lg border border-destructive bg-card p-6 text-sm text-destructive">
			{availableListingTypesQuery.error?.message ??
				"Failed to load available listing types."}
		</div>
	{:else}
		<ListingEditorForm
			mode="create"
			submitLabel="Create listing"
			pending={createListingMutation.isPending}
			errorMessage={createListingMutation.error?.message ?? null}
			listingTypeOptions={availableListingTypesQuery.data.items}
			onSubmit={handleSubmit}
		/>
	{/if}
</div>
