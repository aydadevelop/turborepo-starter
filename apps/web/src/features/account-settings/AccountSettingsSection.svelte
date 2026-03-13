<script lang="ts">
	import * as Card from "@my-app/ui/components/card";
	import type { Snippet } from "svelte";

	let {
		title,
		description = null,
		children,
		footer,
	}: {
		title: string;
		description?: string | null;
		children?: Snippet;
		footer?: Snippet;
	} = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{title}</Card.Title>
		{#if description}
			<Card.Description>{description}</Card.Description>
		{/if}
	</Card.Header>
	<Card.Content class="space-y-4">
		{#if children}
			{@render children()}
		{/if}
	</Card.Content>
	{#if footer}
		<Card.Footer>
			{@render footer()}
		</Card.Footer>
	{/if}
</Card.Root>
