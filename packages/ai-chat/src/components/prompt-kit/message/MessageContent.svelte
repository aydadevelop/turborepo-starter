<script lang="ts">
	import { cn } from "@full-stack-cf-app/ui/lib/utils";
	import type { Snippet } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";
	import Markdown from "../markdown/Markdown.svelte";

	let {
		markdown = false,
		class: className,
		content,
		children,
		...restProps
	}: {
		content?: string;
		markdown?: boolean;
		class?: string;
		children?: Snippet;
	} & HTMLAttributes<HTMLDivElement> = $props();

	const baseClass = "whitespace-normal break-words rounded-lg bg-secondary p-2 text-foreground";
	const classNames = $derived(cn(
		markdown ? `prose ${baseClass}` : baseClass,
		className
	));
</script>

{#if markdown && content}
	<!-- Markdown rendering can be added here when needed -->
	<!-- For now, we'll render as plain div -->
	<!-- <div class={classNames} {...restProps}>
		{@render children()}
	</div> -->
	<Markdown class={classNames} {content}></Markdown>
{:else}
	<div class={classNames} {...restProps}>{@render children?.()}</div>
{/if}
