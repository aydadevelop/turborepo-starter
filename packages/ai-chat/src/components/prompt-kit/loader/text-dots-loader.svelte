<script lang="ts">
	import { cn } from "@my-app/ui/lib/utils";

	interface Props {
		class?: string;
		size?: "sm" | "md" | "lg";
		text?: string;
	}

	let { class: className, text = "Thinking", size = "md" }: Props = $props();

	const textSizes = {
		sm: "text-xs",
		md: "text-sm",
		lg: "text-base",
	};
</script>

<div class={cn("inline-flex items-center", className)}>
	<span class={cn("text-primary font-medium", textSizes[size])}> {text} </span>
	<span class="inline-flex">
		<span class="text-primary animate-[loading-dots_1.4s_infinite_0.2s]"
			>.</span
		>
		<span class="text-primary animate-[loading-dots_1.4s_infinite_0.4s]"
			>.</span
		>
		<span class="text-primary animate-[loading-dots_1.4s_infinite_0.6s]"
			>.</span
		>
	</span>
</div>
