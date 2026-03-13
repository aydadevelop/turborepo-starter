<script lang="ts">
	import { Button } from "@my-app/ui/components/button";

	let {
		pending = false,
		onCancel,
	}: {
		pending?: boolean;
		onCancel: () => void;
	} = $props();
</script>

<Button variant="outline" size="sm" disabled={pending} onclick={onCancel}>
	{pending ? "Cancelling..." : "Cancel"}
</Button>
