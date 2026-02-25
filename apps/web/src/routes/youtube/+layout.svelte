<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { Button } from "@my-app/ui/components/button";
	import { createQuery } from "@tanstack/svelte-query";
	import { orpc } from "$lib/orpc";
	import SubmitVideoDialog from "./SubmitVideoDialog.svelte";

	const { children } = $props();

	let addVideoOpen = $state(false);

	const feedsQuery = createQuery(orpc.youtube.feeds.list.queryOptions());

	const candidatesQuery = createQuery(
		orpc.youtube.videos.list.queryOptions({
			input: { status: "candidate", limit: 100 },
		})
	);

	const candidateCount = $derived($candidatesQuery.data?.length ?? 0);
	const hasFeedsLoaded = $derived(!$feedsQuery.isPending);
	const hasNoFeeds = $derived(hasFeedsLoaded && ($feedsQuery.data?.length ?? 0) === 0);

	const links = [
		{ href: resolve("/youtube/feeds"), label: "Feeds" },
		{ href: resolve("/youtube/videos"), label: "Videos" },
		{ href: resolve("/youtube/insights"), label: "Insights" },
	] as const;

	const isActive = (href: string) =>
		page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
</script>

<div class="container mx-auto space-y-6 p-6">
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-2xl font-bold">YouTube Feedback</h2>
			<p class="text-sm text-muted-foreground">
				Manage discovery feeds, review videos, and track playtest insights
			</p>
		</div>
		<Button onclick={() => (addVideoOpen = true)}>Add Video</Button>
	</div>

	<nav class="flex gap-1 border-b pb-0">
		{#each links as link (link.href)}
			<a
				href={link.href}
				class="relative rounded-t px-4 py-2 text-sm font-medium transition-colors
					{isActive(link.href)
						? 'border-b-2 border-primary text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
			>
				{link.label}
				{#if link.label === "Videos" && candidateCount > 0}
					<span
						class="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground"
					>
						{candidateCount > 99 ? "99+" : candidateCount}
					</span>
				{/if}
			</a>
		{/each}
	</nav>

	{#if hasNoFeeds && !isActive(resolve("/youtube/feeds"))}
		<div class="rounded-lg border border-dashed p-8 text-center">
			<h3 class="mb-2 text-lg font-semibold">Get started with YouTube Feedback</h3>
			<p class="mb-4 text-sm text-muted-foreground">
				Create a discovery feed to start finding and reviewing YouTube videos for your game.
			</p>
			<Button href={resolve("/youtube/feeds")}>Create your first feed</Button>
		</div>
	{:else}
		{@render children()}
	{/if}
</div>

<SubmitVideoDialog bind:open={addVideoOpen} />

