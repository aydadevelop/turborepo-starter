<script lang="ts">
	/**
	 * Diagnostic: SSE stream render impact
	 *
	 * Connects to the real notification stream (same code as NotificationCenter)
	 * and measures how many times state updates occur per SSE event.
	 *
	 * Suspected issues:
	 * 1. Each SSE event updates `notifications` $state array → triggers Svelte update
	 *    for NotificationCenter AND potentially causes parent Header re-render.
	 * 2. authClient.useSession() is called independently in Header and NotificationCenter.
	 *    Two separate subscriptions to the same session store can cause double renders
	 *    when session changes.
	 * 3. The stream reconnects on error — reconnect surge (rapid event flood) can cause
	 *    multiple synchronous state updates.
	 */
	import { consumeEventIterator } from "@orpc/client";
	import { untrack } from "svelte";
	import { authClient } from "$lib/auth-client";
	import {
		deriveCursorMs,
		type InAppNotificationItem,
		mergeNotificationItems,
		type NotificationStreamState,
		sortNotificationsByDeliveredAtDesc,
	} from "$lib/notification-center";
	import { client } from "$lib/orpc";

	/* ---- session (mirrors NotificationCenter) ---- */
	const sessionQuery = authClient.useSession();

	/* ---- stream state (exact copy of NotificationCenter logic) ---- */
	let streamState = $state<NotificationStreamState>("idle");
	let notifications = $state<InAppNotificationItem[]>([]);
	let cursorMs = $state(0);
	let currentUserId = $state<string | null>(null);
	let stopStream: (() => Promise<void>) | null = null;

	/* ---- counters ---- */
	let sessionUpdateCount = $state(0);
	let streamEventCount = $state(0);
	let stateUpdateCount = $state(0); // how many times $state mutates
	let streamEvents = $state<
		{ ts: number; kind: string; itemCount?: number; latencyMs?: number }[]
	>([]);

	let lastEventAt: number | null = null;

	function recordStreamEvent(kind: string, extra?: { itemCount?: number }) {
		const now = Date.now();
		const latencyMs = lastEventAt ? now - lastEventAt : null;
		lastEventAt = now;
		streamEvents = [
			{
				ts: now,
				kind,
				itemCount: extra?.itemCount,
				latencyMs: latencyMs ?? undefined,
			},
			...streamEvents.slice(0, 99),
		];
	}

	/* ---- session tracker ---- */
	$effect(() => {
		const _session = $sessionQuery.data;
		untrack(() => {
			sessionUpdateCount++;
		});
	});

	/* ---- stream management (mirrors NotificationCenter) ---- */
	function startStream() {
		if (!currentUserId || stopStream) return;
		streamState = "connecting";

		stopStream = consumeEventIterator(
			client.notifications.streamMe({
				limit: 20,
				since: cursorMs > 0 ? cursorMs : undefined,
			}),
			{
				onEvent: (event) => {
					streamEventCount++;
					streamState = "connected";

					if (event.kind === "ready") {
						recordStreamEvent("ready");
						if (event.since > 0) {
							cursorMs = Math.max(cursorMs, event.since);
						}
						return;
					}

					if (event.kind === "snapshot" && event.scope === "me") {
						const items = event.items as InAppNotificationItem[];
						untrack(() => {
							stateUpdateCount++;
						});
						recordStreamEvent("snapshot", { itemCount: items.length });
						notifications = mergeNotificationItems(notifications, items);
						cursorMs = Math.max(cursorMs, event.since > 0 ? event.since : 0);
					}
				},
				onError: (error) => {
					console.error("Diagnostic SSE stream error", error);
					recordStreamEvent("error");
					streamState = "error";
				},
				onFinish: () => {
					recordStreamEvent("finish");
					stopStream = null;
				},
			}
		);
	}

	function closeStream() {
		if (stopStream) {
			stopStream().catch(console.error);
			stopStream = null;
		}
		streamState = "idle";
	}

	/* ---- session → stream lifecycle ---- */
	$effect(() => {
		const nextUserId = $sessionQuery.data?.user?.id ?? null;
		if (nextUserId === currentUserId) return;
		currentUserId = nextUserId;
		closeStream();
		if (currentUserId) startStream();
	});

	import { onMount } from "svelte";

	onMount(() => {
		return () => closeStream();
	});

	/* ---- Simulate rapid state mutations to test if batching works ---- */
	let simulationRunning = $state(false);
	let simulationCount = $state(0);

	async function runSimulation() {
		simulationRunning = true;
		simulationCount = 0;
		// Simulate 10 rapid state updates (like a burst of SSE events arriving)
		for (let i = 0; i < 10; i++) {
			// Each iteration creates a fake notification item and merges it
			const fakeItem: InAppNotificationItem = {
				id: `sim-${Date.now()}-${i}`,
				title: `Simulated event #${i + 1}`,
				body: "Simulated SSE event",
				severity: "info",
				deliveredAt: new Date(Date.now() - i * 1000).toISOString(),
				viewedAt: null,
				ctaUrl: null,
			};
			notifications = mergeNotificationItems(notifications, [fakeItem]);
			simulationCount++;
			// No await — all 10 fire synchronously to test if Svelte batches them
		}
		// In Svelte 5, multiple synchronous $state mutations ARE batched.
		// This test verifies that — you should see only 1 DOM update for all 10.
		await Promise.resolve(); // yield to microtask queue
		simulationRunning = false;
		recordStreamEvent("simulation-complete", { itemCount: 10 });
		untrack(() => {
			stateUpdateCount++;
		});
	}

	/* ---- long scrollable list ---- */
	const ITEMS = Array.from({ length: 80 }, (_, i) => i + 1);

	/* ---- formatted notifications for display ---- */
	const sortedNotifications = $derived(
		sortNotificationsByDeliveredAtDesc(notifications)
	);
</script>

<div class="mb-6">
	<h2 class="mb-1 text-xl font-bold">SSE stream render impact</h2>
	<p class="text-sm text-muted-foreground">
		Connects to the real notification stream. Shows how many times SSE events
		trigger state updates and whether Svelte 5 batches rapid mutations.
		{#if !$sessionQuery.data?.user}
			<strong class="text-amber-600">
				⚠ You are not signed in — stream will not connect. Sign in first.
			</strong>
		{/if}
	</p>
</div>

<!-- Status row -->
<div class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
	<div class="rounded-lg border bg-white p-3 text-center">
		<p
			class="text-lg font-bold {streamState === 'connected'
				? 'text-emerald-600'
				: streamState === 'connecting'
					? 'text-amber-600'
					: streamState === 'error'
						? 'text-destructive'
						: 'text-muted-foreground'}"
		>
			{streamState}
		</p>
		<p class="text-xs text-muted-foreground">Stream state</p>
	</div>
	<div class="rounded-lg border bg-white p-3 text-center">
		<p class="text-2xl font-bold">{streamEventCount}</p>
		<p class="text-xs text-muted-foreground">SSE events received</p>
	</div>
	<div class="rounded-lg border bg-white p-3 text-center">
		<p class="text-2xl font-bold">{stateUpdateCount}</p>
		<p class="text-xs text-muted-foreground">$state mutations</p>
	</div>
	<div class="rounded-lg border bg-white p-3 text-center">
		<p class="text-2xl font-bold">{sessionUpdateCount}</p>
		<p class="text-xs text-muted-foreground">Session store updates</p>
	</div>
</div>

<!-- Simulation -->
<div class="mb-4 rounded-lg border bg-white p-4">
	<p class="mb-2 text-sm font-semibold">Svelte 5 batch mutation test</p>
	<p class="mb-3 text-xs text-muted-foreground">
		Fires 10 synchronous <code class="font-mono">notifications =</code>
		mutations. In Svelte 5 these should be batched into 1 DOM update. Watch
		DevTools Performance → "Update" events.
	</p>
	<button
		type="button"
		class="rounded bg-primary px-3 py-1.5 text-sm text-white hover:bg-primary/90 disabled:opacity-50"
		disabled={simulationRunning}
		onclick={runSimulation}
	>
		{simulationRunning ? "Running…" : "Run 10-event simulation"}
	</button>
	{#if simulationCount > 0}
		<span class="ml-3 text-sm text-emerald-700"
			>{simulationCount} mutations fired</span
		>
	{/if}
</div>

<!-- Session duplicate subscription diagnostic -->
<div class="mb-4 rounded-lg border bg-amber-50 p-4">
	<p class="mb-1 text-sm font-semibold text-amber-800">
		⚠ Dual useSession() subscription issue
	</p>
	<p class="text-xs text-muted-foreground">
		In production, <code class="font-mono">Header.svelte</code> and
		<code class="font-mono">NotificationCenter.svelte</code> each call
		<code class="font-mono">authClient.useSession()</code>
		independently. This page shows that session updates fire
		<strong>{sessionUpdateCount}×</strong> here alone. In the real layout, it
		fires twice per session tick (once per component). The fix is to pass the
		session as a prop from Header → NotificationCenter.
	</p>
</div>

<!-- Stream event log -->
<details class="mb-4" open>
	<summary class="cursor-pointer text-sm font-semibold">
		Stream event log
	</summary>
	<div
		class="mt-2 h-40 overflow-y-auto rounded border bg-white p-2 font-mono text-xs"
	>
		{#each streamEvents as ev (ev.ts)}
			<div class="flex gap-2">
				<span class="shrink-0 text-muted-foreground"
					>{new Date(ev.ts).toISOString().slice(11, 23)}</span
				>
				<span
					class={ev.kind === "snapshot"
						? "text-primary"
						: ev.kind === "error"
							? "text-destructive"
							: "text-muted-foreground"}
				>
					{ev.kind}
					{#if ev.itemCount !== undefined}
						({ev.itemCount} items)
					{/if}
					{#if ev.latencyMs !== undefined}
						+{ev.latencyMs}ms
					{/if}
				</span>
			</div>
		{:else}
			<span class="text-muted-foreground">no events</span>
		{/each}
	</div>
</details>

<!-- Active notifications -->
{#if sortedNotifications.length > 0}
	<div class="mb-4 rounded-lg border bg-white p-4">
		<p class="mb-2 text-sm font-semibold">
			Current notifications ({sortedNotifications.length})
		</p>
		<ul class="space-y-1">
			{#each sortedNotifications as n (n.id)}
				<li class="rounded border border-border/50 px-2 py-1 text-xs">
					{n.title} — {new Date(n.deliveredAt).toISOString().slice(11, 19)}
				</li>
			{/each}
		</ul>
	</div>
{/if}

<!-- Long scrollable list to expose scroll jank -->
<div class="rounded-lg border bg-white p-4">
	<p class="mb-3 text-sm font-semibold">
		Scroll target — {ITEMS.length} items. If SSE events arrive while scrolling,
		check for jank.
	</p>
	<ul class="space-y-2">
		{#each ITEMS as n (n)}
			<li
				class="flex justify-between rounded border border-border/50 px-3 py-2 text-sm"
			>
				<span>Row #{n}</span>
				<span class="font-mono text-xs text-muted-foreground">
					events: {streamEventCount}
				</span>
			</li>
		{/each}
	</ul>
</div>
