<script lang="ts">
	import { createQuery } from "@tanstack/svelte-query";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { orpc } from "$lib/orpc";

	const { children } = $props();

	const canManageQuery = createQuery({
		...orpc.canManageOrganization.queryOptions(),
		retry: false,
	});

	$effect(() => {
		if ($canManageQuery.isPending) return;
		if (!$canManageQuery.data?.canManageOrganization) {
			goto(resolve("/dashboard/settings"));
		}
	});
</script>

{@render children()}
