<script lang="ts">
	import { Badge } from "@my-app/ui/components/badge";
	import { Button } from "@my-app/ui/components/button";
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle,
	} from "@my-app/ui/components/card";
	import {
		Content as DialogContent,
		Description as DialogDescription,
		Footer as DialogFooter,
		Header as DialogHeader,
		Root as DialogRoot,
		Title as DialogTitle,
	} from "@my-app/ui/components/dialog";
	import {
		Option as NativeSelectOption,
		Root as NativeSelectRoot,
	} from "@my-app/ui/components/native-select";
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow,
	} from "@my-app/ui/components/table";
	import { createMutation, createQuery } from "@tanstack/svelte-query";
	import { authClient } from "$lib/auth-client";
	import { queryClient } from "$lib/orpc";
	import { fullOrganizationQueryOptions } from "$lib/query-options";
	import ConfirmActionDialog from "../../../components/admin/ConfirmActionDialog.svelte";
	import { formatOrgAccountError } from "../shared/errors";
	import {
		getMembershipInvalidationKeys,
		invalidateQueryKeys,
	} from "../shared/invalidations";
	import {
		getOrgRoleBadgeVariant,
		ORG_ROLE_OPTIONS,
		type OrgRole,
	} from "../shared/roles";
	import {
		cancelOrganizationInvitation,
		removeOrganizationMember,
		updateOrganizationMemberRole,
	} from "./mutations";

	const fullOrgQuery = createQuery(() => fullOrganizationQueryOptions());

	let removeDialogOpen = $state(false);
	let removeMemberId = $state<string | null>(null);
	let removeMemberName = $state("");
	let removeError = $state<string | null>(null);

	let roleDialogOpen = $state(false);
	let roleMemberId = $state<string | null>(null);
	let roleMemberName = $state("");
	let nextRole = $state<OrgRole>("member");
	let roleError = $state<string | null>(null);

	let invitationError = $state<string | null>(null);
	let pendingInvitationId = $state<string | null>(null);

	const removeMember = createMutation(() => ({
		mutationFn: async ({ memberId }: { memberId: string }) => {
			const result = await removeOrganizationMember(
				{
					removeMember: authClient.organization.removeMember,
					updateMemberRole: authClient.organization.updateMemberRole,
					cancelInvitation: authClient.organization.cancelInvitation,
					invalidateMembership: () =>
						invalidateQueryKeys(queryClient, getMembershipInvalidationKeys()),
				},
				memberId
			);

			if (!result.ok) {
				throw new Error(result.message);
			}
		},
	}));

	const updateMemberRole = createMutation(() => ({
		mutationFn: async ({
			memberId,
			role,
		}: {
			memberId: string;
			role: OrgRole;
		}) => {
			const result = await updateOrganizationMemberRole(
				{
					removeMember: authClient.organization.removeMember,
					updateMemberRole: authClient.organization.updateMemberRole,
					cancelInvitation: authClient.organization.cancelInvitation,
					invalidateMembership: () =>
						invalidateQueryKeys(queryClient, getMembershipInvalidationKeys()),
				},
				{ memberId, role }
			);

			if (!result.ok) {
				throw new Error(result.message);
			}
		},
	}));

	const cancelInvitation = createMutation(() => ({
		mutationFn: async ({ invitationId }: { invitationId: string }) => {
			const result = await cancelOrganizationInvitation(
				{
					removeMember: authClient.organization.removeMember,
					updateMemberRole: authClient.organization.updateMemberRole,
					cancelInvitation: authClient.organization.cancelInvitation,
					invalidateMembership: () =>
						invalidateQueryKeys(queryClient, getMembershipInvalidationKeys()),
				},
				invitationId
			);

			if (!result.ok) {
				throw new Error(result.message);
			}
		},
	}));

	const pendingInvitations = $derived(
		(fullOrgQuery.data?.invitations ?? []).filter(
			(invitation) => invitation.status === "pending"
		)
	);
</script>

<div class="space-y-4">
	{#if fullOrgQuery.isPending}
		<p class="text-muted-foreground">Loading...</p>
	{:else if fullOrgQuery.isError}
		<p class="text-destructive">Failed to load organization.</p>
	{:else if fullOrgQuery.data}
		{@const org = fullOrgQuery.data}

		<Card>
			<CardHeader>
				<CardTitle data-testid="org-team-members-title">
					Members ({org.members?.length ?? 0})
				</CardTitle>
				<CardDescription>Manage team members and their roles.</CardDescription>
			</CardHeader>
			<CardContent class="p-0">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Email</TableHead>
							<TableHead>Role</TableHead>
							<TableHead class="w-40">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{#each org.members ?? [] as member (member.id)}
							<TableRow>
								<TableCell class="font-medium">
									{member.user?.name ?? "—"}
								</TableCell>
								<TableCell
									class="text-muted-foreground"
									data-testid={`org-member-email-${member.userId}`}
								>
									{member.user?.email ?? "—"}
								</TableCell>
								<TableCell>
									<Badge variant={getOrgRoleBadgeVariant(member.role)}>
										{member.role}
									</Badge>
								</TableCell>
								<TableCell>
									<div class="flex gap-1">
										<Button
											variant="outline"
											size="sm"
											onclick={() => {
												roleMemberId = member.id;
												roleMemberName =
													member.user?.name ?? member.user?.email ?? "member";
												nextRole = member.role as OrgRole;
												roleError = null;
												roleDialogOpen = true;
											}}
										>
											Role
										</Button>
										<Button
											variant="outline"
											size="sm"
											onclick={() => {
												removeMemberId = member.id;
												removeMemberName =
													member.user?.name ?? member.user?.email ?? "member";
												removeError = null;
												removeDialogOpen = true;
											}}
										>
											Remove
										</Button>
									</div>
								</TableCell>
							</TableRow>
						{:else}
							<TableRow>
								<TableCell
									colspan={4}
									class="text-center text-muted-foreground"
								>
									No members.
								</TableCell>
							</TableRow>
						{/each}
					</TableBody>
				</Table>
			</CardContent>
		</Card>

		{#if pendingInvitations.length > 0}
			<Card>
				<CardHeader>
					<CardTitle
						>Pending Invitations ({pendingInvitations.length})</CardTitle
					>
				</CardHeader>
				<CardContent class="space-y-3 p-0">
					{#if invitationError}
						<p class="px-6 pt-4 text-sm text-destructive">{invitationError}</p>
					{/if}
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Email</TableHead>
								<TableHead>Role</TableHead>
								<TableHead class="w-24">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{#each pendingInvitations as invitation (invitation.id)}
								<TableRow>
									<TableCell class="font-medium">{invitation.email}</TableCell>
									<TableCell>
										<Badge variant="secondary">
											{invitation.role ?? "member"}
										</Badge>
									</TableCell>
									<TableCell>
										<Button
											variant="outline"
											size="sm"
											disabled={cancelInvitation.isPending &&
												pendingInvitationId === invitation.id}
											onclick={() => {
												pendingInvitationId = invitation.id;
												invitationError = null;
												cancelInvitation.mutate(
													{ invitationId: invitation.id },
													{
														onSuccess: () => {
															pendingInvitationId = null;
														},
														onError: (error) => {
															pendingInvitationId = null;
															invitationError = formatOrgAccountError(
																error,
																"Failed to cancel invitation."
															);
														},
													}
												);
											}}
										>
											{#if cancelInvitation.isPending && pendingInvitationId === invitation.id}
												Cancelling...
											{:else}
												Cancel
											{/if}
										</Button>
									</TableCell>
								</TableRow>
							{/each}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		{/if}
	{/if}
</div>

<ConfirmActionDialog
	bind:open={removeDialogOpen}
	title="Remove Member"
	description={`Remove ${removeMemberName} from this organization?`}
	confirmLabel="Remove"
	pendingLabel="Removing..."
	pending={removeMember.isPending}
	errorMessage={removeError}
	onConfirm={() => {
		if (!removeMemberId) return;
		removeMember.mutate(
			{ memberId: removeMemberId },
			{
				onSuccess: () => {
					removeDialogOpen = false;
					removeMemberId = null;
				},
				onError: (error) => {
					removeError = formatOrgAccountError(error, "Failed to remove member.");
				},
			}
		);
	}}
/>

<DialogRoot bind:open={roleDialogOpen}>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>Change Role</DialogTitle>
			<DialogDescription>
				Select a new role for <strong>{roleMemberName}</strong>.
			</DialogDescription>
		</DialogHeader>
		<div class="space-y-3 py-2">
			<NativeSelectRoot
				value={nextRole}
				onchange={(event) =>
					(nextRole = (event.target as HTMLSelectElement).value as OrgRole)}
			>
				{#each ORG_ROLE_OPTIONS as role (role.value)}
					<NativeSelectOption value={role.value}
						>{role.label}</NativeSelectOption
					>
				{/each}
			</NativeSelectRoot>
			<p class="text-sm text-muted-foreground">
				{ORG_ROLE_OPTIONS.find((role) => role.value === nextRole)?.description}
			</p>
		</div>
		{#if roleError}
			<p class="text-sm text-destructive">{roleError}</p>
		{/if}
		<DialogFooter>
			<Button variant="outline" onclick={() => (roleDialogOpen = false)}>
				Cancel
			</Button>
			<Button
				disabled={updateMemberRole.isPending}
				onclick={() => {
					if (!roleMemberId) return;
					updateMemberRole.mutate(
						{ memberId: roleMemberId, role: nextRole },
						{
							onSuccess: () => {
								roleDialogOpen = false;
								roleMemberId = null;
							},
							onError: (error) => {
								roleError = formatOrgAccountError(error, "Failed to change role.");
							},
						}
					);
				}}
			>
				{updateMemberRole.isPending ? "Saving..." : "Save"}
			</Button>
		</DialogFooter>
	</DialogContent>
</DialogRoot>
