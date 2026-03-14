<script lang="ts">
	import { Button } from "@my-app/ui/components/button";
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
	import { createMutation, createQuery } from "@tanstack/svelte-query";
	import { authClient } from "$lib/auth-client";
	import { createConfirmAction } from "$lib/confirm-action.svelte";
	import { formatMutationError } from "$lib/mutation-result";
	import { queryClient } from "$lib/orpc";
	import { fullOrganizationQueryOptions } from "$lib/query-options";
	import ConfirmActionDialog from "../../../components/admin/ConfirmActionDialog.svelte";
	import ResourceBadgeCell from "../../../components/operator/ResourceBadgeCell.svelte";
	import ResourceTable from "../../../components/operator/ResourceTable.svelte";
	import {
		type ColumnDef,
		createColumnHelper,
		renderComponent,
	} from "../../../components/operator/resource-table";
	import SurfaceCard from "../../../components/operator/SurfaceCard.svelte";
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
	import OrganizationInvitationActionsCell from "./OrganizationInvitationActionsCell.svelte";
	import OrganizationTeamMemberActionsCell from "./OrganizationTeamMemberActionsCell.svelte";

	const fullOrgQuery = createQuery(() => fullOrganizationQueryOptions());

	const removeAction = createConfirmAction<string>();

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

	type MemberRow = {
		id: string;
		role: string;
		user?: {
			name?: string | null;
			email?: string | null;
		} | null;
	};

	type InvitationRow = {
		id: string;
		email: string;
		role?: string | null;
		status?: string | null;
	};

	const memberColumnHelper = createColumnHelper<MemberRow>();
	const invitationColumnHelper = createColumnHelper<InvitationRow>();

	const memberColumns: ColumnDef<MemberRow, unknown>[] = [
		memberColumnHelper.accessor((member) => member.user?.name ?? "—", {
			id: "name",
			header: "Name",
			meta: {
				cellClass: "font-medium",
			},
		}),
		memberColumnHelper.accessor((member) => member.user?.email ?? "—", {
			id: "email",
			header: "Email",
			meta: {
				cellClass: "text-muted-foreground",
			},
		}),
		memberColumnHelper.display({
			id: "role",
			header: "Role",
			cell: ({ row }) =>
				renderComponent(ResourceBadgeCell, {
					label: row.original.role,
					variant: getOrgRoleBadgeVariant(row.original.role),
				}),
		}),
		memberColumnHelper.display({
			id: "actions",
			header: "Actions",
			meta: {
				headerClass: "w-40",
			},
			cell: ({ row }) =>
				renderComponent(OrganizationTeamMemberActionsCell, {
					onChangeRole: () => {
						roleMemberId = row.original.id;
						roleMemberName =
							row.original.user?.name ?? row.original.user?.email ?? "member";
						nextRole = row.original.role as OrgRole;
						roleError = null;
						roleDialogOpen = true;
					},
					onRemove: () => {
						removeAction.request(
							row.original.id,
							row.original.user?.name ?? row.original.user?.email ?? "member"
						);
					},
				}),
		}),
	];

	const pendingInvitationColumns: ColumnDef<InvitationRow, unknown>[] = [
		invitationColumnHelper.accessor("email", {
			header: "Email",
			meta: {
				cellClass: "font-medium",
			},
		}),
		invitationColumnHelper.display({
			id: "role",
			header: "Role",
			cell: ({ row }) =>
				renderComponent(ResourceBadgeCell, {
					label: row.original.role ?? "member",
					variant: "secondary",
				}),
		}),
		invitationColumnHelper.display({
			id: "actions",
			header: "Actions",
			meta: {
				headerClass: "w-24",
			},
			cell: ({ row }) =>
				renderComponent(OrganizationInvitationActionsCell, {
					pending:
						cancelInvitation.isPending &&
						pendingInvitationId === row.original.id,
					onCancel: () => {
						pendingInvitationId = row.original.id;
						invitationError = null;
						cancelInvitation.mutate(
							{ invitationId: row.original.id },
							{
								onSuccess: () => {
									pendingInvitationId = null;
								},
								onError: (error) => {
									pendingInvitationId = null;
									invitationError = formatMutationError(
										error,
										"Failed to cancel invitation."
									);
								},
							}
						);
					},
				}),
		}),
	];
</script>

<div class="space-y-4">
	{#if fullOrgQuery.isPending}
		<p class="text-muted-foreground">Loading...</p>
	{:else if fullOrgQuery.isError}
		<p class="text-destructive">Failed to load organization.</p>
	{:else if fullOrgQuery.data}
		{@const org = fullOrgQuery.data}

		<SurfaceCard
			title={`Members (${org.members?.length ?? 0})`}
			description="Manage team members and their roles."
		>
			{#snippet children()}
				<div data-testid="org-team-members-title" class="sr-only">
					Members ({org.members?.length ?? 0})
				</div>
				<ResourceTable
					data={(org.members ?? []) as MemberRow[]}
					columns={memberColumns}
					getRowId={(member) => member.id}
					emptyMessage="No members."
				/>
			{/snippet}
		</SurfaceCard>

		{#if pendingInvitations.length > 0}
			<SurfaceCard title={`Pending Invitations (${pendingInvitations.length})`}>
				{#snippet children()}
					<div class="space-y-3">
						{#if invitationError}
							<p class="text-sm text-destructive">{invitationError}</p>
						{/if}
						<ResourceTable
							data={pendingInvitations as InvitationRow[]}
							columns={pendingInvitationColumns}
							getRowId={(invitation) => invitation.id}
							emptyMessage="No pending invitations."
						/>
					</div>
				{/snippet}
			</SurfaceCard>
		{/if}
	{/if}
</div>

<ConfirmActionDialog
	bind:open={removeAction.open}
	title="Remove Member"
	description={`Remove ${removeAction.targetLabel} from this organization?`}
	confirmLabel="Remove"
	pendingLabel="Removing..."
	pending={removeMember.isPending}
	errorMessage={removeAction.error}
	onConfirm={() => {
		if (!removeAction.targetId) return;
		removeMember.mutate(
			{ memberId: removeAction.targetId },
			{
				onSuccess: () => removeAction.close(),
				onError: (error) => {
					removeAction.fail(formatMutationError(error, "Failed to remove member."));
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
								roleError = formatMutationError(error, "Failed to change role.");
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
