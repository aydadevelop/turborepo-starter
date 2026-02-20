<script lang="ts">
	/**
	 * Diagnostic: Derived object stability
	 *
	 * Demonstrates how $derived returning new object/array references on every
	 * computation cycle can cause downstream reactive nodes to fire unnecessarily.
	 *
	 * Three concrete patterns from the codebase:
	 *
	 * 1. Header.svelte: `links = $derived([...])` — new array every session tick
	 *    → {#each links} block re-renders full nav list on every session update.
	 *
	 * 2. Header.svelte: `derived(sessionQuery, ($sq) => ({ queryFn: async () => ... }))`
	 *    — new queryFn closure on every session update. TanStack Query may see this
	 *    as "options changed" even though queryKey is the same.
	 *
	 * 3. boats/+page.svelte: `parsedSearch` returns `{ startsAt: new Date(), endsAt: new Date() }`
	 *    — when parsedSearch is recomputed (e.g. page updates), Date objects are new
	 *    references even if they encode the same timestamp.
	 */
	import { untrack } from "svelte";
	import { derived, writable } from "svelte/store";
	import { authClient } from "$lib/auth-client";

	/* ---- session store (same as Header) ---- */
	const sessionQuery = authClient.useSession();

	/* ======================================================= */
	/*  1. Array reference stability                            */
	/* ======================================================= */

	/* UNSTABLE: recreates array each time derived runs */
	let navLinks_unstableFireCount = $state(0);
	const navLinks_unstable = $derived.by(() => {
		// access session to make this reactive
		const _session = $sessionQuery.data;
		untrack(() => navLinks_unstableFireCount++);
		// ← returns NEW ARRAY every time
		return [
			{ to: "/", label: "Home" },
			{ to: "/boats", label: "Boats" },
			{ to: "/bookings", label: "Bookings" },
			{ to: "/chat", label: "Chat" },
			{ to: "/dashboard", label: "Dashboard" },
		];
	});

	/* STABLE: early-exit if content unchanged */
	let navLinks_stableFireCount = $state(0);
	const STATIC_LINKS = [
		{ to: "/", label: "Home" },
		{ to: "/boats", label: "Boats" },
		{ to: "/bookings", label: "Bookings" },
		{ to: "/chat", label: "Chat" },
		{ to: "/dashboard", label: "Dashboard" },
	] as const;
	// Stable: the array reference never changes, derived only reads session to
	// decide whether to add conditional links.
	const navLinks_stable = $derived.by(() => {
		const isAdmin =
			($sessionQuery.data?.user as { role?: string } | undefined)?.role ===
			"admin";
		untrack(() => navLinks_stableFireCount++);
		if (!isAdmin)
			return STATIC_LINKS as readonly { to: string; label: string }[];
		return [...STATIC_LINKS, { to: "/admin", label: "Admin" }] as readonly {
			to: string;
			label: string;
		}[];
	});

	/* How many times has the {#each} block seen a new array reference? */
	let listRenderCount_unstable = $state(0);
	let listRenderCount_stable = $state(0);

	/* Track via effect — fires when the derived value changes identity */
	$effect(() => {
		const _arr = navLinks_unstable; // any change to array ref triggers this
		untrack(() => listRenderCount_unstable++);
	});
	$effect(() => {
		const _arr = navLinks_stable;
		untrack(() => listRenderCount_stable++);
	});

	/* ======================================================= */
	/*  2. queryFn closure identity in derived store           */
	/* ======================================================= */

	/*
	 * Header.svelte pattern (verbatim):
	 *
	 * const invitationsQueryOptions = derived(sessionQuery, ($sessionQuery) => ({
	 *   queryKey: ["user-invitations"],
	 *   queryFn: async () => { ... },   ← NEW function object every time!
	 *   enabled: Boolean($sessionQuery.data),
	 * }));
	 *
	 * Each time sessionQuery emits, a new options object is created with a new
	 * queryFn. TanStack Query uses the OPTIONS object as a whole — if it sees
	 * a new queryFn, it may schedule a re-fetch even though queryKey didn't change.
	 */
	let optionsChangeCount = $state(0);
	let previousQueryFn: (() => Promise<unknown>) | null = null;

	const simulatedOptions = derived(sessionQuery, ($sq) => {
		return {
			queryKey: ["user-invitations"],
			queryFn: () => {
				// This function is recreated on every session tick
				const enabled = Boolean($sq.data);
				return Promise.resolve({ enabled });
			},
			enabled: Boolean($sq.data),
		};
	});

	$effect(() => {
		const opts = $simulatedOptions;
		const qfnChanged =
			previousQueryFn !== null && opts.queryFn !== previousQueryFn;
		untrack(() => {
			optionsChangeCount++;
			previousQueryFn = opts.queryFn;
		});
		if (qfnChanged) {
			// This fires on every session update — a new queryFn is NOT the same ref
		}
	});

	/* ======================================================= */
	/*  3. Date object identity in parsed search state         */
	/* ======================================================= */

	const FAKE_SEARCH = new URLSearchParams("date=2026-03-15&startHour=10");

	let dateParseCount = $state(0);
	let dateReferenceChanges = $state(0);
	let lastStartsAt: Date | null = null;
	/* Artificial tick to simulate "page re-derives without URL change" */
	let simulationTick = $state(0);
	let simulationInterval: ReturnType<typeof setInterval> | null = null;

	/* Simulates what boats/+page.svelte does — parse on every $derived.by call */
	const parsedSearch_unstable = $derived.by(() => {
		// In boats.svelte, page.url.searchParams is the dependency.
		// Here we simulate via a reactive counter.
		const _trigger = simulationTick; // artificial dependency
		dateParseCount++;
		const date = FAKE_SEARCH.get("date") ?? "2026-03-15";
		const startHour = Number(FAKE_SEARCH.get("startHour") ?? "10");
		const startsAt = new Date(
			`${date}T${String(startHour).padStart(2, "0")}:00:00`
		);
		return { date, startHour, startsAt };
	});

	$effect(() => {
		const startsAt = parsedSearch_unstable.startsAt;
		const changed = lastStartsAt !== null && lastStartsAt !== startsAt;
		untrack(() => {
			if (changed) dateReferenceChanges++;
			lastStartsAt = startsAt;
		});
	});

	function startTickSimulation() {
		if (simulationInterval) return;
		simulationInterval = setInterval(() => {
			simulationTick++;
		}, 500);
	}
	function stopTickSimulation() {
		if (simulationInterval) {
			clearInterval(simulationInterval);
			simulationInterval = null;
		}
	}

	import { onMount } from "svelte";

	onMount(() => () => stopTickSimulation());
</script>

<div class="mb-6">
	<h2 class="mb-1 text-xl font-bold">Derived object stability</h2>
	<p class="text-sm text-muted-foreground">
		Shows how returning new object/array references from
		<code class="font-mono text-xs">$derived</code>
		causes downstream reactive nodes to fire even when the logical value hasn't
		changed.
	</p>
</div>

<!-- 1. Array stability -->
<div class="mb-6 rounded-lg border bg-white">
	<div class="border-b px-4 py-3">
		<p class="font-semibold">1. Nav links array identity</p>
		<p class="text-xs text-muted-foreground">Pattern from Header.svelte</p>
	</div>
	<div class="grid gap-4 p-4 sm:grid-cols-2">
		<div class="rounded border border-destructive/30 bg-destructive/5 p-3">
			<p class="mb-1 text-sm font-medium text-destructive">
				Unstable — new array each time
			</p>
			<p
				class="font-mono text-2xl font-bold"
				data-testid="derived-unstable-counter"
			>
				{listRenderCount_unstable}
			</p>
			<p class="text-xs text-muted-foreground">
				derived fires / list re-renders
			</p>
			<p class="mt-2 font-mono text-xs text-muted-foreground">
				$derived(() =&gt; [&#123;...&#125;, &#123;...&#125;])
			</p>
		</div>
		<div class="rounded border border-emerald-400/40 bg-emerald-50 p-3">
			<p class="mb-1 text-sm font-medium text-emerald-700">
				Stable — reuses constant
			</p>
			<p
				class="font-mono text-2xl font-bold"
				data-testid="derived-stable-counter"
			>
				{listRenderCount_stable}
			</p>
			<p class="text-xs text-muted-foreground">derived fires</p>
			<p class="mt-2 font-mono text-xs text-muted-foreground">
				const LINKS = [...]; $derived(LINKS)
			</p>
		</div>
	</div>
	{#if listRenderCount_unstable > listRenderCount_stable}
		<div class="border-t px-4 py-2">
			<p class="text-xs text-destructive">
				Unstable fired {listRenderCount_unstable - listRenderCount_stable}× more
				than stable — unnecessary list re-renders confirmed.
			</p>
		</div>
	{/if}
</div>

<!-- 2. queryFn closure -->
<div class="mb-6 rounded-lg border bg-white">
	<div class="border-b px-4 py-3">
		<p class="font-semibold">2. queryFn closure identity</p>
		<p class="text-xs text-muted-foreground">
			Pattern from Header.svelte invitationsQueryOptions
		</p>
	</div>
	<div class="p-4">
		<p class="mb-3 text-sm">
			<code class="font-mono">
				derived(sessionQuery, ($sq) =&gt; ({"{...}"} queryFn: async () =&gt;
				{"{...}"}))
			</code>
		</p>
		<div class="grid gap-3 sm:grid-cols-2">
			<div class="rounded border p-3">
				<p class="font-mono text-2xl font-bold">{optionsChangeCount}</p>
				<p class="text-xs text-muted-foreground">options objects created</p>
			</div>
			<div class="rounded border p-3">
				<p class="text-sm">
					Every <code class="font-mono text-xs">sessionQuery</code> emission
					produces a new options object with a new
					<code class="font-mono text-xs">queryFn</code> function reference.
					TanStack Query v5 uses structural equality for queryKey but takes the
					latest <code class="font-mono text-xs">queryFn</code> — this is
					harmless for caching but wastes allocations.
				</p>
			</div>
		</div>
	</div>
</div>

<!-- 3. Date identity -->
<div class="mb-6 rounded-lg border bg-white">
	<div class="border-b px-4 py-3">
		<p class="font-semibold">3. Date object identity in parseSearch()</p>
		<p class="text-xs text-muted-foreground">
			Pattern from boats/+page.svelte availabilityOpts
		</p>
	</div>
	<div class="p-4">
		<div class="mb-3 flex gap-3">
			<button
				type="button"
				data-testid="derived-start-ticks"
				class="rounded bg-primary px-3 py-1.5 text-sm text-white hover:bg-primary/90"
				onclick={startTickSimulation}
			>
				Start ticks (+1 per 500ms)
			</button>
			<button
				type="button"
				data-testid="derived-stop-ticks"
				class="rounded border px-3 py-1.5 text-sm hover:bg-muted"
				onclick={stopTickSimulation}
			>
				Stop
			</button>
			<span
				class="self-center text-sm text-muted-foreground"
				data-testid="derived-tick-value"
				>tick: {simulationTick}</span
			>
		</div>
		<div class="grid gap-3 sm:grid-cols-3">
			<div class="rounded border p-3">
				<p
					class="font-mono text-2xl font-bold"
					data-testid="derived-date-parse-count"
				>
					{dateParseCount}
				</p>
				<p class="text-xs text-muted-foreground">parseSearch() calls</p>
			</div>
			<div class="rounded border p-3">
				<p
					class="font-mono text-2xl font-bold"
					data-testid="derived-date-ref-change-count"
				>
					{dateReferenceChanges}
				</p>
				<p class="text-xs text-muted-foreground">startsAt reference changes</p>
			</div>
			<div class="rounded border border-amber-300 bg-amber-50 p-3">
				<p class="text-xs text-amber-800">
					Each tick fires parseSearch() → new
					<code class="font-mono">Date</code> object →
					<code class="font-mono">startsAt !== lastStartsAt</code> even if same
					timestamp → downstream <code class="font-mono">availabilityOpts</code>
					sees new input →<code class="font-mono">$effect</code> fires → store
					updates → query re-checks options.
				</p>
			</div>
		</div>
		<p class="mt-3 text-xs text-muted-foreground">
			Fix: in <code class="font-mono">availabilityOpts</code>, read from
			<code class="font-mono">parsedSearch</code> (already computed) instead of
			calling
			<code class="font-mono">parseSearch(page.url.searchParams)</code> again.
			The
			<code class="font-mono">parsedSearch</code>
			$derived will still produce new Date refs on URL change, but at least
			won't double-fire.
		</p>
	</div>
</div>

<!-- Summary -->
<div class="rounded-lg border border-primary/20 bg-primary/5 p-4">
	<p class="mb-2 font-semibold text-primary">Recommended fixes</p>
	<ol class="list-decimal space-y-2 pl-4 text-sm">
		<li>
			<strong>boats/+page.svelte</strong> — In
			<code class="font-mono text-xs">availabilityOpts</code>, use
			<code class="font-mono text-xs">parsedSearch</code> instead of re-calling
			<code class="font-mono text-xs">
				parseBoatsSearchState(page.url.searchParams)
			</code>
			.
		</li>
		<li>
			<strong>Header.svelte</strong> — Move
			<code class="font-mono text-xs">const STATIC_LINKS</code>
			outside the component and only rebuild when auth-dependent links change.
			Alternatively, separate static links from conditional links.
		</li>
		<li>
			<strong>Header.svelte + NotificationCenter.svelte</strong> — Call
			<code class="font-mono text-xs">authClient.useSession()</code>
			once in Header and pass the result as a
			<code class="font-mono text-xs">sessionQuery</code>
			prop to NotificationCenter to avoid two concurrent subscriptions.
		</li>
		<li>
			<strong>Polling pages (bookings)</strong> — Do not embed reactive counters
			or query state in list item data. Keep list items stable; show status
			separately above the list.
		</li>
	</ol>
</div>
