<script lang="ts">
	import { createMutation, createQuery } from "@tanstack/svelte-query";
	import { goto } from "$app/navigation";
	import { orpc, queryClient } from "$lib/orpc";
	import type { OrpcInputs } from "$lib/orpc-types";
	import ListingEditorForm from "../../../../../components/org/ListingEditorForm.svelte";

	const createEditorStateQuery = createQuery(() =>
		orpc.listing.getCreateEditorState.queryOptions({
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
</script>

<svelte:head> <title>Create listing</title> </svelte:head>

<div class="mx-auto max-w-3xl space-y-4">
	<div class="space-y-1">
		<h2 class="text-2xl font-semibold tracking-tight">New listing</h2>
		<p class="text-sm text-muted-foreground">
			Add a listing to your organization’s catalog and prepare it for
			publication.
		</p>
	</div>

	{#if createEditorStateQuery.isPending}
		<div class="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
			Loading listing editor...
		</div>
	{:else if createEditorStateQuery.isError}
		<div
			class="rounded-lg border border-destructive bg-card p-6 text-sm text-destructive"
		>
			{createEditorStateQuery.error?.message ??
				"Failed to load listing editor state."}
		</div>
	{:else}
		<ListingEditorForm
			mode="create"
			submitLabel="Create listing"
			pending={createListingMutation.isPending}
			errorMessage={createListingMutation.error?.message ?? null}
			initialValue={{
				timezone: createEditorStateQuery.data.defaults.timezone,
			}}
			listingTypeOptions={createEditorStateQuery.data.listingTypes.items}
			onSubmit={async (input: OrpcInputs["listing"]["create"]) => {
				await createListingMutation.mutateAsync(input);
			}}
		/>
	{/if}
</div>
