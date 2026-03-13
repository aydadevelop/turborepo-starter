<script lang="ts">
	import { Button } from "@my-app/ui/components/button";

	let {
		onChangeRole,
		onRemove,
	}: {
		onChangeRole: () => void;
		onRemove: () => void;
	} = $props();
</script>

<div class="flex gap-1">
	<Button variant="outline" size="sm" onclick={onChangeRole}>Role</Button>
	<Button variant="outline" size="sm" onclick={onRemove}>Remove</Button>
</div>
