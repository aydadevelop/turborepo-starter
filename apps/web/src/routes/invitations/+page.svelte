<script lang="ts">
	import { Badge } from "@full-stack-cf-app/ui/components/badge";
	import { Button } from "@full-stack-cf-app/ui/components/button";
	import * as Card from "@full-stack-cf-app/ui/components/card";
	import { createQuery } from "@tanstack/svelte-query";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { authClient } from "$lib/auth-client";
	import { queryClient } from "$lib/orpc";

	const sessionQuery = authClient.useSession();

	const invitationsQuery = createQuery({
		queryKey: ["user-invitations"],
		queryFn: async () => {
			const { data, error } =
				await authClient.organization.listUserInvitations();
			if (error) throw error;
			return data ?? [];
		},
	});

	let pendingId = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);

	$effect(() => {
		if ($sessionQuery.isPending) return;
		if (!$sessionQuery.data) {
			goto(resolve("/login"));
		}
	});

	const pendingInvitations = $derived(
		($invitationsQuery.data ?? []).filter((inv) => inv.status === "pending")
	);

	const pastInvitations = $derived(
		($invitationsQuery.data ?? []).filter((inv) => inv.status !== "pending")
	);

	const handleAccept = async (invitationId: string) => {
		pendingId = invitationId;
		errorMessage = null;
		const { error } = await authClient.organization.acceptInvitation({
			invitationId,
		});
		pendingId = null;
		if (error) {
			errorMessage =
				(error as { message?: string }).message ??
				"Failed to accept invitation.";
			return;
		}
		queryClient.invalidateQueries({ queryKey: ["user-invitations"] });
		queryClient.invalidateQueries({ queryKey: ["organization"] });
	};

	const handleReject = async (invitationId: string) => {
		pendingId = invitationId;
		errorMessage = null;
		const { error } = await authClient.organization.rejectInvitation({
			invitationId,
		});
		pendingId = null;
		if (error) {
			errorMessage =
				(error as { message?: string }).message ??
				"Failed to reject invitation.";
			return;
		}
		queryClient.invalidateQueries({ queryKey: ["user-invitations"] });
	};

	const formatDate = (date: Date | string) =>
		new Intl.DateTimeFormat("en-US", {
			dateStyle: "medium",
			timeStyle: "short",
		}).format(date instanceof Date ? date : new Date(date));
</script>

<div class="mx-auto max-w-2xl px-6 py-6 space-y-6">
	<div>
		<h1 class="text-2xl font-bold">Invitations</h1>
		<p class="text-sm text-muted-foreground">
			Organization invitations sent to you
		</p>
	</div>

	{#if errorMessage}
		<p class="text-sm text-destructive">{errorMessage}</p>
	{/if}

	{#if $invitationsQuery.isPending}
		<p class="text-muted-foreground">Loading...</p>
	{:else if $invitationsQuery.isError}
		<p class="text-destructive">Failed to load invitations.</p>
	{:else}
		<!-- Pending invitations -->
		{#if pendingInvitations.length > 0}
			<div class="space-y-3">
				{#each pendingInvitations as inv (inv.id)}
					<Card.Root>
						<Card.Content
							class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
						>
							<div class="space-y-1">
								<p class="font-medium">
									{inv.organizationName ?? "Organization"}
								</p>
								<div
									class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
								>
									<span>Role: </span>
									<Badge variant="secondary">{inv.role ?? "member"}</Badge>
									{#if inv.expiresAt}
										<span>&middot; Expires {formatDate(inv.expiresAt)}</span>
									{/if}
								</div>
							</div>
							<div class="flex gap-2">
								<Button
									size="sm"
									onclick={() => void handleAccept(inv.id)}
									disabled={pendingId === inv.id}
								>
									{pendingId === inv.id ? "Accepting..." : "Accept"}
								</Button>
								<Button
									variant="outline"
									size="sm"
									onclick={() => void handleReject(inv.id)}
									disabled={pendingId === inv.id}
								>
									Reject
								</Button>
							</div>
						</Card.Content>
					</Card.Root>
				{/each}
			</div>
		{:else}
			<Card.Root>
				<Card.Content class="p-6 text-center text-muted-foreground">
					No pending invitations.
				</Card.Content>
			</Card.Root>
		{/if}

		<!-- Past invitations -->
		{#if pastInvitations.length > 0}
			<div>
				<h2 class="mb-3 text-sm font-medium text-muted-foreground">Past</h2>
				<div class="space-y-2">
					{#each pastInvitations as inv (inv.id)}
						<Card.Root>
							<Card.Content class="flex items-center justify-between p-4">
								<div class="space-y-1">
									<p class="text-sm font-medium">
										{inv.organizationName ?? "Organization"}
									</p>
									<p class="text-xs text-muted-foreground">
										Role: {inv.role ?? "member"}
									</p>
								</div>
								<Badge
									variant={inv.status === "accepted" ? "default" : "outline"}
								>
									{inv.status}
								</Badge>
							</Card.Content>
						</Card.Root>
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</div>
