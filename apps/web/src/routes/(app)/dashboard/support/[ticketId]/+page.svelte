<script lang="ts">
	import { createMutation, createQuery } from "@tanstack/svelte-query";
	import { page } from "$app/state";
	import { orpc, queryClient } from "$lib/orpc";

	const ticketId = $derived(page.params.ticketId ?? "");

	const ticketQuery = createQuery(() => ({
		...orpc.support.getMyTicket.queryOptions({ input: { ticketId } }),
		enabled: Boolean(ticketId),
	}));

	const addMessageMutation = createMutation(() =>
		orpc.support.addMyMessage.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: orpc.support.getMyTicket.key() });
				replyBody = "";
			},
		}),
	);

	let replyBody = $state("");

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		const body = replyBody.trim();
		if (!body || addMessageMutation.isPending) return;
		addMessageMutation.mutate({ ticketId, body });
	}
</script>

<svelte:head>
	<title>Support Ticket</title>
</svelte:head>

<div class="container max-w-3xl py-8">
	{#if ticketQuery.isPending}
		<p class="text-muted-foreground">Loading…</p>
	{:else if ticketQuery.isError}
		<p class="text-destructive">Failed to load ticket.</p>
	{:else if ticketQuery.data}
		{@const { ticket, messages } = ticketQuery.data}

		<div class="mb-6">
			<a href="/dashboard/bookings" class="text-sm text-muted-foreground hover:underline">
				← Back to bookings
			</a>
		</div>

		<div class="mb-6 rounded-lg border p-4">
			<div class="flex items-start justify-between gap-2">
				<h1 class="text-xl font-semibold">{ticket.subject}</h1>
				<span class="rounded border px-2 py-0.5 text-xs font-medium capitalize">
					{ticket.status.replace(/_/g, " ")}
				</span>
			</div>
			{#if ticket.description}
				<p class="mt-2 text-sm text-muted-foreground">{ticket.description}</p>
			{/if}
		</div>

		<div class="mb-6 flex flex-col gap-3">
			{#if messages.length === 0}
				<p class="text-sm text-muted-foreground">No messages yet.</p>
			{:else}
				{#each messages as message (message.id)}
					<div class="rounded-lg border p-3">
						<p class="text-sm">{message.body}</p>
						<p class="mt-1 text-xs text-muted-foreground">
							{new Date(message.createdAt).toLocaleString()}
						</p>
					</div>
				{/each}
			{/if}
		</div>

		{#if ticket.status !== "resolved" && ticket.status !== "closed"}
			<form onsubmit={handleSubmit} class="flex flex-col gap-2">
				<textarea
					bind:value={replyBody}
					placeholder="Write a reply…"
					rows={4}
					class="w-full rounded-md border px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
				></textarea>
				<div class="flex justify-end">
					<button
						type="submit"
						disabled={addMessageMutation.isPending || !replyBody.trim()}
						class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
					>
						{addMessageMutation.isPending ? "Sending…" : "Send reply"}
					</button>
				</div>
				{#if addMessageMutation.isError}
					<p class="text-sm text-destructive">Failed to send. Please try again.</p>
				{/if}
			</form>
		{/if}
	{/if}
</div>
