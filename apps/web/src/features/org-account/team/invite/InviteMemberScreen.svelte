<!-- biome-ignore-all format: TanStack Form component member syntax not supported -->
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
import { Input } from "@my-app/ui/components/input";
import { Label } from "@my-app/ui/components/label";
import { createForm } from "@tanstack/svelte-form";
import { createQuery } from "@tanstack/svelte-query";
import { authClient } from "$lib/auth-client";
import { orpc, queryClient } from "$lib/orpc";
import { formatOrgAccountError } from "../../shared/errors";
import {
	getMembershipInvalidationKeys,
	invalidateQueryKeys,
} from "../../shared/invalidations";
import { ORG_ROLE_OPTIONS } from "../../shared/roles";
import {
	getInviteMemberDefaults,
	type InviteMemberFormValues,
	inviteMemberSchema,
} from "./schema";
import { submitInviteMember } from "./submit";

const canManageQuery = createQuery(() => ({
	...orpc.canManageOrganization.queryOptions(),
	retry: false,
}));

let submitError = $state<string | null>(null);
let successMessage = $state<string | null>(null);
const defaultValues: InviteMemberFormValues = getInviteMemberDefaults();

const form = createForm(() => ({
	defaultValues,
	onSubmit: async ({ value }) => {
		submitError = null;
		successMessage = null;

		const organizationId = canManageQuery.data?.organizationId;
		if (!organizationId) {
			submitError = "Organization not found. Please try again.";
			return;
		}

		const result = await submitInviteMember(
			{
				inviteMember: async ({ email, role, organizationId }) =>
					authClient.organization.inviteMember({
						email,
						role: role as "admin" | "member" | "owner",
						organizationId,
					}),
				invalidateMembership: () =>
					invalidateQueryKeys(queryClient, getMembershipInvalidationKeys()),
			},
			{
				...value,
				organizationId,
			}
		);

		if (!result.ok) {
			submitError = result.message;
			return;
		}

		successMessage = result.data.message;
		form.reset(defaultValues);
	},
	validators: {
		onSubmit: inviteMemberSchema,
	},
}));
</script>

<div class="space-y-4">
	<Card class="max-w-lg">
		<CardHeader>
			<CardTitle>Invite Team Member</CardTitle>
			<CardDescription>
				Send an invitation to join your organization. They'll receive an email
				with instructions.
			</CardDescription>
		</CardHeader>
		<CardContent>
			<form
				class="space-y-4"
				onsubmit={(event) => {
					event.preventDefault();
					event.stopPropagation();
					form.handleSubmit();
				}}
			>
				<form.Field name="email">
					{#snippet children(field)}
						<div class="space-y-2">
							<Label for={field.name}>Email address</Label>
							<Input
								id={field.name}
								name={field.name}
								type="email"
								placeholder="name@example.com"
								onblur={field.handleBlur}
								value={field.state.value}
								oninput={(event: Event) => {
									const target = event.target as HTMLInputElement;
									field.handleChange(target.value);
									submitError = null;
									successMessage = null;
								}}
							/>
							{#if field.state.meta.isTouched}
								{#each field.state.meta.errors as err}
									<p class="text-sm text-destructive" role="alert">
										{formatOrgAccountError(err, "Email is required.")}
									</p>
								{/each}
							{/if}
						</div>
					{/snippet}
				</form.Field>

				<form.Field name="role">
					{#snippet children(field)}
						<div class="space-y-2">
							<Label>Role</Label>
							<div class="space-y-2">
								{#each ORG_ROLE_OPTIONS.filter((role) => role.value !== "org_owner") as role (role.value)}
									<button
										type="button"
										class="flex w-full items-start gap-3 rounded-md border p-3 text-left transition
											{field.state.value === role.value
											? 'border-primary bg-accent'
											: 'hover:bg-accent/50'}"
										onclick={() => {
											field.handleChange(role.value);
											submitError = null;
											successMessage = null;
										}}
									>
										<div
											class="mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 transition
												{field.state.value === role.value
												? 'border-primary bg-primary'
												: 'border-muted-foreground'}"
										></div>
										<div>
											<p class="text-sm font-medium">
												{role.label}
												{#if role.recommendedLabel}
													<Badge variant="secondary" class="ml-1">
														{role.recommendedLabel}
													</Badge>
												{/if}
											</p>
											<p class="text-xs text-muted-foreground">
												{role.description}
											</p>
										</div>
									</button>
								{/each}
							</div>
							{#if field.state.meta.isTouched}
								{#each field.state.meta.errors as err}
									<p class="text-sm text-destructive" role="alert">
										{formatOrgAccountError(err, "Please select a role.")}
									</p>
								{/each}
							{/if}
						</div>
					{/snippet}
				</form.Field>

				{#if successMessage}
					<p class="text-sm text-primary">{successMessage}</p>
				{/if}
				{#if submitError}
					<p class="text-sm text-destructive">{submitError}</p>
				{/if}

				<form.Subscribe
					selector={(state) => ({
						canSubmit: state.canSubmit,
						isSubmitting: state.isSubmitting,
					})}
				>
					{#snippet children(state)}
						<Button
							type="submit"
							disabled={
								canManageQuery.isPending ||
								!state.canSubmit ||
								state.isSubmitting
							}
						>
							{state.isSubmitting ? "Sending..." : "Send Invitation"}
						</Button>
					{/snippet}
				</form.Subscribe>
			</form>
		</CardContent>
	</Card>

	<Card class="max-w-lg">
		<CardHeader>
			<CardTitle>Role Guide</CardTitle>
		</CardHeader>
		<CardContent>
			<div class="space-y-3 text-sm">
				{#each ORG_ROLE_OPTIONS.filter((role) => role.value !== "org_owner") as role (role.value)}
					<div>
						<p class="font-medium">{role.label}</p>
						<p class="text-muted-foreground">{role.description}</p>
					</div>
				{/each}
			</div>
		</CardContent>
	</Card>
</div>