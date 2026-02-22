<script lang="ts">
	import { cn } from "@my-app/ui/lib/utils";

	interface Props {
		class?: string;
		size?: "sm" | "md" | "lg";
		text?: string;
	}

	let { text = "Thinking", class: className, size = "md" }: Props = $props();

	const textSizes = {
		sm: "text-xs",
		md: "text-sm",
		lg: "text-base",
	};
</script>

<div
	class={cn(
		"animate-[text-blink_2s_ease-in-out_infinite] font-medium",
		textSizes[size],
		className
	)}
>
	{text}
</div>
