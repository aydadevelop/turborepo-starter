<script lang="ts">
	import { Button } from "@my-app/ui/components/button";
	import { Textarea } from "@my-app/ui/components/textarea";
	import {
		createMutation,
		createQuery,
		skipToken,
	} from "@tanstack/svelte-query";
	import { page } from "$app/state";
	import SurfaceCard from "../../components/operator/SurfaceCard.svelte";
	import { orpc, queryClient } from "$lib/orpc";

	const ticketId = $derived(page.params.ticketId ?? "");

	const ticketQuery = createQuery(() =>
		orpc.support.getMyTicket.queryOptions({
			input: ticketId ? { ticketId } : skipToken,
		})
	);

	const addMessageMutation = createMutation(() =>
		orpc.support.addMyMessage.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: orpc.support.getMyTicket.key() });
				replyBody = "";
			},
		})
	);

	let replyBody = $state("");

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		const body = replyBody.trim();
		if (!body || addMessageMutation.isPending) return;
		addMessageMutation.mutate({ ticketId, body });
	}

	const formatDateTime = (value: string) => new Date(value).toLocaleString();
</script>

<div class="space-y-4">
	{#if ticketQuery.isPending}
		<p class="text-muted-foreground">Loading…</p>
	{:else if ticketQuery.isError}
		<p class="text-destructive">Failed to load ticket.</p>
	{:else if ticketQuery.data}
		{@const { ticket, messages } = ticketQuery.data}

		<div>
			<a href="/dashboard/bookings" class="text-sm text-muted-foreground hover:underline">
				← Back to bookings
			</a>
		</div>

		<SurfaceCard
			title={ticket.subject}
			description={ticket.description ?? "Customer support thread for this booking."}
		>
			{#snippet action()}
				<span class="text-sm font-medium text-muted-foreground">
					{ticket.status.replace(/_/g, " ")}
				</span>
			{/snippet}
			{#snippet children()}
				<div class="text-sm text-muted-foreground">
					Status: <span class="font-medium text-foreground capitalize">{ticket.status.replace(/_/g, " ")}</span>
				</div>
			{/snippet}
		</SurfaceCard>

		<SurfaceCard
			title="Conversation"
			description="Messages between you and the operator."
		>
			{#snippet children()}
				<div class="flex flex-col gap-3">
					{#if messages.length === 0}
						<p class="text-sm text-muted-foreground">No messages yet.</p>
					{:else}
						{#each messages as message (message.id)}
							<div class="rounded-lg border p-3">
								<p class="text-sm">{message.body}</p>
								<p class="mt-1 text-xs text-muted-foreground">
									{formatDateTime(message.createdAt)}
								</p>
							</div>
						{/each}
					{/if}
				</div>
			{/snippet}
		</SurfaceCard>

		{#if ticket.status !== "resolved" && ticket.status !== "closed"}
			<SurfaceCard
				title="Reply"
				description="Send a follow-up message to the operator."
			>
				{#snippet children()}
					<form onsubmit={handleSubmit} class="flex flex-col gap-3">
						<Textarea
							bind:value={replyBody}
							placeholder="Write a reply…"
							rows={4}
						/>
						<div class="flex justify-end">
							<Button
								type="submit"
								disabled={addMessageMutation.isPending || !replyBody.trim()}
							>
								{addMessageMutation.isPending ? "Sending…" : "Send reply"}
							</Button>
						</div>
						{#if addMessageMutation.isError}
							<p class="text-sm text-destructive">Failed to send. Please try again.</p>
						{/if}
					</form>
				{/snippet}
			</SurfaceCard>
		{/if}
	{/if}
</div>
