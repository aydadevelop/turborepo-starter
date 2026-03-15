<script lang="ts">
	import { dev } from "$app/environment";
	import Header from "../../components/Header.svelte";
	import OrgGuard from "../../components/OrgGuard.svelte";

	const { children: pageChildren, data } = $props();
	let QueryDevtools = $state<
		| null
		| typeof import("@tanstack/svelte-query-devtools").SvelteQueryDevtools
	>(null);

	const loadQueryDevtools = async (): Promise<void> => {
		const mod = await import("@tanstack/svelte-query-devtools");
		QueryDevtools = mod.SvelteQueryDevtools;
	};

	$effect(() => {
		if (!dev || typeof window === "undefined") {
			return;
		}

		loadQueryDevtools().catch(() => {
			QueryDevtools = null;
		});
	});
</script>

<OrgGuard initialSession={data.initialSession}>
	<div class="grid h-svh grid-rows-[auto_1fr]">
		<Header initialSession={data.initialSession} />
		<main class="overflow-y-auto">{@render pageChildren()}</main>
	</div>
</OrgGuard>
{#if dev && QueryDevtools}
	<QueryDevtools />
{/if}
