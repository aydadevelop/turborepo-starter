<script lang="ts">
	import { Badge } from "@my-app/ui/components/badge";
	import { Button } from "@my-app/ui/components/button";
	import * as Card from "@my-app/ui/components/card";
	import * as Dialog from "@my-app/ui/components/dialog";
	import { Input } from "@my-app/ui/components/input";
	import { Label } from "@my-app/ui/components/label";
	import * as Select from "@my-app/ui/components/select";
	import * as Table from "@my-app/ui/components/table";
	import { createMutation, createQuery } from "@tanstack/svelte-query";
	import { derived, writable } from "svelte/store";
	import { resolve } from "$app/paths";
	import { orpc, queryClient } from "$lib/orpc";

	// ─── Filter State ────────────────────────────────────────────────────────

	const search = writable("");
	const stateFilter = writable<string | undefined>(undefined);
	const typeFilter = writable<string | undefined>(undefined);
	const severityFilter = writable<string | undefined>(undefined);
	const currentOffset = writable(0);
	const limit = 20;

	// ─── Cluster Query ───────────────────────────────────────────────────────

	const clustersQuery = createQuery(
		derived(
			[search, stateFilter, typeFilter, severityFilter, currentOffset],
			([$search, $state, $type, $severity, $offset]) =>
				orpc.youtube.clusters.list.queryOptions({
					input: {
						search: $search || undefined,
						state:
							($state as
								| "open"
								| "acknowledged"
								| "in_progress"
								| "fixed"
								| "ignored"
								| "regression"
								| undefined) || undefined,
						type:
							($type as
								| "bug"
								| "ux_friction"
								| "confusion"
								| "praise"
								| "suggestion"
								| "performance"
								| "crash"
								| "exploit"
								| "other"
								| undefined) || undefined,
						severity:
							($severity as
								| "critical"
								| "high"
								| "medium"
								| "low"
								| "info"
								| undefined) || undefined,
						limit,
						offset: $offset,
					},
				})
		)
	);

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
				state: updateState as
					| "open"
					| "acknowledged"
					| "in_progress"
					| "fixed"
					| "ignored"
					| "regression",
				fixedInVersion: updateFixedVersion.trim() || undefined,
				externalIssueUrl: updateIssueUrl.trim() || undefined,
				externalIssueId: updateIssueId.trim() || undefined,
			});
		} catch (e) {
			updateError = e instanceof Error ? e.message : "Failed to update cluster";
		}
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

	const clusterStates = [
		"open",
		"acknowledged",
		"in_progress",
		"fixed",
		"ignored",
		"regression",
	];
	const signalTypes = [
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
	const severityLevels = ["critical", "high", "medium", "low", "info"];
</script>

<div class="container mx-auto space-y-6 p-6">
	<!-- ─── Header ─────────────────────────────────────────────────────────── -->

	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-2xl font-bold">Insights</h2>
			<p class="text-sm text-muted-foreground">
				Clustered playtest feedback — issues ranked by impact
			</p>
		</div>
		<Button variant="outline" href={resolve("/youtube")}>
			Back to Feeds
		</Button>
	</div>

	<!-- ─── Filters ────────────────────────────────────────────────────────── -->

	<div class="flex flex-wrap gap-2">
		<Input
			placeholder="Search clusters..."
			value={$search}
			oninput={(e) => {
				search.set((e.target as HTMLInputElement).value);
				currentOffset.set(0);
			}}
			class="w-64"
		/>

		<Select.Root
			type="single"
			onValueChange={(v) => { stateFilter.set(v || undefined); currentOffset.set(0); }}
		>
			<Select.Trigger class="w-[160px]">
				<span>{$stateFilter?.replace(/_/g, " ") ?? "All States"}</span>
			</Select.Trigger>
			<Select.Content>
				<Select.Item value="">All States</Select.Item>
				{#each clusterStates as s}
					<Select.Item value={s}>{s.replace(/_/g, " ")}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>

		<Select.Root
			type="single"
			onValueChange={(v) => { typeFilter.set(v || undefined); currentOffset.set(0); }}
		>
			<Select.Trigger class="w-[160px]">
				<span
					>{typeLabel($typeFilter ?? null) === "—" ? "All Types" : typeLabel($typeFilter ?? null)}</span
				>
			</Select.Trigger>
			<Select.Content>
				<Select.Item value="">All Types</Select.Item>
				{#each signalTypes as t}
					<Select.Item value={t}>{t.replace(/_/g, " ")}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>

		<Select.Root
			type="single"
			onValueChange={(v) => { severityFilter.set(v || undefined); currentOffset.set(0); }}
		>
			<Select.Trigger class="w-[140px]">
				<span>{$severityFilter ?? "All Severities"}</span>
			</Select.Trigger>
			<Select.Content>
				<Select.Item value="">All Severities</Select.Item>
				{#each severityLevels as sev}
					<Select.Item value={sev}>{sev}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
	</div>

	<!-- ─── Cluster List ───────────────────────────────────────────────────── -->

	{#if $clustersQuery.isPending}
		<p class="text-sm text-muted-foreground">Loading insights...</p>
	{:else if $clustersQuery.isError}
		<p class="text-sm text-destructive">Failed to load insights.</p>
	{:else if ($clustersQuery.data ?? []).length === 0}
		<Card.Root>
			<Card.Content class="py-12 text-center text-muted-foreground">
				No clusters found. Insights will appear here once videos are processed.
			</Card.Content>
		</Card.Root>
	{:else}
		<div class="space-y-3">
			{#each $clustersQuery.data ?? [] as cluster (cluster.id)}
				<Card.Root class="transition hover:shadow-md">
					<Card.Content class="p-4">
						<div class="flex items-start justify-between gap-4">
							<!-- Left: Title + Meta -->
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<a
										href={resolve(`/youtube/insights/${cluster.id}`)}
										class="text-base font-semibold text-primary hover:underline truncate"
									>
										{cluster.title}
									</a>
								</div>
								{#if cluster.summary}
									<p class="mt-1 text-sm text-muted-foreground line-clamp-2">
										{cluster.summary}
									</p>
								{/if}
								<div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
									<Badge variant={stateColor(cluster.state)}>
										{cluster.state.replace(/_/g, " ")}
									</Badge>
									{#if cluster.type}
										<Badge variant="outline">
											{cluster.type.replace(/_/g, " ")}
										</Badge>
									{/if}
									{#if cluster.severity}
										<Badge variant={severityColor(cluster.severity)}>
											{cluster.severity}
										</Badge>
									{/if}
									{#if cluster.component}
										<span class="text-muted-foreground">
											{cluster.component}
										</span>
									{/if}
									{#if cluster.firstSeenVersion}
										<span class="text-muted-foreground">
											v{cluster.firstSeenVersion}
										</span>
									{/if}
									{#if cluster.externalIssueId}
										<a
											href={cluster.externalIssueUrl ?? "#"}
											target="_blank"
											rel="noopener noreferrer"
											class="text-primary hover:underline"
										>
											{cluster.externalIssueId}
										</a>
									{/if}
								</div>
							</div>

							<!-- Right: Stats + Actions -->
							<div class="flex shrink-0 items-center gap-4">
								<div class="text-right text-sm">
									<div class="font-semibold">{cluster.signalCount}</div>
									<div class="text-xs text-muted-foreground">signals</div>
								</div>
								<div class="text-right text-sm">
									<div class="font-semibold">{cluster.uniqueAuthors}</div>
									<div class="text-xs text-muted-foreground">authors</div>
								</div>
								<div class="text-right text-sm">
									<div class="font-bold text-lg">{cluster.impactScore}</div>
									<div class="text-xs text-muted-foreground">impact</div>
								</div>
								<Button
									variant="ghost"
									size="sm"
									onclick={() => openUpdateDialog(cluster)}
								>
									Update
								</Button>
							</div>
						</div>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{/if}

	<!-- ─── Pagination ─────────────────────────────────────────────────────── -->

	{#if ($clustersQuery.data ?? []).length >= limit}
		<div class="flex items-center justify-between">
			<p class="text-sm text-muted-foreground">
				Showing
				{$currentOffset + 1}–{$currentOffset + ($clustersQuery.data ?? []).length}
			</p>
			<div class="flex gap-2">
				<Button
					variant="outline"
					size="sm"
					disabled={$currentOffset === 0}
					onclick={() => currentOffset.set(Math.max(0, $currentOffset - limit))}
				>
					Previous
				</Button>
				<Button
					variant="outline"
					size="sm"
					onclick={() => currentOffset.set($currentOffset + limit)}
				>
					Next
				</Button>
			</div>
		</div>
	{/if}
</div>

<!-- ─── Update State Dialog ────────────────────────────────────────────────── -->

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
					onValueChange={(v) => { updateState = v; }}
				>
					<Select.Trigger>
						<span>{updateState.replace(/_/g, " ")}</span>
					</Select.Trigger>
					<Select.Content>
						{#each clusterStates as s}
							<Select.Item value={s}>{s.replace(/_/g, " ")}</Select.Item>
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
