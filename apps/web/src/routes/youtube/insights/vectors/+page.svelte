<script lang="ts">
	import { Button } from "@my-app/ui/components/button";
	import * as Card from "@my-app/ui/components/card";
	import { Badge } from "@my-app/ui/components/badge";
	import { ChartContainer, type ChartConfig } from "@my-app/ui/components/chart";
	import { createQuery } from "@tanstack/svelte-query";
	import { writable, derived } from "svelte/store";
	import { resolve } from "$app/paths";
	import { orpc } from "$lib/orpc";
	import { Chart, Points, Axis, Grid, Svg, Tooltip, Highlight } from "layerchart";
	import { scaleOrdinal } from "d3-scale";

	const typeColorDomain = [
		"bug", "ux_friction", "confusion", "praise", "suggestion",
		"performance", "crash", "exploit", "other",
	];
	const typeColorRange = [
		"oklch(0.637 0.237 25.331)",
		"oklch(0.705 0.213 47.604)",
		"oklch(0.795 0.184 86.047)",
		"oklch(0.723 0.219 149.579)",
		"oklch(0.685 0.169 237.323)",
		"oklch(0.606 0.25 292.717)",
		"oklch(0.645 0.246 16.439)",
		"oklch(0.553 0.013 286.067)",
		"oklch(0.708 0.014 286.067)",
	];

	const chartConfig: ChartConfig = Object.fromEntries(
		typeColorDomain.map((key, i) => [
			key,
			{ label: key.replace(/_/g, " "), color: typeColorRange[i] },
		])
	);

	const colorScale = scaleOrdinal(typeColorDomain, typeColorRange);

	// ─── Color mode ──────────────────────────────────────────────────────────
	type ColorMode = "type" | "cluster";
	let colorMode = $state<ColorMode>("type");

	// ─── Projection method ───────────────────────────────────────────────────
	type Method = "pca" | "pacmap";
	const method = writable<Method>("pca");

	// Generate visually distinct cluster colors.
	// Strategy: interleave hues by jumping half the circle each step (like a
	// bit-reversal permutation), then alternate between two lightness/chroma
	// tiers so adjacent-indexed clusters never look similar even at high counts.
	const generateClusterColors = (ids: string[]) => {
		const n = ids.filter(Boolean).length || 1;
		// Tiers: [high-lightness high-chroma, low-lightness mid-chroma]
		const tiers = [
			{ l: 0.72, c: 0.22 },
			{ l: 0.52, c: 0.20 },
			{ l: 0.65, c: 0.16 },
		];
		return ids.map((_, i) => {
			// Spread hues: multiply by golden angle fraction to maximize separation
			const hue = Math.round((i * 137.508) % 360);
			const tier = tiers[i % tiers.length]!;
			return `oklch(${tier.l} ${tier.c} ${hue})`;
		});
	};

	// ─── Data Query ──────────────────────────────────────────────────────────

	const projectionQueryOptions = derived(method, ($m) =>
		orpc.youtube.vectors.projection.queryOptions({ input: { limit: 5000, method: $m } })
	);
	const projectionQuery = createQuery(projectionQueryOptions);

	const points = $derived($projectionQuery.data?.points ?? []);
	const totalVectorized = $derived($projectionQuery.data?.totalVectorized ?? 0);

	// Cluster grouping for stats
	const clusterCount = $derived(
		new Set(points.filter((p) => p.clusterId).map((p) => p.clusterId)).size
	);
	const typeCount = $derived(new Set(points.map((p) => p.type)).size);

	// Cluster color domain/range (derived so they update when points load)
	const clusterColorDomain = $derived(
		[...new Set(points.map((p) => p.clusterId ?? "unclustered"))]
	);
	const clusterColorRange = $derived(generateClusterColors(clusterColorDomain));
	const clusterScale = $derived(scaleOrdinal(clusterColorDomain, clusterColorRange));

	// Active color props fed to Chart
	const activeC = $derived(colorMode === "type" ? "type" : "clusterId");
	const activeCDomain = $derived(colorMode === "type" ? typeColorDomain : clusterColorDomain);
	const activeCRange = $derived(colorMode === "type" ? typeColorRange : clusterColorRange);
	const activeScale = $derived(colorMode === "type" ? colorScale : clusterScale);

	const typeLabel = (type: string | null) => {
		if (!type) return "—";
		return type.replace(/_/g, " ");
	};

	// ─── Pinned selection ────────────────────────────────────────────────────
	type Point = (typeof points)[0];
	let selectedPoint = $state<Point | null>(null);

	const severityVariant = (s: string | null) => {
		if (s === "critical") return "destructive" as const;
		if (s === "high") return "destructive" as const;
		if (s === "medium") return "secondary" as const;
		return "outline" as const;
	};
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between gap-3">
		<div>
			<h2 class="text-2xl font-bold">Vector Space</h2>
			<p class="text-sm text-muted-foreground">
				{$method === 'pacmap' ? 'PaCMAP' : 'PCA'} projection of signal embedding vectors onto 2D. Each dot is a signal.
			</p>
		</div>
		<Button variant="outline" href={resolve("/youtube/insights")}>Back to List</Button>
	</div>

	<!-- Color mode + Projection method toggles + Legend -->
	<Card.Root>
		<Card.Content class="flex flex-wrap items-center gap-4 p-4">
			<!-- Projection method -->
			<div class="flex items-center gap-1 rounded-md border p-0.5">
				<button
					type="button"
					class="rounded px-3 py-1 text-xs font-medium transition-colors {$method === 'pca' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}"
					onclick={() => method.set('pca')}
				>PCA</button>
				<button
					type="button"
					class="rounded px-3 py-1 text-xs font-medium transition-colors {$method === 'pacmap' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}"
					onclick={() => method.set('pacmap')}
				>PaCMAP</button>
			</div>

			<!-- Color mode -->
			<div class="flex items-center gap-1 rounded-md border p-0.5">
				<button
					type="button"
					class="rounded px-3 py-1 text-xs font-medium transition-colors {colorMode === 'type' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}"
					onclick={() => { colorMode = 'type'; }}
				>By Type</button>
				<button
					type="button"
					class="rounded px-3 py-1 text-xs font-medium transition-colors {colorMode === 'cluster' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}"
					onclick={() => { colorMode = 'cluster'; }}
				>By Cluster</button>
			</div>

			<!-- Color mode -->
			<div class="flex items-center gap-1 rounded-md border p-0.5">
			{#if colorMode === 'type'}
				<div class="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
					{#each typeColorDomain as type, i}
						<span class="flex items-center gap-1">
							<span class="inline-block h-2.5 w-2.5 rounded-full" style="background: {typeColorRange[i]}"></span>
							{type.replace(/_/g, " ")}
						</span>
					{/each}
				</div>
			{:else}
				<div class="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
					{#each clusterColorDomain as id, i}
						<span class="flex items-center gap-1">
							<span class="inline-block h-2.5 w-2.5 rounded-full" style="background: {clusterColorRange[i]}"></span>
							{id === 'unclustered' ? 'unclustered' : id.slice(0, 8)}
						</span>
					{/each}
				</div>
			{/if}
			</div>
		</Card.Content>
	</Card.Root>

	<!-- Vector Scatter -->
	<Card.Root>
		<Card.Header>
			<Card.Title>Embedding Space (PCA)</Card.Title>
			<Card.Description>
					{points.length} signals projected from 1536-dim embeddings to 2D via PCA.
					Color = {colorMode === 'type' ? 'signal type' : 'cluster'}.
				Hover to preview · <strong>click to pin</strong> a signal panel.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if $projectionQuery.isPending}
				<div class="flex h-96 items-center justify-center text-sm text-muted-foreground">
					Loading vectors and computing projection...
				</div>
			{:else if $projectionQuery.isError}
				<div class="flex h-96 flex-col items-center justify-center gap-2 text-sm">
					<p class="text-destructive">Failed to load vector projection.</p>
					<p class="text-muted-foreground">{$projectionQuery.error?.message}</p>
				</div>
			{:else if points.length === 0}
				<div class="flex h-96 items-center justify-center text-sm text-muted-foreground">
					No vectorized signals found.
				</div>
			{:else}
				<ChartContainer config={chartConfig} class="h-[560px] w-full">
					<Chart
						data={points}
						x="x"
						y="y"
						c={activeC}
						cDomain={activeCDomain}
						cRange={activeCRange}
						padding={{ top: 20, right: 20, bottom: 40, left: 50 }}
						tooltip={{
							mode: "voronoi",
							onclick: (_e: MouseEvent, { data }: { data: Point }) => {
								selectedPoint = data;
							},
						}}
					>
						<Svg>
							<Axis placement="bottom" label="PC1" />
							<Axis placement="left" label="PC2" />
							<Grid x y />
							<Points r={5} fillOpacity={0.6} strokeWidth={1} />
							<Highlight points lines={false} />
						</Svg>
						<Tooltip.Root>
							{#snippet children({ data }: { data: Point })}
								{#if data}
									<Tooltip.Header>
										<span class="max-w-[280px] truncate text-xs font-normal">{data.text}</span>
									</Tooltip.Header>
									<Tooltip.List>
										<Tooltip.Item label="Type" value={typeLabel(data.type)} />
										{#if data.severity}
											<Tooltip.Item label="Severity" value={data.severity} />
										{/if}
										{#if data.confidence != null}
											<Tooltip.Item label="Confidence" value="{data.confidence}%" />
										{/if}
										{#if data.component}
											<Tooltip.Item label="Component" value={data.component} />
										{/if}
										{#if data.clusterId}
											<Tooltip.Item label="Cluster" value={data.clusterId.slice(0, 8)} />
										{/if}
									</Tooltip.List>
									<p class="mt-1.5 px-2 pb-1.5 text-[10px] text-muted-foreground">Click to pin this signal</p>
								{/if}
							{/snippet}
						</Tooltip.Root>
					</Chart>
				</ChartContainer>
			{/if}
		</Card.Content>
	</Card.Root>

	<!-- Pinned Signal Panel -->
	{#if selectedPoint}
		{@const p = selectedPoint}
		{@const clusterHref = p.clusterId ? resolve(`/youtube/insights/${p.clusterId}`) : null}
		<Card.Root class="border-primary/40 bg-primary/5">
			<Card.Header class="pb-3">
				<div class="flex items-start justify-between gap-3">
					<div class="flex flex-wrap items-center gap-2">
						<span
							class="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
							style="background: {colorMode === 'cluster' ? activeScale(p.clusterId ?? 'unclustered') : colorScale(p.type ?? 'other')}"
						></span>
						<span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
							{typeLabel(p.type)}
						</span>
						{#if p.severity}
							<Badge variant={severityVariant(p.severity)} class="text-xs">{p.severity}</Badge>
						{/if}
					</div>
					<button
						type="button"
						class="shrink-0 text-xs text-muted-foreground hover:text-foreground"
						onclick={() => { selectedPoint = null; }}
					>
						✕ Dismiss
					</button>
				</div>
				<Card.Title class="mt-2 text-base font-normal leading-snug">{p.text}</Card.Title>
			</Card.Header>
			<Card.Content class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
				{#if p.component}
					<div>
						<p class="text-xs text-muted-foreground">Component</p>
						<p class="font-medium">{p.component}</p>
					</div>
				{/if}
				{#if p.confidence != null}
					<div>
						<p class="text-xs text-muted-foreground">Confidence</p>
						<p class="font-medium">{p.confidence}%</p>
					</div>
				{/if}
				{#if p.severityScore != null}
					<div>
						<p class="text-xs text-muted-foreground">Severity Score</p>
						<p class="font-medium">{p.severityScore}</p>
					</div>
				{/if}
				{#if p.clusterId}
					<div>
						<p class="text-xs text-muted-foreground">Cluster ID</p>
						<p class="font-mono text-xs">{p.clusterId.slice(0, 12)}…</p>
					</div>
				{/if}
			</Card.Content>
			{#if clusterHref}
				<Card.Footer class="pt-0">
					<Button href={clusterHref} variant="default" size="sm">
						View Cluster →
					</Button>
				</Card.Footer>
			{/if}
		</Card.Root>
	{/if}

	<!-- Stats Summary -->
	<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
		<Card.Root>
			<Card.Content class="p-4">
				<p class="text-sm text-muted-foreground">Plotted</p>
				<p class="text-2xl font-bold tabular-nums">{points.length}</p>
			</Card.Content>
		</Card.Root>
		<Card.Root>
			<Card.Content class="p-4">
				<p class="text-sm text-muted-foreground">Total Vectorized</p>
				<p class="text-2xl font-bold tabular-nums">{totalVectorized}</p>
			</Card.Content>
		</Card.Root>
		<Card.Root>
			<Card.Content class="p-4">
				<p class="text-sm text-muted-foreground">Clusters</p>
				<p class="text-2xl font-bold tabular-nums">{clusterCount}</p>
			</Card.Content>
		</Card.Root>
		<Card.Root>
			<Card.Content class="p-4">
				<p class="text-sm text-muted-foreground">Types</p>
				<p class="text-2xl font-bold tabular-nums">{typeCount}</p>
			</Card.Content>
		</Card.Root>
	</div>
</div>
