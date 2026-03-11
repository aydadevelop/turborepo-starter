<!-- biome-ignore-all format: TanStack Form component member syntax not supported -->
<script lang="ts">
	import { Button } from "@my-app/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@my-app/ui/components/card";
import { Input } from "@my-app/ui/components/input";
import { Label } from "@my-app/ui/components/label";
import { createForm } from "@tanstack/svelte-form";
import { createMutation, createQuery } from "@tanstack/svelte-query";
import { goto } from "$app/navigation";
import { resolve } from "$app/paths";
import { authClient } from "$lib/auth-client";
import { orpc, queryClient } from "$lib/orpc";
import { fullOrganizationQueryOptions } from "$lib/query-options";
import ConfirmActionDialog from "../../../components/admin/ConfirmActionDialog.svelte";
import { formatOrgAccountError } from "../shared/errors";
import {
	getOrganizationStructureInvalidationKeys,
	invalidateQueryKeys,
} from "../shared/invalidations";
import {
	getOrganizationSettingsDefaults,
	organizationSettingsSchema,
} from "./schema";
import { deleteOrganizationRecord, submitOrganizationSettings } from "./submit";

const canManageQuery = createQuery(() => ({
	...orpc.canManageOrganization.queryOptions(),
	retry: false,
}));

const fullOrgQuery = createQuery(() => fullOrganizationQueryOptions());

let saveError = $state<string | null>(null);
let saveSuccess = $state(false);
let deleteOpen = $state(false);
let deleteConfirm = $state("");
let deleteError = $state<string | null>(null);
let seededSignature = $state<string | null>(null);

const form = createForm(() => ({
	defaultValues: getOrganizationSettingsDefaults(),
	onSubmit: async ({ value }) => {
		saveError = null;
		saveSuccess = false;

		const result = await submitOrganizationSettings(
			{
				updateOrganization: authClient.organization.update,
				invalidateOrganizationStructure: () =>
					invalidateQueryKeys(
						queryClient,
						getOrganizationStructureInvalidationKeys()
					),
			},
			value
		);

		if (!result.ok) {
			saveError = result.message;
			return;
		}

		saveSuccess = true;
	},
	validators: {
		onSubmit: organizationSettingsSchema,
	},
}));

const deleteOrganization = createMutation(() => ({
	mutationFn: async ({ organizationId }: { organizationId?: string }) => {
		const result = await deleteOrganizationRecord(
			{
				deleteOrganization: (
					authClient.organization as unknown as {
						delete: (args: {
							organizationId?: string;
						}) => Promise<{ error: unknown }>;
					}
				).delete,
				invalidateOrganizationStructure: () =>
					invalidateQueryKeys(
						queryClient,
						getOrganizationStructureInvalidationKeys()
					),
			},
			organizationId
		);

		if (!result.ok) {
			throw new Error(result.message);
		}
	},
}));

$effect(() => {
	if (canManageQuery.isPending) return;
	if (!canManageQuery.data?.canManageOrganization) {
		goto(resolve("/dashboard/settings"));
	}
});

$effect(() => {
	const org = fullOrgQuery.data;
	if (!org) return;

	const nextSignature = `${org.id}:${org.name}:${org.slug ?? ""}`;
	if (seededSignature === nextSignature) return;

	form.reset(getOrganizationSettingsDefaults(org));
	saveError = null;
	saveSuccess = false;
	seededSignature = nextSignature;
});

const currentOrgName = $derived(fullOrgQuery.data?.name ?? "");
</script>

{#if fullOrgQuery.isPending || canManageQuery.isPending}
	<p class="text-muted-foreground">Loading...</p>
{:else if !canManageQuery.data?.canManageOrganization}
	<p class="text-muted-foreground">Access denied</p>
{:else}
	<div class="max-w-xl space-y-4">
		<Card>
			<CardHeader>
				<CardTitle>Organization details</CardTitle>
				<CardDescription>
					Update your organization's name and slug.
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
					<form.Field name="name">
						{#snippet children(field)}
							<div class="space-y-2">
								<Label for={field.name}>Name</Label>
								<Input
									id={field.name}
									name={field.name}
									type="text"
									onblur={field.handleBlur}
									value={field.state.value}
									oninput={(event: Event) => {
										const target = event.target as HTMLInputElement;
										field.handleChange(target.value);
										saveError = null;
										saveSuccess = false;
									}}
								/>
								{#if field.state.meta.isTouched}
									{#each field.state.meta.errors as err}
										<p class="text-sm text-destructive" role="alert">
											{formatOrgAccountError(
												err,
												"Organization name is required."
											)}
										</p>
									{/each}
								{/if}
							</div>
						{/snippet}
					</form.Field>

					<form.Field name="slug">
						{#snippet children(field)}
							<div class="space-y-2">
								<Label for={field.name}>Slug</Label>
								<Input
									id={field.name}
									name={field.name}
									type="text"
									placeholder="my-organization"
									onblur={field.handleBlur}
									value={field.state.value}
									oninput={(event: Event) => {
										const target = event.target as HTMLInputElement;
										field.handleChange(target.value);
										saveError = null;
										saveSuccess = false;
									}}
								/>
								<p class="text-xs text-muted-foreground">
									Used in URLs. Only lowercase letters, numbers, and hyphens.
								</p>
								{#if field.state.meta.isTouched}
									{#each field.state.meta.errors as err}
										<p class="text-sm text-destructive" role="alert">
											{formatOrgAccountError(
												err,
												"Slug can only contain lowercase letters, numbers, and hyphens."
											)}
										</p>
									{/each}
								{/if}
							</div>
						{/snippet}
					</form.Field>

					{#if saveError}
						<p class="text-sm text-destructive">{saveError}</p>
					{/if}
					{#if saveSuccess}
						<p class="text-sm text-green-600">Changes saved.</p>
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
								disabled={!state.canSubmit || state.isSubmitting}
							>
								{state.isSubmitting ? "Saving..." : "Save changes"}
							</Button>
						{/snippet}
					</form.Subscribe>
				</form>
			</CardContent>
		</Card>

		<Card class="border-destructive">
			<CardHeader>
				<CardTitle class="text-destructive">Danger zone</CardTitle>
				<CardDescription>
					Permanently delete this organization and all its data.
				</CardDescription>
			</CardHeader>
			<CardFooter>
				<Button
					variant="destructive"
					onclick={() => {
						deleteConfirm = "";
						deleteError = null;
						deleteOpen = true;
					}}
				>
					Delete organization
				</Button>
			</CardFooter>
		</Card>
	</div>

	<ConfirmActionDialog
		bind:open={deleteOpen}
		title="Delete organization"
		description={`This action is irreversible. Type ${currentOrgName} to confirm.`}
		confirmLabel="Delete"
		pendingLabel="Deleting..."
		confirmDisabled={deleteConfirm !== currentOrgName || deleteOrganization.isPending}
		pending={deleteOrganization.isPending}
		errorMessage={deleteError}
		onConfirm={() =>
			deleteOrganization.mutate(
				{ organizationId: fullOrgQuery.data?.id },
				{
					onSuccess: async () => {
						deleteOpen = false;
						await goto(resolve("/org"));
					},
					onError: (error) => {
						deleteError = formatOrgAccountError(
							error,
							"Failed to delete organization."
						);
					},
				}
			)}
	>
		{#snippet children()}
			<Input
				type="text"
				placeholder={currentOrgName}
				value={deleteConfirm}
				oninput={(event: Event) =>
					(deleteConfirm = (event.target as HTMLInputElement).value)}
			/>
		{/snippet}
	</ConfirmActionDialog>
{/if}