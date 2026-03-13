<script lang="ts">
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle,
	} from "@my-app/ui/components/card";
	import type { Snippet } from "svelte";

	let {
		title,
		description = null,
		class: className = "",
		contentClass = "",
		children,
		action,
	}: {
		title: string;
		description?: string | null;
		class?: string;
		contentClass?: string;
		children?: Snippet;
		action?: Snippet;
	} = $props();
</script>

<Card class={className}>
	<CardHeader>
		<div
			class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
		>
			<div class="space-y-1">
				<CardTitle>{title}</CardTitle>
				{#if description}
					<CardDescription>{description}</CardDescription>
				{/if}
			</div>
			{#if action}
				<div class="shrink-0">{@render action()}</div>
			{/if}
		</div>
	</CardHeader>
	<CardContent class={contentClass}>
		{#if children}
			{@render children()}
		{/if}
	</CardContent>
</Card>
