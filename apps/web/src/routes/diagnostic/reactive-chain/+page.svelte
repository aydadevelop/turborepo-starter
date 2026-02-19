<script lang="ts">
	/**
	 * Diagnostic: Reactive chain
	 *
	 * Reproduces the exact boats-page pattern and counts how many times
	 * each step in the reactive chain fires.
	 *
	 * Suspected issues:
	 * 1. availabilityOpts calls parseBoatsSearchState() AGAIN (duplicate of parsedSearch)
	 *    → creates fresh Date objects → new object reference → $effect fires → store updates
	 * 2. Each $derived primitive from parsedSearch (date, startHour, …) is a separate
	 *    reactive node — harmless on its own but noisy in DevTools flamegraph.
	 * 3. The $effect that syncs the store fires every time availabilityOpts changes.
	 *    If availabilityOpts returns a new object every render (even with same values),
	 *    unrelated scroll/resize-triggered Svelte ticks could cause phantom query updates.
	 */
	import { createQuery } from "@tanstack/svelte-query";
	import { untrack } from "svelte";
	import { writable } from "svelte/store";
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { orpc } from "$lib/orpc";

	/* ---- helpers (verbatim from boats/+page.svelte) ---- */
	const DATE_PARAM_RE = /^\d{4}-\d{2}-\d{2}$/;
	const clamp = (v: number, min: number, max: number) =>
		Math.min(Math.max(v, min), max);
	const toLocalIsoDate = (d: Date) =>
		`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

	const defaultDate = toLocalIsoDate(
		new Date(Date.now() + 24 * 60 * 60 * 1000)
	);

	function parseSearch(sp: URLSearchParams) {
		const rawDate = sp.get("date");
		const date = rawDate && DATE_PARAM_RE.test(rawDate) ? rawDate : defaultDate;
		const startHour = clamp(
			Number.parseInt(sp.get("startHour") ?? "10", 10) || 10,
			0,
			23
		);
		const durationHours = clamp(
			Number.parseFloat(sp.get("durationHours") ?? "2") || 2,
			0.5,
			24
		);
		const passengers = clamp(
			Number.parseInt(sp.get("passengers") ?? "2", 10) || 2,
			1,
			500
		);
		const startsAt = new Date(
			`${date}T${String(startHour).padStart(2, "0")}:00:00`
		);
		const endsAt = new Date(
			startsAt.getTime() + durationHours * 60 * 60 * 1000
		);
		return { date, startHour, durationHours, passengers, startsAt, endsAt };
	}

	/* ============================================================ */
	/*  PATTERN A — ORIGINAL (boats page verbatim)                  */
	/*  parsedSearch is one $derived; then availabilityOpts calls   */
	/*  parseSearch() AGAIN inside its own $derived.by block.       */
	/* ============================================================ */
	let fireCount_parsedSearch = $state(0);
	let fireCount_availabilityOpts = $state(0);
	let fireCount_store = $state(0);
	let fireCount_query = $state(0);

	const parsedSearch = $derived.by(() => {
		untrack(() => {
			fireCount_parsedSearch++;
		});
		return parseSearch(page.url.searchParams);
	});

	// Original bug: calls parseSearch AGAIN instead of reusing parsedSearch
	const availabilityOpts = $derived.by(() => {
		const parsed = parseSearch(page.url.searchParams); // ← duplicate parse!
		untrack(() => {
			fireCount_availabilityOpts++;
		});
		return orpc.booking.availabilityPublic.queryOptions({
			input: {
				startsAt: parsed.startsAt,
				endsAt: parsed.endsAt,
				passengers: parsed.passengers,
				includeUnavailable: true,
				sortBy: "newest",
				limit: 10,
				offset: 0,
			},
			context: {
				queryKey: [
					"booking.availabilityPublic",
					parsed.startsAt.toISOString(),
					parsed.endsAt.toISOString(),
					parsed.passengers,
				],
			},
		});
	});

	const availabilityOptsStore = writable(untrack(() => availabilityOpts));
	$effect(() => {
		untrack(() => {
			fireCount_store++;
		});
		availabilityOptsStore.set(availabilityOpts);
	});

	const availabilityQuery = createQuery(availabilityOptsStore);
	$effect(() => {
		// track query state changes
		const status = $availabilityQuery.status;
		const fetchStatus = $availabilityQuery.fetchStatus;
		untrack(() => {
			fireCount_query++;
			queryEvents = [
				{
					ts: Date.now(),
					status,
					fetchStatus,
				},
				...queryEvents.slice(0, 29),
			];
		});
	});

	/* ============================================================ */
	/*  PATTERN B — FIXED: reuse parsedSearch, stable queryKey     */
	/*  In fixed version, availabilityOpts uses parsedSearch        */
	/*  instead of calling parseSearch() again.                     */
	/* ============================================================ */
	let fireCount_fixed = $state(0);

	const availabilityOpts_fixed = $derived.by(() => {
		// Access parsedSearch once — if parsedSearch reference is stable (same object), this won't run
		const parsed = parsedSearch;
		untrack(() => {
			fireCount_fixed++;
		});
		return orpc.booking.availabilityPublic.queryOptions({
			input: {
				// Use the already-computed values from parsedSearch — no new Date()
				startsAt: parsed.startsAt,
				endsAt: parsed.endsAt,
				passengers: parsed.passengers,
				includeUnavailable: true,
				sortBy: "newest",
				limit: 10,
				offset: 0,
			},
		});
	});

	const availabilityOptsStore_fixed = writable(
		untrack(() => availabilityOpts_fixed)
	);
	$effect(() => {
		availabilityOptsStore_fixed.set(availabilityOpts_fixed);
	});

	const availabilityQuery_fixed = createQuery(availabilityOptsStore_fixed);

	/* ---- navigation helpers ---- */
	let queryEvents = $state<
		{ ts: number; status: string; fetchStatus: string }[]
	>([]);

	const navigate = (deltaHour: number) => {
		const sp = new URLSearchParams(page.url.searchParams);
		const current = Number.parseInt(sp.get("startHour") ?? "10", 10);
		sp.set("startHour", String(clamp(current + deltaHour, 0, 23)));
		goto(`/diagnostic/reactive-chain?${sp.toString()}`);
	};

	/* Scroll content — long enough to need scroll */
	const ITEMS = Array.from({ length: 80 }, (_, i) => i + 1);
</script>

<div class="mb-6">
	<h2 class="mb-1 text-xl font-bold">Reactive chain diagnosis</h2>
	<p class="text-sm text-muted-foreground">
		Two versions of the same boats-page query setup side-by-side. Counters show
		how many times each reactive node fires.
		<strong>Navigate (buttons below)</strong> to trigger URL changes, or just
		scroll to check if any counter increments without navigation.
	</p>
</div>

<!-- Navigation triggers -->
<div class="mb-4 flex flex-wrap gap-2">
	<button
		type="button"
		data-testid="reactive-nav-start-hour-dec"
		class="rounded border px-3 py-1 text-sm hover:bg-muted"
		onclick={() => navigate(-1)}
	>
		startHour −1
	</button>
	<button
		type="button"
		data-testid="reactive-nav-start-hour-inc"
		class="rounded border px-3 py-1 text-sm hover:bg-muted"
		onclick={() => navigate(1)}
	>
		startHour +1
	</button>
	<button
		type="button"
		data-testid="reactive-nav-same-url"
		class="rounded border px-3 py-1 text-sm hover:bg-muted"
		onclick={() => navigate(0)}
	>
		Same URL (no-op)
	</button>
</div>

<!-- Side-by-side counters -->
<div class="mb-6 grid gap-4 md:grid-cols-2">
	<!-- Pattern A — Original -->
	<div class="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
		<p class="mb-3 font-semibold text-destructive">
			Pattern A — Original (boats.svelte)
		</p>
		<table class="w-full text-sm">
			<thead>
				<tr class="border-b text-left text-xs text-muted-foreground">
					<th class="pb-1">Reactive node</th>
					<th class="pb-1 text-right">Fires</th>
				</tr>
			</thead>
			<tbody class="font-mono">
				<tr>
					<td class="py-0.5">parsedSearch $derived</td>
					<td
						class="py-0.5 text-right"
						data-testid="reactive-counter-parsed-search"
					>
						{fireCount_parsedSearch}
					</td>
				</tr>
				<tr>
					<td class="py-0.5">availabilityOpts $derived (dup parse)</td>
					<td
						class="py-0.5 text-right"
						data-testid="reactive-counter-availability-opts"
					>
						{fireCount_availabilityOpts}
					</td>
				</tr>
				<tr>
					<td class="py-0.5">store $effect</td>
					<td class="py-0.5 text-right" data-testid="reactive-counter-store">
						{fireCount_store}
					</td>
				</tr>
				<tr>
					<td class="py-0.5">query state $effect</td>
					<td class="py-0.5 text-right" data-testid="reactive-counter-query">
						{fireCount_query}
					</td>
				</tr>
				<tr class="border-t">
					<td class="pt-1">Query status</td>
					<td class="pt-1 text-right">{$availabilityQuery.status}</td>
				</tr>
			</tbody>
		</table>

		{#if fireCount_availabilityOpts > fireCount_parsedSearch}
			<p
				data-testid="reactive-warning-duplicate-parse"
				class="mt-2 rounded bg-destructive/10 px-2 py-1 text-xs text-destructive"
			>
				⚠ availabilityOpts fired more than parsedSearch — duplicate parse() is
				causing extra reactive work
			</p>
		{/if}
	</div>

	<!-- Pattern B — Fixed -->
	<div class="rounded-lg border border-emerald-400/40 bg-emerald-50 p-4">
		<p class="mb-3 font-semibold text-emerald-700">
			Pattern B — Fixed (reuses parsedSearch)
		</p>
		<table class="w-full text-sm">
			<thead>
				<tr class="border-b text-left text-xs text-muted-foreground">
					<th class="pb-1">Reactive node</th>
					<th class="pb-1 text-right">Fires</th>
				</tr>
			</thead>
			<tbody class="font-mono">
				<tr>
					<td class="py-0.5">parsedSearch $derived (shared)</td>
					<td
						class="py-0.5 text-right"
						data-testid="reactive-counter-parsed-search-fixed"
					>
						{fireCount_parsedSearch}
					</td>
				</tr>
				<tr>
					<td class="py-0.5">availabilityOpts_fixed $derived</td>
					<td class="py-0.5 text-right" data-testid="reactive-counter-fixed">
						{fireCount_fixed}
					</td>
				</tr>
				<tr class="border-t">
					<td class="pt-1">Query status</td>
					<td class="pt-1 text-right">{$availabilityQuery_fixed.status}</td>
				</tr>
			</tbody>
		</table>
	</div>
</div>

<!-- Query event log -->
<div class="mb-6">
	<p class="mb-2 text-sm font-semibold">Query state change log (Pattern A)</p>
	<div
		class="h-32 overflow-y-auto rounded border bg-white p-2 font-mono text-xs"
	>
		{#each queryEvents as ev (ev.ts)}
			<div class="flex gap-3">
				<span class="text-muted-foreground"
					>{new Date(ev.ts).toISOString().slice(11, 23)}</span
				>
				<span
					class={ev.fetchStatus === "fetching" ? "text-amber-600" : "text-emerald-700"}
				>
					{ev.status}/{ev.fetchStatus}
				</span>
			</div>
		{:else}
			<span class="text-muted-foreground">no events yet</span>
		{/each}
	</div>
	<p class="mt-1 text-xs text-muted-foreground">
		If entries appear here while you're only scrolling (no navigation), a
		reactive cycle is causing phantom query updates.
	</p>
</div>

<!-- Long scrollable list — jank becomes visible here if re-renders happen -->
<div class="rounded-lg border bg-white p-4">
	<p class="mb-3 text-sm font-semibold">
		Scroll target — {ITEMS.length} items. Watch the counters above while
		scrolling.
	</p>
	<ul class="space-y-2">
		{#each ITEMS as n (n)}
			<li
				class="flex items-center justify-between rounded border border-border/50 px-3 py-2 text-sm"
			>
				<span>List item #{n}</span>
				<span class="font-mono text-xs text-muted-foreground">
					parsedSearch fires: {fireCount_parsedSearch}
				</span>
			</li>
		{/each}
	</ul>
</div>
