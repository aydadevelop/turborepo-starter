<script lang="ts">
	import {
		type QueryClient,
		QueryClientProvider,
	} from "@tanstack/svelte-query";
	import type { Component as SvelteComponent } from "svelte";

	let {
		client,
		component: DynamicComponent,
		props = {},
	}: {
		client: QueryClient;
		component: SvelteComponent<Record<string, unknown>>;
		props?: Record<string, unknown>;
	} = $props();
</script>

<QueryClientProvider {client}>
	<DynamicComponent {...props} />
</QueryClientProvider>
