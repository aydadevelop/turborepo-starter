<script lang="ts">
	const pages = [
		{
			id: "reactive-chain",
			href: "/diagnostic/reactive-chain",
			title: "Reactive chain",
			desc: "Reproduces the boats-page pattern: page.url.searchParams → $derived chain → writable store → createQuery. Measures how often each step fires and whether duplicate parseBoatsSearchState() calls cause redundant query updates.",
			suspects: [
				"Duplicate $derived parsing",
				"New Date objects breaking reference equality",
				"$effect → store → query chain",
			],
		},
		{
			id: "polling-render",
			href: "/diagnostic/polling-render",
			title: "Polling + scroll jank",
			desc: "TanStack Query with refetchInterval while a large list is scrollable. Measures render timestamps during scroll and whether polling causes visible jank.",
			suspects: [
				"refetchInterval triggers re-render of parent with large list",
				"State update on main thread during scroll",
			],
		},
		{
			id: "sse-render",
			href: "/diagnostic/sse-render",
			title: "SSE stream renders",
			desc: "Connects to the real notification SSE stream. Counts how many times the Header area re-renders when stream events arrive, and whether that causes jank during scroll.",
			suspects: [
				"consumeEventIterator events → notifications $state update → header re-render",
				"Multiple authClient.useSession() subscriptions",
			],
		},
		{
			id: "derived-stability",
			href: "/diagnostic/derived-stability",
			title: "Derived object stability",
			desc: "Shows the difference between $derived returning new objects vs stable primitives. Demonstrates whether Header's links array being recreated on every session tick causes unnecessary child re-renders.",
			suspects: [
				"$derived([...]) creates new array reference every cycle",
				"derived(sessionQuery, ...) creates new queryFn closures",
				"authClient.useSession() called in N components simultaneously",
			],
		},
	] as const;
</script>

<h1 class="mb-2 text-2xl font-bold">Performance diagnostics</h1>
<p class="mb-6 text-sm text-muted-foreground">
	Pages that isolate the suspected root causes of scroll jank. Open DevTools
	Performance tab, start recording, then scroll while a diagnostic page is open.
</p>

<div class="space-y-4">
	{#each pages as p (p.href)}
		<a
			href={p.href}
			data-testid={"diagnostic-card-" + p.id}
			class="block rounded-lg border border-border bg-white p-4 shadow-sm transition hover:border-primary"
		>
			<div class="mb-1 flex items-center justify-between gap-2">
				<span class="font-semibold" data-testid={"diagnostic-title-" + p.id}
					>{p.title}</span
				>
				<span class="font-mono text-xs text-muted-foreground">{p.href}</span>
			</div>
			<p class="mb-2 text-sm text-muted-foreground">{p.desc}</p>
			<div class="flex flex-wrap gap-1">
				{#each p.suspects as s (s)}
					<span
						class="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive"
					>
						{s}
					</span>
				{/each}
			</div>
		</a>
	{/each}
</div>
