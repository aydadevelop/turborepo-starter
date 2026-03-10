<script lang="ts">
	import { Button } from "@my-app/ui/components/button";
	import { createMutation } from "@tanstack/svelte-query";
	import { queryClient, orpc } from "$lib/orpc";

	let {
		listingId,
		isPublished,
	}: {
		listingId: string;
		isPublished: boolean;
	} = $props();

	const publishMutation = createMutation(() =>
		orpc.listing.publish.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: orpc.listing.key() });
			},
		})
	);

	const unpublishMutation = createMutation(() =>
		orpc.listing.unpublish.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: orpc.listing.key() });
			},
		})
	);

	const activeMutation = $derived(
		isPublished ? unpublishMutation : publishMutation
	);

	const errorMessage = $derived(
		publishMutation.error?.message ?? unpublishMutation.error?.message ?? null
	);

	const isPending = $derived(activeMutation.isPending);

	function handleClick() {
		if (isPublished) {
			unpublishMutation.mutate({ id: listingId });
			return;
		}

		publishMutation.mutate({
			id: listingId,
			channelType: "platform_marketplace",
		});
	}
</script>

<div class="flex flex-col items-start gap-2">
	<Button
		variant={isPublished ? "outline" : "default"}
		size="sm"
		onclick={handleClick}
		disabled={isPending}
	>
		{#if isPending}
			{isPublished ? "Unpublishing..." : "Publishing..."}
		{:else}
			{isPublished ? "Unpublish" : "Publish"}
		{/if}
	</Button>

	{#if errorMessage}
		<p class="text-xs text-destructive">{errorMessage}</p>
	{/if}
</div>