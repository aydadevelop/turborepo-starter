<script lang="ts">
	import { Badge } from "@my-app/ui/components/badge";
	import { Button } from "@my-app/ui/components/button";
	import * as Card from "@my-app/ui/components/card";
	import { Input } from "@my-app/ui/components/input";
	import { Label } from "@my-app/ui/components/label";
	import { createQuery } from "@tanstack/svelte-query";
	import { authClient } from "$lib/auth-client";
	import { orpc, queryClient } from "$lib/orpc";

	const canManageQuery = createQuery({
		...orpc.canManageOrganization.queryOptions(),
		retry: false,
	});

	let email = $state("");
	let selectedRole = $state("agent");
	let pending = $state(false);
	let successMessage = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);

	const roles = [
		{
			value: "org_admin",
			label: "Admin",
			description:
				"Full organization management. Can manage members, settings, and all resources.",
		},
		{
			value: "manager",
			label: "Manager",
			description:
				"Manage tasks, payments, and support. Limited member management.",
		},
		{
			value: "agent",
			label: "Agent",
			description:
				"Handle support tickets and intake requests. Read-only access to payments.",
		},
		{
			value: "member",
			label: "Member",
			description: "Read-only access to organization data.",
		},
	];

	const handleInvite = async () => {
		const trimmedEmail = email.trim();
		if (!trimmedEmail) {
			errorMessage = "Email is required.";
			return;
		}

		const organizationId = $canManageQuery.data?.organizationId;
		if (!organizationId) {
			errorMessage = "Organization not found. Please try again.";
			return;
		}

		pending = true;
		errorMessage = null;
		successMessage = null;

		const { error } = await authClient.organization.inviteMember({
			email: trimmedEmail,
			role: selectedRole as "admin" | "member" | "owner",
			organizationId,
		});

		pending = false;

		if (error) {
			errorMessage =
				(error as { message?: string }).message ?? "Failed to send invitation.";
			return;
		}

		successMessage = `Invitation sent to ${trimmedEmail} as ${selectedRole}.`;
		email = "";
		queryClient.invalidateQueries({ queryKey: ["organization"] });
	};
</script>

<div class="space-y-4">
	<Card.Root class="max-w-lg">
		<Card.Header>
			<Card.Title>Invite Team Member</Card.Title>
			<Card.Description>
				Send an invitation to join your organization. They'll receive an email
				with instructions.
			</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			<div class="space-y-2">
				<Label for="invite-email">Email address</Label>
				<Input
					id="invite-email"
					type="email"
					placeholder="name@example.com"
					value={email}
					oninput={(e) => (email = (e.target as HTMLInputElement).value)}
				/>
			</div>

			<div class="space-y-2">
				<Label>Role</Label>
				<div class="space-y-2">
					{#each roles as role (role.value)}
						<button
							type="button"
							class="flex w-full items-start gap-3 rounded-md border p-3 text-left transition
								{selectedRole === role.value
								? 'border-primary bg-accent'
								: 'hover:bg-accent/50'}"
							onclick={() => { selectedRole = role.value; }}
						>
							<div
								class="mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 transition
									{selectedRole === role.value
									? 'border-primary bg-primary'
									: 'border-muted-foreground'}"
							></div>
							<div>
								<p class="text-sm font-medium">
									{role.label}
									{#if role.value === "agent"}
										<Badge variant="secondary" class="ml-1">
											Recommended for captains
										</Badge>
									{/if}
								</p>
								<p class="text-xs text-muted-foreground">{role.description}</p>
							</div>
						</button>
					{/each}
				</div>
			</div>

			{#if successMessage}
				<p class="text-sm text-primary">{successMessage}</p>
			{/if}
			{#if errorMessage}
				<p class="text-sm text-destructive">{errorMessage}</p>
			{/if}
		</Card.Content>
		<Card.Footer>
			<Button onclick={() => void handleInvite()} disabled={pending}>
				{pending ? "Sending..." : "Send Invitation"}
			</Button>
		</Card.Footer>
	</Card.Root>

	<Card.Root class="max-w-lg">
		<Card.Header> <Card.Title>Role Guide</Card.Title> </Card.Header>
		<Card.Content>
			<div class="space-y-3 text-sm">
				<div>
					<p class="font-medium">Admin</p>
					<p class="text-muted-foreground">
						Full management: members, settings, tasks, payments, and support.
						Use for co-owners or office managers.
					</p>
				</div>
				<div>
					<p class="font-medium">Manager</p>
					<p class="text-muted-foreground">
						Day-to-day operations: manage tasks, handle payments, process
						support tickets. Cannot delete members.
					</p>
				</div>
				<div>
					<p class="font-medium">Agent</p>
					<p class="text-muted-foreground">
						Front-line work: handle support tickets and intake requests.
						Read-only access to payments.
					</p>
				</div>
				<div>
					<p class="font-medium">Member</p>
					<p class="text-muted-foreground">
						View-only access to organization data. Good for observers or
						stakeholders.
					</p>
				</div>
			</div>
		</Card.Content>
	</Card.Root>
</div>
