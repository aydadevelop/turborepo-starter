<script lang="ts">
	import { Badge } from "@my-app/ui/components/badge";
	import { Button } from "@my-app/ui/components/button";
	import { Separator } from "@my-app/ui/components/separator";
	import { createQuery } from "@tanstack/svelte-query";
	import { authClient } from "$lib/auth-client";
	import { orpc, queryClient } from "$lib/orpc";
	import { queryKeys } from "$lib/query-keys";
	import { userInvitationsQueryOptions } from "$lib/query-options";
	import AccountSettingsSection from "./AccountSettingsSection.svelte";

	let { enabled }: { enabled: boolean } = $props();

	const invitationsQuery = createQuery(() =>
		userInvitationsQueryOptions({
			enabled,
		})
	);

	const pendingInvitations = $derived(
		(invitationsQuery.data ?? []).filter((inv) => inv.status === "pending")
	);
	const pastInvitations = $derived(
		(invitationsQuery.data ?? []).filter((inv) => inv.status !== "pending")
	);
	const pendingInvitationCount = $derived(pendingInvitations.length);

	let pendingActionId = $state<string | null>(null);
	let invitationError = $state<string | null>(null);

	const handleAccept = async (invitationId: string) => {
		pendingActionId = invitationId;
		invitationError = null;
		const { error } = await authClient.organization.acceptInvitation({
			invitationId,
		});
		pendingActionId = null;
		if (error) {
			invitationError =
				(error as { message?: string }).message ??
				"Failed to accept invitation.";
			return;
		}
		queryClient.invalidateQueries({ queryKey: queryKeys.invitations.all });
		queryClient.invalidateQueries({ queryKey: queryKeys.org.root });
		queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all });
		queryClient.invalidateQueries({
			queryKey: orpc.canManageOrganization.key(),
		});
	};

	const handleReject = async (invitationId: string) => {
		pendingActionId = invitationId;
		invitationError = null;
		const { error } = await authClient.organization.rejectInvitation({
			invitationId,
		});
		pendingActionId = null;
		if (error) {
			invitationError =
				(error as { message?: string }).message ??
				"Failed to reject invitation.";
			return;
		}
		queryClient.invalidateQueries({ queryKey: queryKeys.invitations.all });
	};

	const formatDate = (date: Date | string) =>
		new Intl.DateTimeFormat("en-US", {
			dateStyle: "medium",
			timeStyle: "short",
		}).format(date instanceof Date ? date : new Date(date));
</script>

<AccountSettingsSection
	title="Invitations"
	description="Organization invitations sent to you."
>
	{#snippet children()}
		<div
			class:rounded-lg={pendingInvitationCount > 0}
			class:border={pendingInvitationCount > 0}
			class:border-primary={pendingInvitationCount > 0}
			class:p-3={pendingInvitationCount > 0}
		>
			<div class="mb-3 flex items-center gap-2">
				{#if pendingInvitationCount > 0}
					<Badge variant="destructive" class="h-5 min-w-5 px-1 text-xs">
						{pendingInvitationCount}
					</Badge>
				{/if}
			</div>
			{#if invitationError}
				<p class="text-sm text-destructive" role="alert">{invitationError}</p>
			{/if}
			{#if invitationsQuery.isPending}
				<p class="text-sm text-muted-foreground">Loading...</p>
			{:else if pendingInvitations.length > 0}
				<div class="space-y-2">
					{#each pendingInvitations as inv (inv.id)}
						<div
							class="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
						>
							<div class="space-y-1">
								<p class="text-sm font-medium">
									{inv.organizationName ?? "Organization"}
								</p>
								<div
									class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
								>
									<span>Role:</span>
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
									disabled={pendingActionId === inv.id}
								>
									{pendingActionId === inv.id ? "Accepting..." : "Accept"}
								</Button>
								<Button
									variant="outline"
									size="sm"
									onclick={() => void handleReject(inv.id)}
									disabled={pendingActionId === inv.id}
								>
									Reject
								</Button>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">No pending invitations.</p>
			{/if}
			{#if pastInvitations.length > 0}
				<Separator />
				<p class="text-xs font-medium text-muted-foreground">Past</p>
				<div class="space-y-2">
					{#each pastInvitations as inv (inv.id)}
						<div
							class="flex items-center justify-between rounded-lg border p-3 text-sm"
						>
							<span class="font-medium">{inv.organizationName ?? "Organization"}</span>
							<Badge variant={inv.status === "accepted" ? "default" : "outline"}>
								{inv.status}
							</Badge>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/snippet}
</AccountSettingsSection>
