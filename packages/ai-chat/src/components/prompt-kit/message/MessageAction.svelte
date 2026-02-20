<script lang="ts">
	import {
		Tooltip,
		TooltipContent,
		TooltipProvider,
		TooltipTrigger,
	} from "@my-app/ui/components/tooltip";
	import type { Tooltip as TooltipPrimitive } from "bits-ui";
	import type { Snippet } from "svelte";

	let {
		tooltip,
		side = "top",
		class: className,
		children,
		...restProps
	}: {
		tooltip: Snippet;
		side?: "top" | "bottom" | "left" | "right";
		class?: string;
		children: Snippet;
	} & TooltipPrimitive.RootProps = $props();
</script>

<TooltipProvider>
	<Tooltip delayDuration={60} {...restProps}>
		<TooltipTrigger>{@render children()}</TooltipTrigger>
		<TooltipContent {side} class={className}>
			{@render tooltip()}
		</TooltipContent>
	</Tooltip>
</TooltipProvider>
