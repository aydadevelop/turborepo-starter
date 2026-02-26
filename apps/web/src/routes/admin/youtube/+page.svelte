<script lang="ts">
	import { Badge } from "@my-app/ui/components/badge";
	import { Button } from "@my-app/ui/components/button";
	import * as Card from "@my-app/ui/components/card";
	import * as Table from "@my-app/ui/components/table";
	import { createMutation, createQuery } from "@tanstack/svelte-query";
	import { orpc, queryClient } from "$lib/orpc";

	// ── Queries ───────────────────────────────────────────────────────────────

	const statsQuery = createQuery(
		orpc.admin.youtube.pipelineStats.queryOptions({})
	);

	const stuckQuery = createQuery(
		orpc.admin.youtube.listStuck.queryOptions({
			input: { limit: 20, offset: 0, minAgeMinutes: 0 },
		})
	);

	const failedQuery = createQuery(
		orpc.admin.youtube.listFailed.queryOptions({
			input: { limit: 20, offset: 0 },
		})
	);

	// ── Mutations ─────────────────────────────────────────────────────────────

	let recoverResult = $state<{ requeued: number } | null>(null);
	let recoverFailedResult = $state<{
		requeued: number;
		skipped: number;
	} | null>(null);
	let recoverMissingResult = $state<{
		ingestRequeued: number;
		clusterRequeued: number;
	} | null>(null);
	let retryingId = $state<string | null>(null);

	const recoverMutation = createMutation(
		orpc.admin.youtube.recoverStuck.mutationOptions({
			onSuccess: (data) => {
				recoverResult = data;
				queryClient.invalidateQueries({ queryKey: orpc.admin.youtube.key() });
			},
		})
	);

	const recoverFailedMutation = createMutation(
		orpc.admin.youtube.recoverFailed.mutationOptions({
			onSuccess: (data) => {
				recoverFailedResult = data;
				queryClient.invalidateQueries({ queryKey: orpc.admin.youtube.key() });
			},
		})
	);

	const recoverMissingMutation = createMutation(
		orpc.admin.youtube.recoverMissingJobs.mutationOptions({
			onSuccess: (data) => {
				recoverMissingResult = data;
				queryClient.invalidateQueries({ queryKey: orpc.admin.youtube.key() });
			},
		})
	);

	const retryMutation = createMutation(
		orpc.admin.youtube.retryVideo.mutationOptions({
			onSuccess: () => {
				retryingId = null;
				queryClient.invalidateQueries({ queryKey: orpc.admin.youtube.key() });
			},
			onError: () => {
				retryingId = null;
			},
		})
	);

	// ── Helpers ───────────────────────────────────────────────────────────────

	const fmtDuration = (ms: number) => {
		if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
		if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
		return `${(ms / 3_600_000).toFixed(1)}h`;
	};

	const stats = $derived($statsQuery.data);
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h2 class="text-xl font-semibold">YouTube Pipeline</h2>
		<div class="flex gap-2">
			<Button
				variant="outline"
				size="sm"
				disabled={$recoverMissingMutation.isPending}
				onclick={() => $recoverMissingMutation.mutate({ minAgeMinutes: 0 })}
			>
				{$recoverMissingMutation.isPending
					? "Recovering…"
					: "Recover missing queue jobs"}
			</Button>
			<Button
				variant="outline"
				size="sm"
				disabled={$recoverFailedMutation.isPending}
				onclick={() => $recoverFailedMutation.mutate({ minAgeMinutes: 5 })}
			>
				{$recoverFailedMutation.isPending ? "Recovering…" : "Retry transient failures"}
			</Button>
			<Button
				variant="outline"
				size="sm"
				disabled={$recoverMutation.isPending}
				onclick={() => $recoverMutation.mutate({ minAgeMinutes: 0 })}
			>
				{$recoverMutation.isPending ? "Recovering…" : "Recover stuck now"}
			</Button>
		</div>
	</div>

	{#if recoverResult !== null}
		<p class="text-sm text-muted-foreground">
			Stuck recovery: re-queued
			{recoverResult.requeued} video{recoverResult.requeued === 1 ? "" : "s"}.
		</p>
	{/if}
	{#if recoverFailedResult !== null}
		<p class="text-sm text-muted-foreground">
			Transient recovery: {recoverFailedResult.requeued} re-queued,
			{recoverFailedResult.skipped} permanent/unknown skipped.
		</p>
	{/if}
	{#if recoverMissingResult !== null}
		<p class="text-sm text-muted-foreground">
			Missing-jobs recovery: {recoverMissingResult.ingestRequeued} ingest re-queued,
			{recoverMissingResult.clusterRequeued} cluster re-queued.
		</p>
	{/if}

	<!-- Pipeline stats ──────────────────────────────────────────────────── -->
	<div class="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
		{#each [
			{ key: "candidate", label: "Candidate" },
			{ key: "approved", label: "Approved" },
			{ key: "ingesting", label: "Ingesting" },
			{ key: "ingested", label: "Ingested" },
			{ key: "failed", label: "Failed" },
			{ key: "rejected", label: "Rejected" },
		] as stat (stat.key)}
			<Card.Root>
				<Card.Header class="pb-1 pt-3 px-4">
					<Card.Description class="text-xs">{stat.label}</Card.Description>
					<Card.Title class="text-2xl">
						{stats ? (stats[stat.key as keyof typeof stats] ?? 0) : "—"}
					</Card.Title>
				</Card.Header>
			</Card.Root>
		{/each}
	</div>

	<!-- Stuck in ingesting ──────────────────────────────────────────────── -->
	<div class="space-y-2">
		<h3 class="text-base font-medium">
			Stuck in "ingesting"
			{#if $stuckQuery.data}
				<span class="ml-1 text-sm font-normal text-muted-foreground">
					({$stuckQuery.data.total}
					total)
				</span>
			{/if}
		</h3>

		<Card.Root>
			<Card.Content class="p-0">
				{#if $stuckQuery.isPending}
					<p class="p-4 text-sm text-muted-foreground">Loading…</p>
				{:else if $stuckQuery.isError}
					<p class="p-4 text-sm text-destructive">Failed to load.</p>
				{:else if $stuckQuery.data?.items.length === 0}
					<p class="p-4 text-sm text-muted-foreground">
						No stuck videos — all clear.
					</p>
				{:else}
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>Title</Table.Head>
								<Table.Head>Org</Table.Head>
								<Table.Head>Stuck for</Table.Head>
								<Table.Head class="w-24">Action</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each $stuckQuery.data?.items ?? [] as v (v.id)}
								<Table.Row>
									<Table.Cell class="font-medium">
										<a
											href={`https://www.youtube.com/watch?v=${v.youtubeVideoId}`}
											target="_blank"
											rel="noopener noreferrer"
											class="hover:underline"
										>
											{v.title}
										</a>
									</Table.Cell>
									<Table.Cell class="text-xs text-muted-foreground font-mono">
										{v.organizationId.slice(0, 8)}…
									</Table.Cell>
									<Table.Cell>
										<Badge variant="secondary"
											>{fmtDuration(v.stuckForMs)}</Badge
										>
									</Table.Cell>
									<Table.Cell>
										<Button
											size="sm"
											variant="outline"
											disabled={retryingId === v.id || $retryMutation.isPending}
											onclick={() => {
												retryingId = v.id;
													$retryMutation.mutate({ videoId: v.id });
											}}
										>
											Retry
										</Button>
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>

	<!-- Failed videos ───────────────────────────────────────────────────── -->
	<div class="space-y-2">
		<h3 class="text-base font-medium">
			Failed videos
			{#if $failedQuery.data}
				<span class="ml-1 text-sm font-normal text-muted-foreground">
					({$failedQuery.data.total}
					total)
				</span>
			{/if}
		</h3>

		<Card.Root>
			<Card.Content class="p-0">
				{#if $failedQuery.isPending}
					<p class="p-4 text-sm text-muted-foreground">Loading…</p>
				{:else if $failedQuery.isError}
					<p class="p-4 text-sm text-destructive">Failed to load.</p>
				{:else if $failedQuery.data?.items.length === 0}
					<p class="p-4 text-sm text-muted-foreground">No failed videos.</p>
				{:else}
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>Title</Table.Head>
								<Table.Head>Org</Table.Head>
								<Table.Head>Stage</Table.Head>
								<Table.Head>Type</Table.Head>
								<Table.Head>Reason</Table.Head>
								<Table.Head>When</Table.Head>
								<Table.Head class="w-24">Action</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each $failedQuery.data?.items ?? [] as v (v.id)}
								<Table.Row>
									<Table.Cell class="font-medium">
										<a
											href={`https://www.youtube.com/watch?v=${v.youtubeVideoId}`}
											target="_blank"
											rel="noopener noreferrer"
											class="hover:underline"
										>
											{v.title}
										</a>
									</Table.Cell>
									<Table.Cell class="text-xs text-muted-foreground font-mono">
										{v.organizationId.slice(0, 8)}…
									</Table.Cell>
									<Table.Cell>
										{#if v.failedStage}
											<Badge variant="outline">{v.failedStage}</Badge>
										{:else}
											<span class="text-muted-foreground text-xs">—</span>
										{/if}
									</Table.Cell>
									<Table.Cell>
										{#if v.isTransient}
											<Badge variant="secondary">transient</Badge>
										{:else}
											<Badge variant="destructive">permanent</Badge>
										{/if}
									</Table.Cell>
									<Table.Cell
										class="max-w-xs truncate text-xs text-muted-foreground"
									>
										{v.failureReason ?? "—"}
									</Table.Cell>
									<Table.Cell
										class="text-xs text-muted-foreground whitespace-nowrap"
									>
										{new Date(v.updatedAt).toLocaleString()}
									</Table.Cell>
									<Table.Cell>
										<Button
											size="sm"
											variant="outline"
											disabled={retryingId === v.id || $retryMutation.isPending}
											onclick={() => {
												retryingId = v.id;
												$retryMutation.mutate({ videoId: v.id });
											}}
										>
											Retry
										</Button>
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>
</div>
