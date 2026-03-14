<script lang="ts">
	import { Badge } from "@my-app/ui/components/badge";

	let {
		label,
		variant = "secondary",
	}: {
		label: string;
		variant?: "default" | "secondary" | "destructive" | "outline";
	} = $props();
</script>

<Badge {variant}>{label}</Badge>
