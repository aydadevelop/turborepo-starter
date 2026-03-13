<script lang="ts">
	import Loader2Icon from "@lucide/svelte/icons/loader-2";
	import { cn } from "@my-app/ui/lib/utils";

	type SpinnerSize = "sm" | "md" | "lg";

	const sizeClasses: Record<SpinnerSize, string> = {
		sm: "size-4",
		md: "size-6",
		lg: "size-8",
	};

	let {
		size = "md",
		class: className = "",
	}: {
		size?: SpinnerSize;
		class?: string;
	} = $props();
</script>

<Loader2Icon class={cn("animate-spin text-muted-foreground", sizeClasses[size], className)} />
