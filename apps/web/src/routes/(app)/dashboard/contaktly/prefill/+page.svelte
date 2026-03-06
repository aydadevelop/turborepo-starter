<script lang="ts">
	import { DEMO_WIDGET_CONFIG_ID } from "@my-app/contaktly-widget";
	import { Button } from "@my-app/ui/components/button";
	import * as Card from "@my-app/ui/components/card";
	import { Input } from "@my-app/ui/components/input";
	import { Textarea } from "@my-app/ui/components/textarea";
	import { createMutation, createQuery } from "@tanstack/svelte-query";
	import { orpc } from "$lib/orpc";

	const prefillQuery = createQuery(() =>
		orpc.contaktly.getPrefillDraft.queryOptions({
			input: { configId: DEMO_WIDGET_CONFIG_ID },
		})
	);
	const ASTRO_FIXTURE_PLACEHOLDER_URL = "http://localhost:4321/";

	const generatePrefillMutation = createMutation(() =>
		orpc.contaktly.generatePrefillDraft.mutationOptions({
			onMutate: () => {
				statusMessage = "Generating draft...";
			},
			onSuccess: (draft) => {
				sourceUrlDraft = draft.sourceUrl;
				lastLoadedSourceUrl = draft.sourceUrl;
				statusMessage = "Draft generated";
				prefillQuery.refetch();
			},
			onError: (error) => {
				statusMessage = error.message || "Failed to generate draft";
			},
		})
	);

	let sourceUrlDraft = $state("");
	let lastLoadedSourceUrl = $state("");
	let statusMessage = $state("");

	const prefillDraft = $derived(prefillQuery.data);
	const canGenerateDraft = $derived(
		Boolean(sourceUrlDraft.trim() && !generatePrefillMutation.isPending)
	);

	$effect(() => {
		const nextSourceUrl = prefillDraft?.sourceUrl;

		if (
			nextSourceUrl &&
			(sourceUrlDraft === "" || sourceUrlDraft === lastLoadedSourceUrl)
		) {
			sourceUrlDraft = nextSourceUrl;
			lastLoadedSourceUrl = nextSourceUrl;
		}
	});

	function handleGenerateDraft(event: SubmitEvent) {
		event.preventDefault();
		const sourceUrl = sourceUrlDraft.trim();

		if (!sourceUrl || generatePrefillMutation.isPending) {
			return;
		}

		generatePrefillMutation.mutate({
			configId: DEMO_WIDGET_CONFIG_ID,
			sourceUrl,
		});
	}
</script>

<div class="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
	<div class="space-y-2" data-testid="contaktly-prefill-heading">
		<p class="text-sm uppercase tracking-[0.3em] text-primary">Prefill Draft</p>
		<h1 class="text-3xl font-semibold tracking-tight">
			Scrape the fixture site and review the generated messaging
		</h1>
		<p class="max-w-3xl text-muted-foreground">
			This slice turns a supplied website URL into a persisted draft for opening
			message, starter cards, and lead qualification guidance before publish.
		</p>
	</div>

	<Card.Root data-testid="contaktly-prefill-source-card">
		<Card.Header>
			<Card.Title>Generate draft</Card.Title>
			<Card.Description>
				Use the Astro fixture site or any accessible website URL.
			</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			<form class="space-y-3" onsubmit={handleGenerateDraft}>
				<label class="space-y-2">
					<span class="text-sm font-medium">Website URL</span>
					<Input
						bind:value={sourceUrlDraft}
						data-testid="contaktly-prefill-url-input"
						placeholder={ASTRO_FIXTURE_PLACEHOLDER_URL}
						type="url"
					/>
				</label>
				<div class="flex items-center gap-3">
					<Button disabled={!canGenerateDraft} type="submit">
						Generate draft
					</Button>
					<p class="text-sm text-muted-foreground">
						{statusMessage || "Drafts are persisted per widget config for review."}
					</p>
				</div>
			</form>
		</Card.Content>
	</Card.Root>

	{#if prefillDraft}
		<div class="grid gap-5 md:grid-cols-2">
			<Card.Root data-testid="contaktly-prefill-summary">
				<Card.Header>
					<Card.Title>{prefillDraft.siteTitle}</Card.Title>
					<Card.Description>{prefillDraft.sourceUrl}</Card.Description>
				</Card.Header>
				<Card.Content>
					<p class="text-sm text-muted-foreground">
						{prefillDraft.businessSummary}
					</p>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title>Qualified lead definition</Card.Title>
				</Card.Header>
				<Card.Content>
					<p
						class="text-sm text-muted-foreground"
						data-testid="contaktly-prefill-qualified-lead-definition"
					>
						{prefillDraft.qualifiedLeadDefinition}
					</p>
				</Card.Content>
			</Card.Root>
		</div>

		<div class="grid gap-5 md:grid-cols-2">
			<Card.Root>
				<Card.Header> <Card.Title>Opening message</Card.Title> </Card.Header>
				<Card.Content>
					<Textarea
						data-testid="contaktly-prefill-opening-message"
						readonly
						rows={6}
						value={prefillDraft.openingMessage}
					/>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title>Custom instructions</Card.Title>
				</Card.Header>
				<Card.Content>
					<Textarea
						data-testid="contaktly-prefill-custom-instructions"
						readonly
						rows={6}
						value={prefillDraft.customInstructions}
					/>
				</Card.Content>
			</Card.Root>
		</div>

		<Card.Root>
			<Card.Header> <Card.Title>Starter cards</Card.Title> </Card.Header>
			<Card.Content>
				<ul
					class="grid gap-2 text-sm text-muted-foreground"
					data-testid="contaktly-prefill-starter-cards"
				>
					{#each prefillDraft.starterCards as starterCard}
						<li class="rounded-xl border border-border/70 bg-card/50 px-4 py-3">
							{starterCard}
						</li>
					{/each}
				</ul>
			</Card.Content>
		</Card.Root>
	{:else}
		<Card.Root data-testid="contaktly-prefill-empty-state">
			<Card.Header>
				<Card.Title>No draft yet</Card.Title>
				<Card.Description>
					Generate a prefill draft to review extracted messaging defaults.
				</Card.Description>
			</Card.Header>
		</Card.Root>
	{/if}
</div>
