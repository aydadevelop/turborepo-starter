<script lang="ts">
	const { children } = $props();
</script>

<div class="min-h-screen bg-amber-50">
	<div
		class="sticky top-0 z-30 border-b border-amber-300 bg-amber-100 px-4 py-2 text-sm text-amber-800"
	>
		⚠ Diagnostic pages — dev only. Each page isolates a suspected
		render/performance issue.
	</div>
	<div class="mx-auto max-w-5xl px-4 py-6">{@render children()}</div>
</div>
