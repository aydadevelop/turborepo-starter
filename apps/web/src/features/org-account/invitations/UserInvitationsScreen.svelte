<script lang="ts">
	import { Badge } from "@my-app/ui/components/badge";
	import { Button } from "@my-app/ui/components/button";
	import { createMutation, createQuery } from "@tanstack/svelte-query";
	import { authClient } from "$lib/auth-client";
	import { queryClient } from "$lib/orpc";
	import { userInvitationsQueryOptions } from "$lib/query-options";
	import SurfaceCard from "../../../components/operator/SurfaceCard.svelte";
	import { formatOrgAccountError } from "../shared/errors";
	import {
		getInvitationListInvalidationKeys,
		getMembershipInvalidationKeys,
		invalidateQueryKeys,
	} from "../shared/invalidations";
	import {
		acceptOrganizationInvitation,
		rejectOrganizationInvitation,
	} from "./mutations";

	const invitationsQuery = createQuery(() => userInvitationsQueryOptions());

	let errorMessage = $state<string | null>(null);
	let pendingId = $state<string | null>(null);

	const acceptInvitation = createMutation(() => ({
		mutationFn: async ({ invitationId }: { invitationId: string }) => {
			const result = await acceptOrganizationInvitation(
				{
					acceptInvitation: authClient.organization.acceptInvitation,
					rejectInvitation: authClient.organization.rejectInvitation,
					invalidateInvitationResponse: () =>
						invalidateQueryKeys(queryClient, getMembershipInvalidationKeys()),
					invalidateInvitationList: () =>
						invalidateQueryKeys(
							queryClient,
							getInvitationListInvalidationKeys()
						),
				},
				invitationId
			);

			if (!result.ok) {
				throw new Error(result.message);
			}
		},
	}));

	const rejectInvitation = createMutation(() => ({
		mutationFn: async ({ invitationId }: { invitationId: string }) => {
			const result = await rejectOrganizationInvitation(
				{
					acceptInvitation: authClient.organization.acceptInvitation,
					rejectInvitation: authClient.organization.rejectInvitation,
					invalidateInvitationResponse: () =>
						invalidateQueryKeys(queryClient, getMembershipInvalidationKeys()),
					invalidateInvitationList: () =>
						invalidateQueryKeys(
							queryClient,
							getInvitationListInvalidationKeys()
						),
				},
				invitationId
			);

			if (!result.ok) {
				throw new Error(result.message);
			}
		},
	}));

	const pendingInvitations = $derived(
		(invitationsQuery.data ?? []).filter(
			(invitation) => invitation.status === "pending"
		)
	);

	const pastInvitations = $derived(
		(invitationsQuery.data ?? []).filter(
			(invitation) => invitation.status !== "pending"
		)
	);

	const formatDate = (date: Date | string) =>
		new Intl.DateTimeFormat("en-US", {
			dateStyle: "medium",
			timeStyle: "short",
		}).format(date instanceof Date ? date : new Date(date));
</script>

{#if errorMessage}
	<p class="mb-4 text-sm text-destructive">{errorMessage}</p>
{/if}

{#if invitationsQuery.isPending}
	<p class="text-muted-foreground">Loading...</p>
{:else if invitationsQuery.isError}
	<p class="text-destructive">Failed to load invitations.</p>
{:else}
	<div class="max-w-xl space-y-4">
		{#if pendingInvitations.length > 0}
			<SurfaceCard
				title="Pending invitations"
				description="Outstanding organization invites that still need your response."
			>
				{#snippet children()}
					<div class="space-y-3">
						{#each pendingInvitations as invitation (invitation.id)}
							<div class="rounded-lg border p-4">
								<div
									class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
								>
									<div class="space-y-1">
										<p class="font-medium">
											{invitation.organizationName ?? "Organization"}
										</p>
										<div
											class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
										>
											<span>Role:</span>
											<Badge variant="secondary">
												{invitation.role ?? "member"}
											</Badge>
											{#if invitation.expiresAt}
												<span>
													&middot; Expires {formatDate(invitation.expiresAt)}
												</span>
											{/if}
										</div>
									</div>
									<div class="flex gap-2">
										<Button
											size="sm"
											disabled={pendingId === invitation.id &&
												(acceptInvitation.isPending || rejectInvitation.isPending)}
											onclick={() => {
												pendingId = invitation.id;
												errorMessage = null;
												acceptInvitation.mutate(
													{ invitationId: invitation.id },
													{
														onSuccess: () => {
															pendingId = null;
														},
														onError: (error) => {
															pendingId = null;
															errorMessage = formatOrgAccountError(
																error,
																"Failed to accept invitation."
															);
														},
													}
												);
											}}
										>
											{#if pendingId === invitation.id && acceptInvitation.isPending}
												Accepting...
											{:else}
												Accept
											{/if}
										</Button>
										<Button
											variant="outline"
											size="sm"
											disabled={pendingId === invitation.id &&
												(acceptInvitation.isPending || rejectInvitation.isPending)}
											onclick={() => {
												pendingId = invitation.id;
												errorMessage = null;
												rejectInvitation.mutate(
													{ invitationId: invitation.id },
													{
														onSuccess: () => {
															pendingId = null;
														},
														onError: (error) => {
															pendingId = null;
															errorMessage = formatOrgAccountError(
																error,
																"Failed to reject invitation."
															);
														},
													}
												);
											}}
										>
											{#if pendingId === invitation.id && rejectInvitation.isPending}
												Rejecting...
											{:else}
												Reject
											{/if}
										</Button>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/snippet}
			</SurfaceCard>
		{:else}
			<SurfaceCard title="Pending invitations">
				{#snippet children()}
					<p class="text-center text-muted-foreground">
						No pending invitations.
					</p>
				{/snippet}
			</SurfaceCard>
		{/if}

		{#if pastInvitations.length > 0}
			<SurfaceCard
				title="Past invitations"
				description="Historical invitation responses."
			>
				{#snippet children()}
					<div class="space-y-2">
						{#each pastInvitations as invitation (invitation.id)}
							<div
								class="flex items-center justify-between rounded-lg border p-4"
							>
								<div class="space-y-1">
									<p class="text-sm font-medium">
										{invitation.organizationName ?? "Organization"}
									</p>
									<p class="text-xs text-muted-foreground">
										Role: {invitation.role ?? "member"}
									</p>
								</div>
								<Badge
									variant={invitation.status === "accepted" ? "default" : "outline"}
								>
									{invitation.status}
								</Badge>
							</div>
						{/each}
					</div>
				{/snippet}
			</SurfaceCard>
		{/if}
	</div>
{/if}
