<script lang="ts">
	import { Badge } from "@my-app/ui/components/badge";
	import { Button } from "@my-app/ui/components/button";
	import * as Card from "@my-app/ui/components/card";
	import * as Dialog from "@my-app/ui/components/dialog";
	import * as Table from "@my-app/ui/components/table";
	import { createQuery } from "@tanstack/svelte-query";
	import { authClient } from "$lib/auth-client";
	import { queryClient } from "$lib/orpc";

	const fullOrgQuery = createQuery({
		queryKey: ["organization", "full"],
		queryFn: async () => {
			const { data, error } =
				await authClient.organization.getFullOrganization();
			if (error) throw error;
			return data;
		},
	});

	let removingMemberId = $state<string | null>(null);
	let confirmRemoveOpen = $state(false);
	let confirmRemoveName = $state("");
	let removeError = $state<string | null>(null);

	let changingRoleMemberId = $state<string | null>(null);
	let changingRoleNewRole = $state("");
	let changeRoleOpen = $state(false);
	let changeRoleName = $state("");
	let changeRoleError = $state<string | null>(null);

	const orgRoles = [
		{
			value: "org_owner",
			label: "Owner",
			description: "Full access to everything",
		},
		{
			value: "org_admin",
			label: "Admin",
			description: "Full access, cannot delete org",
		},
		{
			value: "manager",
			label: "Manager",
			description: "Manage tasks, payments, support",
		},
		{
			value: "agent",
			label: "Agent",
			description: "Handle support tickets and intake requests",
		},
		{ value: "member", label: "Member", description: "Read-only access" },
	];

	const roleColor = (role: string) => {
		switch (role) {
			case "org_owner":
			case "owner":
				return "default" as const;
			case "org_admin":
			case "admin":
				return "default" as const;
			case "manager":
				return "secondary" as const;
			case "agent":
				return "secondary" as const;
			default:
				return "outline" as const;
		}
	};

	const openRemoveDialog = (memberId: string, name: string) => {
		removingMemberId = memberId;
		confirmRemoveName = name;
		removeError = null;
		confirmRemoveOpen = true;
	};

	const handleRemoveMember = async () => {
		if (!removingMemberId) return;
		removeError = null;
		const { error } = await authClient.organization.removeMember({
			memberIdOrEmail: removingMemberId,
		});
		if (error) {
			removeError =
				(error as { message?: string }).message ?? "Failed to remove member";
			return;
		}
		confirmRemoveOpen = false;
		removingMemberId = null;
		queryClient.invalidateQueries({ queryKey: ["organization"] });
	};

	const openChangeRoleDialog = (
		memberId: string,
		name: string,
		currentRole: string
	) => {
		changingRoleMemberId = memberId;
		changeRoleName = name;
		changingRoleNewRole = currentRole;
		changeRoleError = null;
		changeRoleOpen = true;
	};

	const handleChangeRole = async () => {
		if (!changingRoleMemberId) return;
		if (!changingRoleNewRole) return;
		changeRoleError = null;
		const { error } = await authClient.organization.updateMemberRole({
			memberId: changingRoleMemberId,
			role: changingRoleNewRole,
		});
		if (error) {
			changeRoleError =
				(error as { message?: string }).message ?? "Failed to change role";
			return;
		}
		changeRoleOpen = false;
		changingRoleMemberId = null;
		queryClient.invalidateQueries({ queryKey: ["organization"] });
	};

	const handleCancelInvitation = async (invitationId: string) => {
		await authClient.organization.cancelInvitation({ invitationId });
		queryClient.invalidateQueries({ queryKey: ["organization"] });
	};
</script>

<div class="space-y-4">
	{#if $fullOrgQuery.isPending}
		<p class="text-muted-foreground">Loading...</p>
	{:else if $fullOrgQuery.isError}
		<p class="text-destructive">Failed to load organization.</p>
	{:else if $fullOrgQuery.data}
		{@const org = $fullOrgQuery.data}

		<!-- Members -->
		<Card.Root>
			<Card.Header>
				<Card.Title>Members ({org.members?.length ?? 0})</Card.Title>
				<Card.Description>Manage team members and their roles</Card.Description>
			</Card.Header>
			<Card.Content class="p-0">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Name</Table.Head>
							<Table.Head>Email</Table.Head>
							<Table.Head>Role</Table.Head>
							<Table.Head class="w-40">Actions</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each org.members ?? [] as m (m.id)}
							<Table.Row>
								<Table.Cell class="font-medium">
									{m.user?.name ?? "—"}
								</Table.Cell>
								<Table.Cell class="text-muted-foreground">
									{m.user?.email ?? "—"}
								</Table.Cell>
								<Table.Cell>
									<Badge variant={roleColor(m.role)}>{m.role}</Badge>
								</Table.Cell>
								<Table.Cell>
									<div class="flex gap-1">
										<Button
											variant="outline"
											size="sm"
											onclick={() =>
												openChangeRoleDialog(
													m.id,
													m.user?.name ?? m.user?.email ?? "member",
													m.role
												)}
										>
											Role
										</Button>
										<Button
											variant="outline"
											size="sm"
											onclick={() =>
												openRemoveDialog(
													m.id,
													m.user?.name ?? m.user?.email ?? "member"
												)}
										>
											Remove
										</Button>
									</div>
								</Table.Cell>
							</Table.Row>
						{:else}
							<Table.Row>
								<Table.Cell
									colspan={4}
									class="text-center text-muted-foreground"
								>
									No members.
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>

		<!-- Pending Invitations -->
		{@const pendingInvitations = (org.invitations ?? []).filter((i) => i.status === "pending")}
		{#if pendingInvitations.length > 0}
			<Card.Root>
				<Card.Header>
					<Card.Title>
						Pending Invitations ({pendingInvitations.length})
					</Card.Title>
				</Card.Header>
				<Card.Content class="p-0">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>Email</Table.Head>
								<Table.Head>Role</Table.Head>
								<Table.Head class="w-24">Actions</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each pendingInvitations as inv (inv.id)}
								<Table.Row>
									<Table.Cell class="font-medium">{inv.email}</Table.Cell>
									<Table.Cell>
										<Badge variant="secondary">{inv.role ?? "member"}</Badge>
									</Table.Cell>
									<Table.Cell>
										<Button
											variant="outline"
											size="sm"
											onclick={() => handleCancelInvitation(inv.id)}
										>
											Cancel
										</Button>
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</Card.Content>
			</Card.Root>
		{/if}
	{/if}
</div>

<!-- Remove Member Dialog -->
<Dialog.Root bind:open={confirmRemoveOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Remove Member</Dialog.Title>
			<Dialog.Description>
				Are you sure you want to remove <strong>{confirmRemoveName}</strong>
				from this organization?
			</Dialog.Description>
		</Dialog.Header>
		{#if removeError}
			<p class="text-sm text-destructive">{removeError}</p>
		{/if}
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (confirmRemoveOpen = false)}>
				Cancel
			</Button>
			<Button variant="destructive" onclick={() => void handleRemoveMember()}>
				Remove
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Change Role Dialog -->
<Dialog.Root bind:open={changeRoleOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Change Role</Dialog.Title>
			<Dialog.Description>
				Select a new role for <strong>{changeRoleName}</strong>
			</Dialog.Description>
		</Dialog.Header>
		<div class="space-y-2 py-2">
			{#each orgRoles as role (role.value)}
				<button
					type="button"
					class="flex w-full items-center gap-3 rounded-md border p-3 text-left transition
						{changingRoleNewRole === role.value
						? 'border-primary bg-accent'
						: 'hover:bg-accent/50'}"
					onclick={() => (changingRoleNewRole = role.value)}
				>
					<div>
						<p class="text-sm font-medium">{role.label}</p>
						<p class="text-xs text-muted-foreground">{role.description}</p>
					</div>
				</button>
			{/each}
		</div>
		{#if changeRoleError}
			<p class="text-sm text-destructive">{changeRoleError}</p>
		{/if}
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (changeRoleOpen = false)}>
				Cancel
			</Button>
			<Button onclick={() => void handleChangeRole()}>Save</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
