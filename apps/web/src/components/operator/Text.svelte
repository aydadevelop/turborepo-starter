<script lang="ts">
	import { cn } from "@my-app/ui/lib/utils";

	type TextVariant =
		| "body"
		| "body-sm"
		| "label"
		| "label-sm"
		| "muted"
		| "muted-sm"
		| "error"
		| "heading"
		| "heading-lg";

	const variantClasses: Record<TextVariant, string> = {
		body: "text-sm text-foreground",
		"body-sm": "text-xs text-foreground",
		label: "text-sm font-medium text-foreground",
		"label-sm": "text-xs font-medium text-foreground",
		muted: "text-sm text-muted-foreground",
		"muted-sm": "text-xs text-muted-foreground",
		error: "text-sm text-destructive",
		heading: "text-xl font-semibold text-foreground",
		"heading-lg": "text-2xl font-semibold text-foreground tracking-tight",
	};

	let {
		variant = "body",
		as = "p",
		class: className = "",
		children,
		...restProps
	}: {
		variant?: TextVariant;
		as?: "p" | "span" | "h1" | "h2" | "h3" | "h4" | "div" | "label";
		class?: string;
		children?: import("svelte").Snippet;
		[key: string]: unknown;
	} = $props();
</script>

{#if as === "span"}
	<span class={cn(variantClasses[variant], className)} {...restProps}>
		{#if children}{@render children()}{/if}
	</span>
{:else if as === "h1"}
	<h1 class={cn(variantClasses[variant], className)} {...restProps}>
		{#if children}{@render children()}{/if}
	</h1>
{:else if as === "h2"}
	<h2 class={cn(variantClasses[variant], className)} {...restProps}>
		{#if children}{@render children()}{/if}
	</h2>
{:else if as === "h3"}
	<h3 class={cn(variantClasses[variant], className)} {...restProps}>
		{#if children}{@render children()}{/if}
	</h3>
{:else if as === "h4"}
	<h4 class={cn(variantClasses[variant], className)} {...restProps}>
		{#if children}{@render children()}{/if}
	</h4>
{:else if as === "div"}
	<div class={cn(variantClasses[variant], className)} {...restProps}>
		{#if children}{@render children()}{/if}
	</div>
{:else if as === "label"}
	<label class={cn(variantClasses[variant], className)} {...restProps}>
		{#if children}{@render children()}{/if}
	</label>
{:else}
	<p class={cn(variantClasses[variant], className)} {...restProps}>
		{#if children}{@render children()}{/if}
	</p>
{/if}
