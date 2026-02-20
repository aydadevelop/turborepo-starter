<script lang="ts">
	import {
		TooltipContent,
		TooltipTrigger,
	} from "@my-app/ui/components/tooltip";
	import { Tooltip as TooltipPrimitive } from "bits-ui";
	import { getPromptInputContext } from "./prompt-input-context.svelte.js";

	let {
		tooltip,
		children,
		class: className,
		side = "top",
		...restProps
	}: {
		tooltip: import("svelte").Snippet;
		children: import("svelte").Snippet;
		class?: string;
		side?: "top" | "bottom" | "left" | "right";
	} & Partial<TooltipPrimitive.RootProps> = $props();

	const context = getPromptInputContext();

	function handleClick(event: MouseEvent) {
		event.stopPropagation();
	}
</script>

<TooltipPrimitive.Root {...restProps} delayDuration={0}>
	<TooltipTrigger disabled={context.disabled} onclick={handleClick}>
		{@render children()}
	</TooltipTrigger>
	<TooltipContent {side} class={className}>{@render tooltip()}</TooltipContent>
</TooltipPrimitive.Root>
