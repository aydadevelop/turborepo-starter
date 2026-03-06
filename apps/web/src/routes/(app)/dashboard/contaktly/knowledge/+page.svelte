<script lang="ts">
	import { DEMO_WIDGET_CONFIG_ID } from "@my-app/contaktly-widget";
	import { Badge } from "@my-app/ui/components/badge";
	import { Button } from "@my-app/ui/components/button";
	import * as Card from "@my-app/ui/components/card";
	import { createQuery } from "@tanstack/svelte-query";
	import { resolve } from "$app/paths";
	import { orpc } from "$lib/orpc";

	const knowledgeQuery = createQuery(() =>
		orpc.contaktly.getKnowledgeBase.queryOptions({
			input: { configId: DEMO_WIDGET_CONFIG_ID },
		})
	);
	const knowledge = $derived(knowledgeQuery.data);
</script>

<div class="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
	<div class="space-y-2" data-testid="contaktly-knowledge-heading">
		<p class="text-sm uppercase tracking-[0.3em] text-primary">Knowledge</p>
		<h1 class="text-3xl font-semibold tracking-tight">Source inventory</h1>
		<p class="max-w-3xl text-muted-foreground">
			The current MVP derives a lightweight knowledge inventory from the
			persisted prefill draft. That keeps the demo honest: scrape first, then
			publish the derived source set.
		</p>
	</div>

	{#if !knowledge || knowledge.documents.length === 0}
		<Card.Root data-testid="contaktly-knowledge-empty-state">
			<Card.Header>
				<Card.Title>No knowledge source yet</Card.Title>
				<Card.Description>
					Generate a prefill draft first, then this page will reflect the
					derived site inventory.
				</Card.Description>
			</Card.Header>
			<Card.Footer>
				<Button href={resolve("/dashboard/contaktly/prefill")}>
					Open prefill
				</Button>
			</Card.Footer>
		</Card.Root>
	{:else}
		<Card.Root>
			<Card.Header>
				<Card.Title data-testid="contaktly-knowledge-site-title">
					{knowledge.siteTitle}
				</Card.Title>
				<Card.Description>{knowledge.sourceUrl}</Card.Description>
			</Card.Header>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Derived documents</Card.Title>
				<Card.Description>
					Current source set used for context and messaging.
				</Card.Description>
			</Card.Header>
			<Card.Content
				class="grid gap-4 md:grid-cols-2"
				data-testid="contaktly-knowledge-documents"
			>
				{#each knowledge.documents as document}
					<div class="rounded-2xl border border-border/70 bg-card/40 p-4">
						<div class="flex items-start justify-between gap-3">
							<div>
								<p class="font-medium">{document.title}</p>
								<p class="mt-1 break-all text-xs text-muted-foreground">
									{document.sourceUrl}
								</p>
							</div>
							<Badge variant="secondary">{document.status}</Badge>
						</div>
						<p class="mt-3 text-sm text-muted-foreground">{document.summary}</p>
						<div class="mt-3 flex flex-wrap gap-2">
							{#each document.tags as tag}
								<Badge variant="outline">{tag}</Badge>
							{/each}
						</div>
					</div>
				{/each}
			</Card.Content>
		</Card.Root>
	{/if}
</div>
