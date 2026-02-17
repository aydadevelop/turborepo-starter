<script lang="ts">
	import {
		Avatar,
		AvatarFallback,
		AvatarImage,
	} from "@full-stack-cf-app/ui/components/avatar";
	import { cn } from "@full-stack-cf-app/ui/lib/utils";

	let {
		src,
		alt,
		fallback,
		class: className,
	}: {
		src: string;
		alt: string;
		fallback?: string;
		class?: string;
	} = $props();
</script>

<Avatar class={cn("h-8 w-8 shrink-0", className)}>
	<AvatarImage {src} {alt} />
	{#if fallback}
		<AvatarFallback>{fallback}</AvatarFallback>
	{/if}
</Avatar>
