<script lang="ts">
	import {
		DEMO_WIDGET_CONFIG_ID,
		mountContaktlyWidget,
		sanitizeTags,
	} from "@my-app/contaktly-widget";
	import { onMount } from "svelte";
	import { page } from "$app/state";

	const configId = $derived(
		page.url.searchParams.get("params")?.trim() || DEMO_WIDGET_CONFIG_ID
	);
	const tags = $derived(sanitizeTags(page.url.searchParams.get("tags")));
	const open = $derived(page.url.searchParams.get("open") === "1");

	onMount(() => {
		const mounted = mountContaktlyWidget({
			baseUrl: window.location.origin,
			configId,
			open,
			tags,
		});

		return () => mounted.destroy();
	});
</script>

<svelte:head> <title>Contaktly Widget Host</title> </svelte:head>

<div
	class="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.16),_transparent_35%),linear-gradient(180deg,_#f8fafc_0%,_#e2e8f0_100%)]"
></div>
