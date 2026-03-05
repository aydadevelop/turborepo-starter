<script lang="ts">
	import { browser } from "$app/environment";
	import { page } from "$app/state";
	import "../app.css";

	const { children } = $props();

	const PUBLIC_HEADER_PATHS = new Set(["/", "/login"]);

	const isPublicHeaderPath = $derived(
		PUBLIC_HEADER_PATHS.has(page.url.pathname)
	);

	let PublicAppHeader = $state<
		null | typeof import("../components/PublicAppHeader.svelte").default
	>(null);

	$effect(() => {
		if (isPublicHeaderPath) {
			import("../components/PublicAppHeader.svelte").then((m) => {
				PublicAppHeader = m.default;
			});
		} else {
			PublicAppHeader = null;
		}
	});
</script>

{#if browser && isPublicHeaderPath && PublicAppHeader}
	<PublicAppHeader />
{/if}

{@render children()}
