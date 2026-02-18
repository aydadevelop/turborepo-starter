<script lang="ts">
	import { Badge } from "@full-stack-cf-app/ui/components/badge";
	import { Button } from "@full-stack-cf-app/ui/components/button";
	import * as Card from "@full-stack-cf-app/ui/components/card";
	import { Input } from "@full-stack-cf-app/ui/components/input";
	import * as Table from "@full-stack-cf-app/ui/components/table";
	import * as Tabs from "@full-stack-cf-app/ui/components/tabs";
	import { Textarea } from "@full-stack-cf-app/ui/components/textarea";
	import {
		createMutation,
		createQuery,
		useQueryClient,
	} from "@tanstack/svelte-query";
	import { derived, writable } from "svelte/store";
	import { orpc } from "$lib/orpc";

	const search = writable("");
	const statusFilter = writable<string>("");
	const priorityFilter = writable<string>("");
	const selectedTicketId = writable<string | null>(null);
	const replyBody = writable("");
	const replyChannel = writable<string>("web");
	const replyInternal = writable(false);

	const limit = 30;

	const statusOptions = [
		"open",
		"pending_customer",
		"pending_operator",
		"escalated",
		"resolved",
		"closed",
	] as const;

	const priorityOptions = ["low", "normal", "high", "urgent"] as const;

	const sourceOptions = [
		"manual",
		"web",
		"telegram",
		"avito",
		"email",
		"sputnik",
	] as const;

	const channelOptions = [
		"internal",
		"web",
		"telegram",
		"avito",
		"email",
		"sputnik",
	] as const;

	const queryClient = useQueryClient();

	const ticketsQuery = createQuery(
		derived(
			[search, statusFilter, priorityFilter],
			([$search, $statusFilter, $priorityFilter]) =>
				orpc.helpdesk.ticketListManaged.queryOptions({
					input: {
						limit,
						search: $search || undefined,
						status: ($statusFilter || undefined) as
							| (typeof statusOptions)[number]
							| undefined,
						priority: ($priorityFilter || undefined) as
							| (typeof priorityOptions)[number]
							| undefined,
					},
				})
		)
	);

	const ticketDetailQuery = createQuery(
		derived([selectedTicketId], ([$id]) => ({
			...orpc.helpdesk.ticketGetManaged.queryOptions({
				input: {
					ticketId: $id ?? "",
					includeMessages: true,
				},
			}),
			enabled: !!$id,
		}))
	);

	const createMessageMutation = createMutation({
		mutationFn: (input: {
			ticketId: string;
			channel: string;
			body: string;
			isInternal: boolean;
		}) =>
			orpc.helpdesk.messageCreateManaged.call({
				ticketId: input.ticketId,
				channel: input.channel as (typeof channelOptions)[number],
				body: input.body,
				isInternal: input.isInternal,
			}),
		onSuccess: () => {
			replyBody.set("");
			queryClient.invalidateQueries({ queryKey: ["helpdesk"] });
		},
	});

	const updateStatusMutation = createMutation({
		mutationFn: (input: { ticketId: string; status: string }) =>
			orpc.helpdesk.ticketStatusManaged.call({
				ticketId: input.ticketId,
				status: input.status as (typeof statusOptions)[number],
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["helpdesk"] });
		},
	});

	const statusColor = (s: string) => {
		switch (s) {
			case "open":
				return "default" as const;
			case "escalated":
				return "destructive" as const;
			case "resolved":
			case "closed":
				return "secondary" as const;
			default:
				return "outline" as const;
		}
	};

	const priorityColor = (p: string) => {
		switch (p) {
			case "urgent":
				return "destructive" as const;
			case "high":
				return "default" as const;
			default:
				return "secondary" as const;
		}
	};

	const sourceIcon = (s: string) => {
		switch (s) {
			case "telegram":
				return "💬";
			case "email":
				return "📧";
			case "avito":
				return "🏷️";
			case "sputnik":
				return "🚀";
			case "web":
				return "🌐";
			default:
				return "📋";
		}
	};

	const formatDate = (date: Date | string | null) => {
		if (!date) return "—";
		return new Date(date).toLocaleString("ru-RU", {
			day: "2-digit",
			month: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	const handleSendReply = () => {
		const ticketId = $selectedTicketId;
		const body = $replyBody.trim();
		if (!(ticketId && body)) return;

		$createMessageMutation.mutate({
			ticketId,
			channel: $replyChannel,
			body,
			isInternal: $replyInternal,
		});
	};

	const handleStatusChange = (ticketId: string, status: string) => {
		$updateStatusMutation.mutate({ ticketId, status });
	};
</script>

<div class="flex h-full gap-4">
	<!-- Left panel: Ticket list -->
	<div class="flex w-1/2 flex-col gap-3">
		<h2 class="text-xl font-semibold">Helpdesk</h2>

		<!-- Search & filters -->
		<Input
			placeholder="Search tickets..."
			value={$search}
			oninput={(e) => search.set((e.target as HTMLInputElement).value)}
			class="max-w-md"
		/>

		<div class="flex flex-wrap items-center gap-1.5">
			<span class="text-xs uppercase tracking-wide text-muted-foreground"
				>Status</span
			>
			{#each statusOptions as status (status)}
				<Button
					variant={$statusFilter === status ? "default" : "outline"}
					size="sm"
					onclick={() => statusFilter.set($statusFilter === status ? "" : status)}
				>
					{status.replace(/_/g, " ")}
				</Button>
			{/each}
		</div>

		<div class="flex flex-wrap items-center gap-1.5">
			<span class="text-xs uppercase tracking-wide text-muted-foreground"
				>Priority</span
			>
			{#each priorityOptions as priority (priority)}
				<Button
					variant={$priorityFilter === priority ? "default" : "outline"}
					size="sm"
					onclick={() => priorityFilter.set($priorityFilter === priority ? "" : priority)}
				>
					{priority}
				</Button>
			{/each}
			{#if $statusFilter || $priorityFilter}
				<Button
					variant="ghost"
					size="sm"
					onclick={() => {
						statusFilter.set("");
						priorityFilter.set("");
					}}
				>
					Clear
				</Button>
			{/if}
		</div>

		<!-- Ticket list -->
		<Card.Root class="flex-1 overflow-auto">
			<Card.Content class="p-0">
				{#if $ticketsQuery.isPending}
					<p class="p-4 text-sm text-muted-foreground">Loading...</p>
				{:else if $ticketsQuery.isError}
					<p class="p-4 text-sm text-destructive">Failed to load tickets.</p>
				{:else}
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head class="w-8"></Table.Head>
								<Table.Head>Subject</Table.Head>
								<Table.Head>Status</Table.Head>
								<Table.Head>Priority</Table.Head>
								<Table.Head>Date</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each $ticketsQuery.data ?? [] as ticket (ticket.id)}
								<Table.Row
									class="cursor-pointer {$selectedTicketId === ticket.id ? 'bg-muted' : ''}"
									onclick={() => selectedTicketId.set(ticket.id)}
								>
									<Table.Cell class="text-center">
										{sourceIcon(ticket.source)}
									</Table.Cell>
									<Table.Cell class="max-w-[200px] truncate font-medium">
										{ticket.subject}
									</Table.Cell>
									<Table.Cell>
										<Badge variant={statusColor(ticket.status)}>
											{ticket.status.replace(/_/g, " ")}
										</Badge>
									</Table.Cell>
									<Table.Cell>
										<Badge variant={priorityColor(ticket.priority)}>
											{ticket.priority}
										</Badge>
									</Table.Cell>
									<Table.Cell class="text-sm text-muted-foreground">
										{formatDate(ticket.createdAt)}
									</Table.Cell>
								</Table.Row>
							{:else}
								<Table.Row>
									<Table.Cell
										colspan={5}
										class="text-center text-muted-foreground"
									>
										No tickets found.
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>

	<!-- Right panel: Ticket detail -->
	<div class="flex w-1/2 flex-col gap-3">
		{#if !$selectedTicketId}
			<div
				class="flex flex-1 items-center justify-center text-muted-foreground"
			>
				Select a ticket to view details
			</div>
		{:else if $ticketDetailQuery.isPending}
			<div
				class="flex flex-1 items-center justify-center text-muted-foreground"
			>
				Loading ticket...
			</div>
		{:else if $ticketDetailQuery.isError}
			<div class="flex flex-1 items-center justify-center text-destructive">
				Failed to load ticket.
			</div>
		{:else if $ticketDetailQuery.data}
			{@const ticket = $ticketDetailQuery.data.ticket}
			{@const messages = $ticketDetailQuery.data.messages}

			<!-- Ticket header -->
			<Card.Root>
				<Card.Header class="pb-3">
					<div class="flex items-start justify-between">
						<div>
							<Card.Title class="text-lg">{ticket.subject}</Card.Title>
							<Card.Description>
								{sourceIcon(ticket.source)} {ticket.source} · Created
								{formatDate(ticket.createdAt)}
								{#if ticket.dueAt}
									· Due {formatDate(ticket.dueAt)}
								{/if}
							</Card.Description>
						</div>
						<div class="flex gap-1.5">
							<Badge variant={statusColor(ticket.status)}>
								{ticket.status.replace(/_/g, " ")}
							</Badge>
							<Badge variant={priorityColor(ticket.priority)}>
								{ticket.priority}
							</Badge>
						</div>
					</div>
				</Card.Header>
				{#if ticket.description}
					<Card.Content class="pt-0">
						<p class="text-sm text-muted-foreground">{ticket.description}</p>
					</Card.Content>
				{/if}
				<Card.Footer class="flex gap-1.5 pt-0">
					{#if ticket.status !== "resolved" && ticket.status !== "closed"}
						<Button
							variant="outline"
							size="sm"
							onclick={() => handleStatusChange(ticket.id, "resolved")}
						>
							Resolve
						</Button>
					{/if}
					{#if ticket.status !== "closed"}
						<Button
							variant="outline"
							size="sm"
							onclick={() => handleStatusChange(ticket.id, "closed")}
						>
							Close
						</Button>
					{/if}
					{#if ticket.status === "resolved" || ticket.status === "closed"}
						<Button
							variant="outline"
							size="sm"
							onclick={() => handleStatusChange(ticket.id, "open")}
						>
							Reopen
						</Button>
					{/if}
				</Card.Footer>
			</Card.Root>

			<!-- Messages thread -->
			<Card.Root class="flex-1 overflow-auto">
				<Card.Content class="space-y-3 p-4">
					{#each messages as msg (msg.id)}
						<div
							class="rounded-lg border p-3 {msg.isInternal ? 'border-dashed bg-muted/50' : ''}"
						>
							<div
								class="mb-1 flex items-center gap-2 text-xs text-muted-foreground"
							>
								<Badge variant="outline" class="text-xs">{msg.channel}</Badge>
								{#if msg.isInternal}
									<Badge variant="secondary" class="text-xs">internal</Badge>
								{/if}
								<span>{formatDate(msg.createdAt)}</span>
							</div>
							<p class="whitespace-pre-wrap text-sm">{msg.body}</p>
						</div>
					{:else}
						<p class="text-sm text-muted-foreground">No messages yet.</p>
					{/each}
				</Card.Content>
			</Card.Root>

			<!-- Reply form -->
			<Card.Root>
				<Card.Content class="p-3">
					<div class="space-y-2">
						<Textarea
							placeholder="Type your reply..."
							value={$replyBody}
							oninput={(e) => replyBody.set((e.target as HTMLTextAreaElement).value)}
							rows={3}
						/>
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<label class="flex items-center gap-1.5 text-sm">
									<span class="text-muted-foreground">Channel:</span>
									<select
										class="rounded border bg-background px-2 py-1 text-sm"
										value={$replyChannel}
										onchange={(e) => replyChannel.set((e.target as HTMLSelectElement).value)}
									>
										{#each channelOptions as ch (ch)}
											<option value={ch}>{ch}</option>
										{/each}
									</select>
								</label>
								<label class="flex items-center gap-1.5 text-sm">
									<input
										type="checkbox"
										checked={$replyInternal}
										onchange={(e) => replyInternal.set((e.target as HTMLInputElement).checked)}
									>
									<span class="text-muted-foreground">Internal note</span>
								</label>
							</div>
							<Button
								size="sm"
								disabled={!$replyBody.trim() || $createMessageMutation.isPending}
								onclick={handleSendReply}
							>
								{$createMessageMutation.isPending ? "Sending..." : "Send"}
							</Button>
						</div>
					</div>
				</Card.Content>
			</Card.Root>
		{/if}
	</div>
</div>
