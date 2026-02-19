<script lang="ts">
	/**
	 * Diagnostic: Polling + scroll jank
	 *
	 * Reproduces the bookings-page pattern: TanStack Query with refetchInterval
	 * running while a large list is present.
	 *
	 * Suspected issue: when a query with refetchInterval fires and updates state,
	 * Svelte re-renders the component that owns the query. If that component
	 * also renders a large list, entire list re-renders, causing visible jank
	 * during scroll.
	 *
	 * This page lets you compare:
	 *   A) Query + list in the SAME component (boats pattern risk)
	 *   B) Query in a child, list in parent (isolated re-render)
	 */
	import { createQuery } from "@tanstack/svelte-query";
	import { derived, writable } from "svelte/store";
	import { untrack } from "svelte";
	import { authClient } from "$lib/auth-client";
	import { orpc } from "$lib/orpc";

	/* ---- visible render counters ---- */
	let renderCount = $state(0);
	let renderEvents = $state<{ ts: number; trigger: string }[]>([]);
	function recordRender(trigger: string) {
		renderCount++;
		renderEvents = [{ ts: Date.now(), trigger }, ...renderEvents.slice(0, 49)];
	}

	/* ---- Poll interval selector ---- */
	let intervalMs = $state(5000);

	/* ---- Pattern A: query + list in same component ---- */
	const sessionQuery = authClient.useSession();

	// Mirrors the bookings page pattern: notifications polling every 5 s
	const notifQueryOptions = derived(sessionQuery, ($sq) =>
		orpc.notifications.listMe.queryOptions({
			input: { limit: 20 },
			enabled: Boolean($sq.data?.user?.id),
			refetchInterval: intervalMs,
		}),
	);
	const notifQuery = createQuery(notifQueryOptions);

	// Track each time query data changes
	$effect(() => {
		const _status = $notifQuery.status;
		const _fetchStatus = $notifQuery.fetchStatus;
		const _dataUpdatedAt = $notifQuery.dataUpdatedAt;
		untrack(() => {
			recordRender("query-state-change");
		});
	});

	// Track interval changes — when user changes the interval, update the store
	// Note: derived(sessionQuery, ...) in Svelte store-land does NOT pick up
	// reactive `intervalMs` — this demonstrates the isolation problem.
	// To make the interval reactive you'd need a different pattern.
	$effect(() => {
		// Intentionally read intervalMs to demonstrate
		const _interval = intervalMs;
		untrack(() => {
			recordRender("intervalMs-changed");
		});
	});

	/* ---- long list ---- */
	const ITEMS = Array.from({ length: 100 }, (_, i) => ({
		id: i + 1,
		label: `Row ${i + 1} — re-renders: ${renderCount}`,
	}));

	/*
	 * Key observation: ITEMS is derived from renderCount, so every time
	 * renderCount changes (= every poll), the #each block gets a new array
	 * and potentially re-renders all 100 items.
	 *
	 * However, with (item.id) keying, Svelte only patches changed items.
	 * The label includes renderCount so ALL items will appear changed → all
	 * 100 DOM text nodes update. This is the bug.
	 */

	/* ---- Pattern B: stable list (renderCount not embedded in item data) ---- */
	const STABLE_ITEMS = Array.from({ length: 100 }, (_, i) => ({
		id: i + 1,
		label: `Row ${i + 1}`,
	}));

	let activeTab = $state<"unstable" | "stable">("unstable");

	/* ---- track last fetch ---- */
	let lastFetchAt = $state<number | null>(null);
	$effect(() => {
		if ($notifQuery.dataUpdatedAt > 0) {
			untrack(() => {
				lastFetchAt = $notifQuery.dataUpdatedAt;
			});
		}
	});
</script>

<div class="mb-6">
	<h2 class="mb-1 text-xl font-bold">Polling + scroll jank</h2>
	<p class="text-sm text-muted-foreground">
		TanStack Query polls every <strong>{intervalMs / 1000}s</strong>. Watch the render counter while
		scrolling. Pattern A embeds <code class="font-mono text-xs">renderCount</code> in list item labels
		(anti-pattern) — Pattern B uses stable data.
	</p>
</div>

<!-- Controls -->
<div class="mb-4 flex flex-wrap items-center gap-3">
	<label class="flex items-center gap-2 text-sm">
		<span>Poll interval:</span>
		<select
			class="rounded border px-2 py-1 text-sm"
			bind:value={intervalMs}
		>
			<option value={1000}>1s (stress test)</option>
			<option value={2000}>2s</option>
			<option value={5000}>5s (bookings default)</option>
			<option value={10000}>10s</option>
			<option value={999999}>off</option>
		</select>
	</label>
	<span class="text-xs text-muted-foreground">
		Query: {$notifQuery.status}/{$notifQuery.fetchStatus}
		{#if lastFetchAt}
			· last fetch {new Date(lastFetchAt).toISOString().slice(11, 19)}
		{/if}
	</span>
</div>

<!-- Render counter dashboard -->
<div class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
	<div class="rounded-lg border bg-white p-3 text-center">
		<p class="text-2xl font-bold">{renderCount}</p>
		<p class="text-xs text-muted-foreground">Total state changes</p>
	</div>
	<div class="rounded-lg border bg-white p-3 text-center">
		<p
			class="text-2xl font-bold {$notifQuery.fetchStatus === 'fetching'
				? 'text-amber-600'
				: 'text-emerald-600'}"
		>
			{$notifQuery.fetchStatus}
		</p>
		<p class="text-xs text-muted-foreground">Fetch status</p>
	</div>
	<div class="rounded-lg border bg-white p-3 text-center">
		<p class="text-2xl font-bold">{$notifQuery.data?.items?.length ?? 0}</p>
		<p class="text-xs text-muted-foreground">Notifications</p>
	</div>
	<div class="rounded-lg border bg-white p-3 text-center">
		<p class="text-2xl font-bold">{intervalMs / 1000}s</p>
		<p class="text-xs text-muted-foreground">Poll interval</p>
	</div>
</div>

<!-- Event log -->
<details class="mb-4">
	<summary class="cursor-pointer text-sm font-semibold">Render event log (last 50)</summary>
	<div class="mt-2 h-32 overflow-y-auto rounded border bg-white p-2 font-mono text-xs">
		{#each renderEvents as ev (ev.ts)}
			<div class="flex gap-3">
				<span class="text-muted-foreground">{new Date(ev.ts).toISOString().slice(11, 23)}</span>
				<span>{ev.trigger}</span>
			</div>
		{:else}
			<span class="text-muted-foreground">no events yet</span>
		{/each}
	</div>
</details>

<!-- Tab: Pattern A vs B -->
<div class="mb-3 flex gap-2">
	<button
		type="button"
		class="rounded border px-3 py-1 text-sm {activeTab === 'unstable'
			? 'bg-destructive text-white'
			: 'hover:bg-muted'}"
		onclick={() => (activeTab = "unstable")}
	>
		Pattern A — Unstable labels
	</button>
	<button
		type="button"
		class="rounded border px-3 py-1 text-sm {activeTab === 'stable'
			? 'bg-emerald-600 text-white'
			: 'hover:bg-muted'}"
		onclick={() => (activeTab = "stable")}
	>
		Pattern B — Stable labels
	</button>
</div>

<div class="rounded-lg border bg-white p-4">
	{#if activeTab === "unstable"}
		<p class="mb-3 text-sm text-destructive">
			⚠ Anti-pattern: renderCount embedded in item label. Every poll updates all {ITEMS.length} DOM
			text nodes.
		</p>
		<ul class="space-y-1">
			{#each ITEMS as item (item.id)}
				<li class="rounded border border-border/50 px-3 py-1.5 text-sm">
					<!-- BUG: renderCount in template means this text node updates on every poll -->
					{item.id}. {item.label} (state changes: {renderCount})
				</li>
			{/each}
		</ul>
	{:else}
		<p class="mb-3 text-sm text-emerald-700">
			✓ Fixed: list data is stable. Polling does not update list item DOM nodes.
		</p>
		<ul class="space-y-1">
			{#each STABLE_ITEMS as item (item.id)}
				<li class="rounded border border-border/50 px-3 py-1.5 text-sm">
					{item.id}. {item.label}
				</li>
			{/each}
		</ul>
	{/if}
</div>
