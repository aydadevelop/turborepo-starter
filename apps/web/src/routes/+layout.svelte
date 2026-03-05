<script lang="ts">
	import { browser } from "$app/environment";
	import { page } from "$app/state";
	import PublicAppHeader from "../components/PublicAppHeader.svelte";
	import "../app.css";

	const { children } = $props();

	const PUBLIC_HEADER_PATHS = new Set(["/", "/login"]);

	const isPublicHeaderPath = $derived(
		PUBLIC_HEADER_PATHS.has(page.url.pathname)
	);
</script>

{#if browser && isPublicHeaderPath}
	<PublicAppHeader />
{/if}

{@render children()}
