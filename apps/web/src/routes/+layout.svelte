<script lang="ts">
	import { QueryClientProvider } from "@tanstack/svelte-query";
	import { SvelteQueryDevtools } from "@tanstack/svelte-query-devtools";
	import "../app.css";
	import { queryClient } from "$lib/orpc";
	import Header from "../components/Header.svelte";
	import OrgGuard from "../components/OrgGuard.svelte";

	const { children: pageChildren } = $props();
</script>

<QueryClientProvider client={queryClient}>
	<OrgGuard>
		<div class="grid h-svh grid-rows-[auto_1fr]">
			<Header />
			<main class="overflow-y-auto">{@render pageChildren()}</main>
		</div>
	</OrgGuard>
	<SvelteQueryDevtools />
</QueryClientProvider>
