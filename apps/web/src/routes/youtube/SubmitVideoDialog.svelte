<script lang="ts">
	import { Button } from "@my-app/ui/components/button";
	import * as Dialog from "@my-app/ui/components/dialog";
	import { Input } from "@my-app/ui/components/input";
	import { Label } from "@my-app/ui/components/label";
	import * as Select from "@my-app/ui/components/select";
	import { createMutation, createQuery } from "@tanstack/svelte-query";
	import { orpc, queryClient } from "$lib/orpc";

	interface Props {
		open: boolean;
	}

	let { open = $bindable() }: Props = $props();

	let feedId = $state("");
	let url = $state("");
	let submitError = $state<string | null>(null);

	const feedsQuery = createQuery(orpc.youtube.feeds.list.queryOptions());

	const submitMutation = createMutation(
		orpc.youtube.videos.submit.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: orpc.youtube.key() });
				url = "";
				feedId = "";
				submitError = null;
				open = false;
			},
		})
	);

	const handleSubmit = async () => {
		submitError = null;
		try {
			await $submitMutation.mutateAsync({
				feedId,
				youtubeUrl: url.trim(),
			});
		} catch (e) {
			submitError = e instanceof Error ? e.message : "Failed to submit video";
		}
	};

	const canSubmit = $derived(
		!!feedId && !!url.trim() && !$submitMutation.isPending
	);
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title>Add Video by URL</Dialog.Title>
			<Dialog.Description>
				Submit a YouTube video directly to a discovery feed for processing.
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4">
			<div class="space-y-2">
				<Label for="global-submit-feed">Feed</Label>
				{#if $feedsQuery.isPending}
					<p class="text-sm text-muted-foreground">Loading feeds…</p>
				{:else if $feedsQuery.isError}
					<p class="text-sm text-destructive">Failed to load feeds.</p>
				{:else}
					<Select.Root type="single" bind:value={feedId}>
						<Select.Trigger id="global-submit-feed">
							{($feedsQuery.data ?? []).find((f) => f.id === feedId)?.name ??
								"Select a feed"}
						</Select.Trigger>
						<Select.Content>
							{#each $feedsQuery.data ?? [] as feed (feed.id)}
								<Select.Item value={feed.id}>{feed.name}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="global-submit-url">YouTube URL</Label>
				<Input
					id="global-submit-url"
					placeholder="https://youtube.com/watch?v=..."
					bind:value={url}
				/>
			</div>

			{#if submitError}
				<p class="text-sm text-destructive">{submitError}</p>
			{/if}
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
			<Button disabled={!canSubmit} onclick={() => void handleSubmit()}>
				{$submitMutation.isPending ? "Submitting…" : "Submit Video"}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
