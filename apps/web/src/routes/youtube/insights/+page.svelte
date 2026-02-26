<script lang="ts">
	import { Badge } from "@my-app/ui/components/badge";
	import { Button } from "@my-app/ui/components/button";
	import * as Card from "@my-app/ui/components/card";
	import * as Dialog from "@my-app/ui/components/dialog";
	import { Input } from "@my-app/ui/components/input";
	import { Label } from "@my-app/ui/components/label";
	import * as Select from "@my-app/ui/components/select";
	import * as Table from "@my-app/ui/components/table";
	import * as Tabs from "@my-app/ui/components/tabs";
	import { createMutation, createQuery } from "@tanstack/svelte-query";
	import { derived, writable } from "svelte/store";
	import { resolve } from "$app/paths";
	import { orpc, queryClient } from "$lib/orpc";

	type ViewMode = "all" | "clustered" | "ungrouped";
	type ClusterState =
		| "open"
		| "acknowledged"
		| "in_progress"
		| "fixed"
		| "ignored"
		| "regression";
	type ClusterType =
		| "bug"
		| "ux_friction"
		| "confusion"
		| "praise"
		| "suggestion"
		| "performance"
		| "crash"
		| "exploit"
		| "other";
	type ClusterSeverity = "critical" | "high" | "medium" | "low" | "info";
	type ClusterSortBy = "impactScore" | "signalCount" | "createdAt";
	type SortDir = "asc" | "desc";

	const clusterStates: ClusterState[] = [
		"open",
		"acknowledged",
		"in_progress",
		"fixed",
		"ignored",
		"regression",
	];
	const signalTypes: ClusterType[] = [
		"bug",
		"ux_friction",
		"confusion",
		"praise",
		"suggestion",
		"performance",
		"crash",
		"exploit",
		"other",
	];
	const severityLevels: ClusterSeverity[] = [
		"critical",
		"high",
		"medium",
		"low",
		"info",
	];

	const stateLanes: Array<{ label: string; value?: ClusterState }> = [
		{ label: "All" },
		{ label: "Open", value: "open" },
		{ label: "In Progress", value: "in_progress" },
		{ label: "Regression", value: "regression" },
		{ label: "Fixed", value: "fixed" },
		{ label: "Ignored", value: "ignored" },
	];

	let activeView = $state<ViewMode>("all");

	// ─── Filter State ────────────────────────────────────────────────────────

	const search = writable("");
	const stateFilter = writable<ClusterState | undefined>(undefined);
	const typeFilter = writable<ClusterType | undefined>(undefined);
	const severityFilter = writable<ClusterSeverity | undefined>(undefined);
	const sortBy = writable<ClusterSortBy>("impactScore");
	const sortDir = writable<SortDir>("desc");
	const clusterOffset = writable(0);
	const ungroupedOffset = writable(0);
	const limit = 20;

	// ─── Data Queries ────────────────────────────────────────────────────────

	const clustersQuery = createQuery(
		derived(
			[
				search,
				stateFilter,
				typeFilter,
				severityFilter,
				sortBy,
				sortDir,
				clusterOffset,
			],
			([$search, $state, $type, $severity, $sortBy, $sortDir, $offset]) =>
				orpc.youtube.clusters.list.queryOptions({
					input: {
						search: $search || undefined,
						state: $state,
						type: $type,
						severity: $severity,
						sortBy: $sortBy,
						sortDir: $sortDir,
						limit,
						offset: $offset,
					},
				})
		)
	);

	const ungroupedSignalsQuery = createQuery(
		derived(
			[search, typeFilter, severityFilter, ungroupedOffset],
			([$search, $type, $severity, $offset]) =>
				orpc.youtube.signals.list.queryOptions({
					input: {
						search: $search || undefined,
						type: $type,
						severity: $severity,
						clustered: false,
						sortBy: "createdAt",
						sortDir: "desc",
						limit,
						offset: $offset,
					},
				})
		)
	);

	const clusterStatsQuery = createQuery(
		derived(
			[search, typeFilter, severityFilter],
			([$search, $type, $severity]) =>
				orpc.youtube.clusters.stats.queryOptions({
					input: {
						search: $search || undefined,
						type: $type,
						severity: $severity,
					},
				})
		)
	);

	const ungroupedSignalsStatsQuery = createQuery(
		derived(
			[search, typeFilter, severityFilter],
			([$search, $type, $severity]) =>
				orpc.youtube.signals.stats.queryOptions({
					input: {
						search: $search || undefined,
						type: $type,
						severity: $severity,
						clustered: false,
					},
				})
		)
	);

	const stateLaneCounts = derived(clusterStatsQuery, ($clusterStatsQuery) => ({
		total: $clusterStatsQuery.data?.total ?? 0,
		open: $clusterStatsQuery.data?.byState.open ?? 0,
		acknowledged: $clusterStatsQuery.data?.byState.acknowledged ?? 0,
		in_progress: $clusterStatsQuery.data?.byState.in_progress ?? 0,
		fixed: $clusterStatsQuery.data?.byState.fixed ?? 0,
		ignored: $clusterStatsQuery.data?.byState.ignored ?? 0,
		regression: $clusterStatsQuery.data?.byState.regression ?? 0,
	}));

	const clusterTotal = derived(
		[stateFilter, stateLaneCounts],
		([$stateFilter, $stateLaneCounts]) =>
			$stateFilter
				? ($stateLaneCounts[$stateFilter] ?? 0)
				: $stateLaneCounts.total
	);

	const ungroupedTotal = derived(
		ungroupedSignalsStatsQuery,
		($ungroupedSignalsStatsQuery) =>
			$ungroupedSignalsStatsQuery.data?.total ?? 0
	);

	const activeSortLabel = derived(sortBy, ($sortBy) => {
		switch ($sortBy) {
			case "createdAt":
				return "newest";
			case "signalCount":
				return "frequency";
			default:
				return "impact";
		}
	});

	// ─── Update State Mutation ───────────────────────────────────────────────

	let updateOpen = $state(false);
	let updateClusterId = $state("");
	let updateClusterTitle = $state("");
	let updateState = $state("open");
	let updateFixedVersion = $state("");
	let updateIssueUrl = $state("");
	let updateIssueId = $state("");
	let updateError = $state<string | null>(null);

	const updateStateMutation = createMutation(
		orpc.youtube.clusters.updateState.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: orpc.youtube.key() });
				updateOpen = false;
			},
		})
	);

	let recreateError = $state<string | null>(null);
	let recreateSummary = $state<string | null>(null);

	const recreateClustersMutation = createMutation(
		orpc.youtube.clusters.recreate.mutationOptions({
			onSuccess: (result) => {
				queryClient.invalidateQueries({ queryKey: orpc.youtube.key() });
				clusterOffset.set(0);
				ungroupedOffset.set(0);
				recreateError = null;
				recreateSummary = `Recreated clusters: cleared ${result.clearedClusters} clusters, reset ${result.clearedAssignments} assignments, queued ${result.queuedSignals} signals.`;
			},
			onError: (error) => {
				recreateSummary = null;
				recreateError =
					error instanceof Error ? error.message : "Failed to recreate clusters";
			},
		})
	);

	const handleRecreateClusters = async () => {
		recreateError = null;
		const confirmed = window.confirm(
			"This will clear current cluster assignments and re-enqueue all vectorized signals for clustering. Continue?"
		);
		if (!confirmed) return;
		await $recreateClustersMutation.mutateAsync({ confirm: "RECREATE" });
	};

	const openUpdateDialog = (cluster: {
		id: string;
		title: string;
		state: string;
		fixedInVersion: string | null;
		externalIssueUrl: string | null;
		externalIssueId: string | null;
	}) => {
		updateClusterId = cluster.id;
		updateClusterTitle = cluster.title;
		updateState = cluster.state;
		updateFixedVersion = cluster.fixedInVersion ?? "";
		updateIssueUrl = cluster.externalIssueUrl ?? "";
		updateIssueId = cluster.externalIssueId ?? "";
		updateError = null;
		updateOpen = true;
	};

	const handleUpdateState = async () => {
		updateError = null;
		try {
			await $updateStateMutation.mutateAsync({
				clusterId: updateClusterId,
				state: updateState as ClusterState,
				fixedInVersion: updateFixedVersion.trim() || undefined,
				externalIssueUrl: updateIssueUrl.trim() || undefined,
				externalIssueId: updateIssueId.trim() || undefined,
			});
		} catch (e) {
			updateError = e instanceof Error ? e.message : "Failed to update cluster";
		}
	};

	const resetPaging = () => {
		clusterOffset.set(0);
		ungroupedOffset.set(0);
	};

	const applyStateLane = (value?: ClusterState) => {
		stateFilter.set(value);
		clusterOffset.set(0);
	};

	// ─── Helpers ─────────────────────────────────────────────────────────────

	const severityColor = (severity: string | null) => {
		switch (severity) {
			case "critical":
				return "destructive" as const;
			case "high":
				return "destructive" as const;
			case "medium":
				return "default" as const;
			case "low":
				return "secondary" as const;
			case "info":
				return "outline" as const;
			default:
				return "secondary" as const;
		}
	};

	const severityDotClass = (severity: string | null) => {
		switch (severity) {
			case "critical":
				return "bg-red-600";
			case "high":
				return "bg-orange-500";
			case "medium":
				return "bg-yellow-500";
			case "low":
				return "bg-sky-500";
			case "info":
				return "bg-zinc-400";
			default:
				return "bg-zinc-300";
		}
	};

	const stateColor = (state: string) => {
		switch (state) {
			case "open":
				return "destructive" as const;
			case "acknowledged":
				return "default" as const;
			case "in_progress":
				return "default" as const;
			case "fixed":
				return "secondary" as const;
			case "ignored":
				return "outline" as const;
			case "regression":
				return "destructive" as const;
			default:
				return "secondary" as const;
		}
	};

	const typeLabel = (type: string | null) => {
		if (!type) return "—";
		return type.replace(/_/g, " ");
	};

	const scoreToSeverityLabel = (
		score: number | null
	): ClusterSeverity | "unknown" => {
		if (score === null) return "unknown";
		if (score >= 10) return "critical";
		if (score >= 8) return "high";
		if (score >= 4) return "medium";
		if (score >= 2) return "low";
		return "info";
	};

	const formatRelativeAge = (iso: string) => {
		const now = Date.now();
		const then = new Date(iso).getTime();
		const diffMs = then - now;
		const minute = 60_000;
		const hour = 60 * minute;
		const day = 24 * hour;
		const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
		if (Math.abs(diffMs) < hour) {
			return rtf.format(Math.round(diffMs / minute), "minute");
		}
		if (Math.abs(diffMs) < day) {
			return rtf.format(Math.round(diffMs / hour), "hour");
		}
		return rtf.format(Math.round(diffMs / day), "day");
	};
</script>

<div class="space-y-4">
	{#if recreateSummary || recreateError}
		<div class="flex items-center gap-2">
			{#if recreateSummary}
				<p class="text-xs text-muted-foreground">{recreateSummary}</p>
			{/if}
			{#if recreateError}
				<p class="text-xs text-destructive">{recreateError}</p>
			{/if}
			<Button
				variant="outline"
				size="sm"
				disabled={$recreateClustersMutation.isPending}
				onclick={() => void handleRecreateClusters()}
			>
				{$recreateClustersMutation.isPending ? "Recreating..." : "Retry"}
			</Button>
		</div>
	{/if}

	<div class="flex flex-wrap items-center justify-end gap-2">
		<Button
			variant="outline"
			size="sm"
			disabled={$recreateClustersMutation.isPending}
			onclick={() => void handleRecreateClusters()}
		>
			{$recreateClustersMutation.isPending
				? "Recreating..."
				: "Recreate Clusters"}
		</Button>
		<Button
			variant="outline"
			size="sm"
			href={resolve("/youtube/insights/vectors")}
		>
			Vectors
		</Button>
		<Button
			variant="outline"
			size="sm"
			href={resolve("/youtube")}
		>
			Back to Feeds
		</Button>
	</div>

	<Tabs.Root bind:value={activeView}>
		<Tabs.List>
			<Tabs.Trigger value="all">All</Tabs.Trigger>
			<Tabs.Trigger value="clustered">Clustered</Tabs.Trigger>
			<Tabs.Trigger value="ungrouped">Ungrouped</Tabs.Trigger>
		</Tabs.List>
	</Tabs.Root>

	<Card.Root>
		<Card.Content class="space-y-3 p-4">
			{#if activeView !== "ungrouped"}
				<div class="flex flex-wrap items-center gap-2">
					{#each stateLanes as lane}
						{@const isActive = (lane.value ?? undefined) === $stateFilter}
						<Button
							variant={isActive ? "default" : "outline"}
							size="sm"
							class="gap-2"
							onclick={() => applyStateLane(lane.value)}
						>
							<span>{lane.label}</span>
							<span
								class="rounded-full bg-background/60 px-1.5 text-[10px] tabular-nums"
							>
								{lane.value
									? ($stateLaneCounts[lane.value] ?? 0)
									: $stateLaneCounts.total}
							</span>
						</Button>
					{/each}
				</div>
			{/if}

			<div class="flex flex-wrap gap-2">
				<Input
					placeholder="Search issue title or signal text..."
					value={$search}
					oninput={(e) => {
						search.set((e.target as HTMLInputElement).value);
						resetPaging();
					}}
					class="min-w-[280px] flex-1"
				/>

				<Select.Root
					type="single"
					value={$typeFilter ?? ""}
					onValueChange={(v) => {
						typeFilter.set((v as ClusterType) || undefined);
						resetPaging();
					}}
				>
					<Select.Trigger class="w-[170px]">
						<span>
							{typeLabel($typeFilter ?? null) === "—"
								? "All Types"
								: typeLabel($typeFilter ?? null)}
						</span>
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="">All Types</Select.Item>
						{#each signalTypes as type}
							<Select.Item value={type}>{type.replace(/_/g, " ")}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>

				<Select.Root
					type="single"
					value={$severityFilter ?? ""}
					onValueChange={(v) => {
						severityFilter.set((v as ClusterSeverity) || undefined);
						resetPaging();
					}}
				>
					<Select.Trigger class="w-[160px]">
						<span>{$severityFilter ?? "All Severities"}</span>
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="">All Severities</Select.Item>
						{#each severityLevels as sev}
							<Select.Item value={sev}>{sev}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>

				{#if activeView !== "ungrouped"}
					<Select.Root
						type="single"
						value={$sortBy}
						onValueChange={(v) => {
							sortBy.set((v as ClusterSortBy) || "impactScore");
							clusterOffset.set(0);
						}}
					>
						<Select.Trigger class="w-[160px]">
							<span>Sort: {$activeSortLabel}</span>
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="impactScore">Impact</Select.Item>
							<Select.Item value="signalCount">Frequency</Select.Item>
							<Select.Item value="createdAt">Newest</Select.Item>
						</Select.Content>
					</Select.Root>

					<Select.Root
						type="single"
						value={$sortDir}
						onValueChange={(v) => {
							sortDir.set((v as SortDir) || "desc");
							clusterOffset.set(0);
						}}
					>
						<Select.Trigger class="w-[130px]">
							<span>{$sortDir === "desc" ? "Descending" : "Ascending"}</span>
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="desc">Descending</Select.Item>
							<Select.Item value="asc">Ascending</Select.Item>
						</Select.Content>
					</Select.Root>
				{/if}
			</div>
		</Card.Content>
	</Card.Root>

	{#snippet ClusterTableRows()}
		{#each $clustersQuery.data ?? [] as cluster (cluster.id)}
			<Table.Row class="align-top">
				<Table.Cell class="max-w-0 whitespace-normal">
					<div class="flex items-start gap-3 py-1">
						<span
							class="mt-1.5 h-2.5 w-2.5 rounded-full {severityDotClass(cluster.severity)}"
						></span>
						<div class="min-w-0 flex-1 space-y-1">
							<a
								href={resolve(`/youtube/insights/${cluster.id}`)}
								title={cluster.title}
								class="block w-full overflow-hidden break-words text-sm font-semibold text-primary hover:underline"
								style="display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;"
							>
								{cluster.title}
							</a>
							{#if cluster.summary}
								<p class="line-clamp-2 text-xs text-muted-foreground">
									{cluster.summary}
								</p>
							{/if}
							<div class="flex flex-wrap items-center gap-1.5 text-xs">
								{#if cluster.type}
									<Badge variant="outline" class="text-[10px]"
										>{cluster.type.replace(/_/g, " ")}</Badge
									>
								{/if}
								{#if cluster.severity}
									<Badge
										variant={severityColor(cluster.severity)}
										class="text-[10px] capitalize"
									>
										{cluster.severity}
									</Badge>
								{/if}
								{#if cluster.component}
									<Badge variant="secondary" class="text-[10px]"
										>{cluster.component}</Badge
									>
								{/if}
								{#if cluster.firstSeenVersion}
									<span class="text-muted-foreground"
										>v{cluster.firstSeenVersion}</span
									>
								{/if}
								{#if cluster.externalIssueId}
									{#if cluster.externalIssueUrl}
										<a
											href={cluster.externalIssueUrl}
											target="_blank"
											rel="noopener noreferrer"
											class="text-primary hover:underline"
										>
											{cluster.externalIssueId}
										</a>
									{:else}
										<span class="text-muted-foreground"
											>{cluster.externalIssueId}</span
										>
									{/if}
								{/if}
							</div>
						</div>
					</div>
				</Table.Cell>
				<Table.Cell class="text-right align-middle text-sm tabular-nums"
					>{cluster.signalCount}</Table.Cell
				>
				<Table.Cell class="text-right align-middle text-sm tabular-nums"
					>{cluster.uniqueAuthors}</Table.Cell
				>
				<Table.Cell class="text-right align-middle">
					<p class="text-sm font-semibold tabular-nums">
						{cluster.impactScore}
					</p>
				</Table.Cell>
				<Table.Cell class="align-middle">
					<Badge
						variant={stateColor(cluster.state)}
						class="text-[10px] capitalize"
					>
						{cluster.state.replace(/_/g, " ")}
					</Badge>
				</Table.Cell>
				<Table.Cell class="align-middle text-xs text-muted-foreground">
					<div>{formatRelativeAge(cluster.createdAt)}</div>
					<div>{new Date(cluster.createdAt).toLocaleDateString()}</div>
				</Table.Cell>
				<Table.Cell class="align-middle">
					<div class="flex flex-col items-start gap-1">
						<Button
							variant="outline"
							size="sm"
							onclick={() => openUpdateDialog(cluster)}
						>
							Update
						</Button>
						<Button
							variant="outline"
							size="sm"
							href={resolve(`/youtube/insights/${cluster.id}`)}
						>
							Open
						</Button>
					</div>
				</Table.Cell>
			</Table.Row>
		{/each}
	{/snippet}

	{#snippet UngroupedTableRows()}
		{#each $ungroupedSignalsQuery.data ?? [] as signal (signal.id)}
			{@const signalSeverity = scoreToSeverityLabel(signal.severityScore)}
			<Table.Row class="align-top">
				<Table.Cell class="max-w-0 whitespace-normal">
					<div class="min-w-0 space-y-1 py-1">
						<a
							href={resolve(`/youtube/videos/${signal.videoId}`)}
							title={signal.text}
							class="block w-full overflow-hidden break-words text-sm font-medium text-primary hover:underline"
							style="display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;"
						>
							{signal.text}
						</a>
						<div class="flex flex-wrap items-center gap-1.5 text-xs">
							<Badge variant="outline" class="text-[10px]">
								{signal.type.replace(/_/g, " ")}
							</Badge>
							{#if signalSeverity !== "unknown"}
								<Badge
									variant={severityColor(signalSeverity)}
									class="text-[10px] capitalize"
								>
									{signalSeverity}
								</Badge>
							{/if}
							{#if signal.component}
								<Badge variant="secondary" class="text-[10px]"
									>{signal.component}</Badge
								>
							{/if}
							{#if signal.gameVersion}
								<span class="text-muted-foreground">v{signal.gameVersion}</span>
							{/if}
							{#if signal.confidence}
								<span class="text-muted-foreground"
									>{signal.confidence}% confidence</span
								>
							{/if}
						</div>
					</div>
				</Table.Cell>
				<Table.Cell class="align-middle text-sm tabular-nums">
					{signal.severityScore ?? "—"}
				</Table.Cell>
				<Table.Cell class="align-middle text-xs text-muted-foreground">
					<div>{formatRelativeAge(signal.createdAt)}</div>
					<div>{new Date(signal.createdAt).toLocaleDateString()}</div>
				</Table.Cell>
				<Table.Cell class="align-middle">
					<Button
						variant="outline"
						size="sm"
						href={resolve(`/youtube/videos/${signal.videoId}`)}
					>
						Open Video
					</Button>
				</Table.Cell>
			</Table.Row>
		{/each}
	{/snippet}

	{#if activeView === "all"}
		<div class="space-y-4">
			<Card.Root>
				<Card.Header class="pb-3">
					<Card.Title class="text-base">Clustered Issues</Card.Title>
					<Card.Description>{$clusterTotal} total</Card.Description>
				</Card.Header>
				<Card.Content class="p-0">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head class="w-[48%]">Issue</Table.Head>
								<Table.Head class="w-[8%] text-right">Signals</Table.Head>
								<Table.Head class="w-[8%] text-right">Authors</Table.Head>
								<Table.Head class="w-[10%] text-right">Impact</Table.Head>
								<Table.Head class="w-[10%]">State</Table.Head>
								<Table.Head class="w-[10%]">Age</Table.Head>
								<Table.Head class="w-[6%]">Action</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#if $clustersQuery.isPending}
								<Table.Row>
									<Table.Cell
										colspan={7}
										class="py-8 text-center text-sm text-muted-foreground"
									>
										Loading clustered issues...
									</Table.Cell>
								</Table.Row>
							{:else if $clustersQuery.isError}
								<Table.Row>
									<Table.Cell
										colspan={7}
										class="py-8 text-center text-sm text-destructive"
									>
										Failed to load clustered issues.
									</Table.Cell>
								</Table.Row>
							{:else if ($clustersQuery.data ?? []).length === 0}
								<Table.Row>
									<Table.Cell
										colspan={7}
										class="py-8 text-center text-sm text-muted-foreground"
									>
										No clustered issues for current filters.
									</Table.Cell>
								</Table.Row>
							{:else}
								{@render ClusterTableRows()}
							{/if}
						</Table.Body>
					</Table.Root>

					{#if ($clustersQuery.data?.length ?? 0) > 0}
						<div class="flex items-center justify-between border-t px-4 py-3">
							<p class="text-sm text-muted-foreground">
								Clustered
								{$clusterOffset + 1}–{$clusterOffset + ($clustersQuery.data ?? []).length}
								of {$clusterTotal}
							</p>
							<div class="flex gap-2">
								<Button
									variant="outline"
									size="sm"
									disabled={$clusterOffset === 0}
									onclick={() =>
										clusterOffset.set(Math.max(0, $clusterOffset - limit))}
								>
									Previous
								</Button>
								<Button
									variant="outline"
									size="sm"
									disabled={($clustersQuery.data?.length ?? 0) < limit}
									onclick={() => clusterOffset.set($clusterOffset + limit)}
								>
									Next
								</Button>
							</div>
						</div>
					{/if}
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header class="pb-3">
					<Card.Title class="text-base">Ungrouped Signals</Card.Title>
					<Card.Description>{$ungroupedTotal} total</Card.Description>
				</Card.Header>
				<Card.Content class="p-0">
					<Table.Root class="table-fixed">
						<Table.Header>
							<Table.Row>
								<Table.Head class="w-[62%]">Signal</Table.Head>
								<Table.Head class="w-[12%]">Score</Table.Head>
								<Table.Head class="w-[14%]">Age</Table.Head>
								<Table.Head class="w-[12%]">Action</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#if $ungroupedSignalsQuery.isPending}
								<Table.Row>
									<Table.Cell
										colspan={4}
										class="py-8 text-center text-sm text-muted-foreground"
									>
										Loading ungrouped signals...
									</Table.Cell>
								</Table.Row>
							{:else if $ungroupedSignalsQuery.isError}
								<Table.Row>
									<Table.Cell
										colspan={4}
										class="py-8 text-center text-sm text-destructive"
									>
										Failed to load ungrouped signals.
									</Table.Cell>
								</Table.Row>
							{:else if ($ungroupedSignalsQuery.data ?? []).length === 0}
								<Table.Row>
									<Table.Cell
										colspan={4}
										class="py-8 text-center text-sm text-muted-foreground"
									>
										No ungrouped signals for current filters.
									</Table.Cell>
								</Table.Row>
							{:else}
								{@render UngroupedTableRows()}
							{/if}
						</Table.Body>
					</Table.Root>

					{#if ($ungroupedSignalsQuery.data?.length ?? 0) > 0}
						<div class="flex items-center justify-between border-t px-4 py-3">
							<p class="text-sm text-muted-foreground">
								Ungrouped
								{$ungroupedOffset + 1}–{$ungroupedOffset + ($ungroupedSignalsQuery.data ?? []).length}
								of {$ungroupedTotal}
							</p>
							<div class="flex gap-2">
								<Button
									variant="outline"
									size="sm"
									disabled={$ungroupedOffset === 0}
									onclick={() =>
										ungroupedOffset.set(Math.max(0, $ungroupedOffset - limit))}
								>
									Previous
								</Button>
								<Button
									variant="outline"
									size="sm"
									disabled={($ungroupedSignalsQuery.data?.length ?? 0) < limit}
									onclick={() => ungroupedOffset.set($ungroupedOffset + limit)}
								>
									Next
								</Button>
							</div>
						</div>
					{/if}
				</Card.Content>
			</Card.Root>
		</div>
	{:else if activeView === "clustered"}
		<Card.Root>
			<Card.Content class="p-0">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head class="w-[48%]">Issue</Table.Head>
							<Table.Head class="w-[8%] text-right">Signals</Table.Head>
							<Table.Head class="w-[8%] text-right">Authors</Table.Head>
							<Table.Head class="w-[10%] text-right">Impact</Table.Head>
							<Table.Head class="w-[10%]">State</Table.Head>
							<Table.Head class="w-[10%]">Age</Table.Head>
							<Table.Head class="w-[6%]">Action</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#if $clustersQuery.isPending}
							<Table.Row>
								<Table.Cell
									colspan={7}
									class="py-8 text-center text-sm text-muted-foreground"
								>
									Loading clustered issues...
								</Table.Cell>
							</Table.Row>
						{:else if $clustersQuery.isError}
							<Table.Row>
								<Table.Cell
									colspan={7}
									class="py-8 text-center text-sm text-destructive"
								>
									Failed to load clustered issues.
								</Table.Cell>
							</Table.Row>
						{:else if ($clustersQuery.data ?? []).length === 0}
							<Table.Row>
								<Table.Cell
									colspan={7}
									class="py-8 text-center text-sm text-muted-foreground"
								>
									No clustered issues for current filters.
								</Table.Cell>
							</Table.Row>
						{:else}
							{@render ClusterTableRows()}
						{/if}
					</Table.Body>
				</Table.Root>

				{#if ($clustersQuery.data?.length ?? 0) > 0}
					<div class="flex items-center justify-between border-t px-4 py-3">
						<p class="text-sm text-muted-foreground">
							Showing
							{$clusterOffset + 1}–{$clusterOffset + ($clustersQuery.data ?? []).length}
							of {$clusterTotal}
						</p>
						<div class="flex gap-2">
							<Button
								variant="outline"
								size="sm"
								disabled={$clusterOffset === 0}
								onclick={() => clusterOffset.set(Math.max(0, $clusterOffset - limit))}
							>
								Previous
							</Button>
							<Button
								variant="outline"
								size="sm"
								disabled={($clustersQuery.data?.length ?? 0) < limit}
								onclick={() => clusterOffset.set($clusterOffset + limit)}
							>
								Next
							</Button>
						</div>
					</div>
				{/if}
			</Card.Content>
		</Card.Root>
	{:else}
		<Card.Root>
			<Card.Content class="p-0">
				<Table.Root class="table-fixed">
					<Table.Header>
						<Table.Row>
							<Table.Head class="w-[62%]">Signal</Table.Head>
							<Table.Head class="w-[12%]">Score</Table.Head>
							<Table.Head class="w-[14%]">Age</Table.Head>
							<Table.Head class="w-[12%]">Action</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#if $ungroupedSignalsQuery.isPending}
							<Table.Row>
								<Table.Cell
									colspan={4}
									class="py-8 text-center text-sm text-muted-foreground"
								>
									Loading ungrouped signals...
								</Table.Cell>
							</Table.Row>
						{:else if $ungroupedSignalsQuery.isError}
							<Table.Row>
								<Table.Cell
									colspan={4}
									class="py-8 text-center text-sm text-destructive"
								>
									Failed to load ungrouped signals.
								</Table.Cell>
							</Table.Row>
						{:else if ($ungroupedSignalsQuery.data ?? []).length === 0}
							<Table.Row>
								<Table.Cell
									colspan={4}
									class="py-8 text-center text-sm text-muted-foreground"
								>
									No ungrouped signals for current filters.
								</Table.Cell>
							</Table.Row>
						{:else}
							{@render UngroupedTableRows()}
						{/if}
					</Table.Body>
				</Table.Root>

				{#if ($ungroupedSignalsQuery.data?.length ?? 0) > 0}
					<div class="flex items-center justify-between border-t px-4 py-3">
						<p class="text-sm text-muted-foreground">
							Showing
							{$ungroupedOffset + 1}–{$ungroupedOffset + ($ungroupedSignalsQuery.data ?? []).length}
							of {$ungroupedTotal}
						</p>
						<div class="flex gap-2">
							<Button
								variant="outline"
								size="sm"
								disabled={$ungroupedOffset === 0}
								onclick={() =>
									ungroupedOffset.set(Math.max(0, $ungroupedOffset - limit))}
							>
								Previous
							</Button>
							<Button
								variant="outline"
								size="sm"
								disabled={($ungroupedSignalsQuery.data?.length ?? 0) < limit}
								onclick={() => ungroupedOffset.set($ungroupedOffset + limit)}
							>
								Next
							</Button>
						</div>
					</div>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}
</div>

<Dialog.Root bind:open={updateOpen}>
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title>Update Cluster State</Dialog.Title>
			<Dialog.Description>{updateClusterTitle}</Dialog.Description>
		</Dialog.Header>
		<div class="space-y-4">
			<div class="space-y-2">
				<Label>State</Label>
				<Select.Root
					type="single"
					value={updateState}
					onValueChange={(v) => {
						updateState = v;
					}}
				>
					<Select.Trigger>
						<span>{updateState.replace(/_/g, " ")}</span>
					</Select.Trigger>
					<Select.Content>
						{#each clusterStates as state}
							<Select.Item value={state}
								>{state.replace(/_/g, " ")}</Select.Item
							>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>
			{#if updateState === "fixed"}
				<div class="space-y-2">
					<Label for="fixed-version">Fixed in Version</Label>
					<Input
						id="fixed-version"
						placeholder="e.g. 0.9.4"
						bind:value={updateFixedVersion}
					/>
				</div>
			{/if}
			<div class="space-y-2">
				<Label for="issue-url">External Issue URL</Label>
				<Input
					id="issue-url"
					placeholder="https://linear.app/..."
					bind:value={updateIssueUrl}
				/>
			</div>
			<div class="space-y-2">
				<Label for="issue-id">External Issue ID</Label>
				<Input
					id="issue-id"
					placeholder="e.g. SF-142"
					bind:value={updateIssueId}
				/>
			</div>
			{#if updateError}
				<p class="text-sm text-destructive">{updateError}</p>
			{/if}
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (updateOpen = false)}
				>Cancel</Button
			>
			<Button
				disabled={$updateStateMutation.isPending}
				onclick={() => void handleUpdateState()}
			>
				{$updateStateMutation.isPending ? "Updating..." : "Update State"}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
