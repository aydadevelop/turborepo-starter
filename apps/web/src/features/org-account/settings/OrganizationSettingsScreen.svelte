<!-- biome-ignore-all format: TanStack Form component member syntax not supported -->
<script lang="ts">
	import { Button } from "@my-app/ui/components/button";
	import { Input } from "@my-app/ui/components/input";
	import { createForm } from "@tanstack/svelte-form";
	import { createMutation, createQuery } from "@tanstack/svelte-query";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { authClient } from "$lib/auth-client";
	import { orpc, queryClient } from "$lib/orpc";
	import { fullOrganizationQueryOptions } from "$lib/query-options";
	import ConfirmActionDialog from "../../../components/admin/ConfirmActionDialog.svelte";
	import FormFieldShell from "../../../components/operator/FormFieldShell.svelte";
	import SurfaceCard from "../../../components/operator/SurfaceCard.svelte";
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
		<SurfaceCard
			title="Organization details"
			description="Update your organization's name and slug."
		>
			{#snippet children()}
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
							<FormFieldShell
								id={field.name}
								label="Name"
								showErrors={field.state.meta.isTouched}
								errors={field.state.meta.errors.map((err) =>
									formatOrgAccountError(err, "Organization name is required.")
								)}
							>
								{#snippet children()}
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
								{/snippet}
							</FormFieldShell>
						{/snippet}
					</form.Field>

					<form.Field name="slug">
						{#snippet children(field)}
							<FormFieldShell
								id={field.name}
								label="Slug"
								description="Used in URLs. Only lowercase letters, numbers, and hyphens."
								showErrors={field.state.meta.isTouched}
								errors={field.state.meta.errors.map((err) =>
									formatOrgAccountError(
										err,
										"Slug can only contain lowercase letters, numbers, and hyphens."
									)
								)}
							>
								{#snippet children()}
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
								{/snippet}
							</FormFieldShell>
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
			{/snippet}
		</SurfaceCard>

		<SurfaceCard
			title="Danger zone"
			description="Permanently delete this organization and all its data."
			class="border-destructive"
			contentClass="pt-0"
		>
			{#snippet action()}
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
			{/snippet}
			{#snippet children()}{/snippet}
		</SurfaceCard>
	</div>
{/if}

<ConfirmActionDialog
	bind:open={deleteOpen}
	title="Delete organization"
	description={`Delete ${currentOrgName || "this organization"} permanently? This action cannot be undone.`}
	confirmLabel="Delete organization"
	pendingLabel="Deleting..."
	confirmDisabled={deleteConfirm !== currentOrgName}
	pending={deleteOrganization.isPending}
	errorMessage={deleteError}
	onConfirm={() => {
		const organizationId = fullOrgQuery.data?.id;
		if (!organizationId) return;
		deleteOrganization.mutate(
			{ organizationId },
			{
				onSuccess: () => {
					deleteOpen = false;
					deleteConfirm = "";
				},
				onError: (error) => {
					deleteError = formatOrgAccountError(
						error,
						"Failed to delete organization."
					);
				},
			}
		);
	}}
>
	{#snippet children()}
		<FormFieldShell
			id="delete-organization-confirm"
			label="Type the organization name to confirm"
			description={`Enter "${currentOrgName || "this organization"}" to enable deletion.`}
		>
			{#snippet children()}
				<Input
					id="delete-organization-confirm"
					name="delete-organization-confirm"
					type="text"
					autocomplete="off"
					value={deleteConfirm}
					oninput={(event: Event) => {
						const target = event.target as HTMLInputElement;
						deleteConfirm = target.value;
						deleteError = null;
					}}
				/>
			{/snippet}
		</FormFieldShell>
	{/snippet}
</ConfirmActionDialog>
