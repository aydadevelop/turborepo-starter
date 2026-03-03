<script lang="ts">
	import { Button } from "@my-app/ui/components/button";
	import * as Card from "@my-app/ui/components/card";
	import * as Dialog from "@my-app/ui/components/dialog";
	import { Input } from "@my-app/ui/components/input";
	import { Label } from "@my-app/ui/components/label";
	import { createQuery } from "@tanstack/svelte-query";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { authClient } from "$lib/auth-client";
	import { orpc, queryClient } from "$lib/orpc";
	import { queryKeys } from "$lib/query-keys";
	import { fullOrganizationQueryOptions } from "$lib/query-options";

	const canManageQuery = createQuery({
		...orpc.canManageOrganization.queryOptions(),
		retry: false,
	});

	const fullOrgQuery = createQuery(fullOrganizationQueryOptions());

	let orgName = $state("");
	let orgSlug = $state("");
	let savePending = $state(false);
	let saveError = $state<string | null>(null);
	let saveSuccess = $state(false);

	let deleteOpen = $state(false);
	let deleteConfirm = $state("");
	let deletePending = $state(false);
	let deleteError = $state<string | null>(null);

	// Seed form from loaded org data
	$effect(() => {
		const org = $fullOrgQuery.data;
		if (org && !orgName) {
			orgName = org.name;
			orgSlug = org.slug ?? "";
		}
	});

	// Guard: only org managers can access this page
	$effect(() => {
		if ($canManageQuery.isPending) return;
		if (!$canManageQuery.data?.canManageOrganization) {
			goto(resolve("/dashboard/settings"));
		}
	});

	const handleSave = async () => {
		savePending = true;
		saveError = null;
		saveSuccess = false;

		const trimmedName = orgName.trim();
		const trimmedSlug = orgSlug.trim();

		if (!trimmedName) {
			saveError = "Organization name is required.";
			savePending = false;
			return;
		}

		const { error } = await authClient.organization.update({
			data: {
				name: trimmedName,
				slug: trimmedSlug || undefined,
			},
		});

		savePending = false;

		if (error) {
			saveError =
				(error as { message?: string }).message ??
				"Failed to update organization.";
			return;
		}

		saveSuccess = true;
		queryClient.invalidateQueries({ queryKey: queryKeys.org.root });
		queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all });
	};

	const handleDelete = async () => {
		deletePending = true;
		deleteError = null;

		const orgDel = authClient.organization as unknown as {
			delete: (args: {
				organizationId?: string;
			}) => Promise<{ error: unknown }>;
		};
		const { error } = await orgDel.delete({
			organizationId: $fullOrgQuery.data?.id,
		});

		deletePending = false;

		if (error) {
			deleteError =
				(error as { message?: string }).message ??
				"Failed to delete organization.";
			return;
		}

		queryClient.invalidateQueries({ queryKey: queryKeys.org.root });
		queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all });
		queryClient.invalidateQueries({ queryKey: queryKeys.org.canManage });
		goto(resolve("/org"));
	};

	const currentOrgName = $derived($fullOrgQuery.data?.name ?? "");
</script>

{#if $fullOrgQuery.isPending || $canManageQuery.isPending}
	<p class="text-muted-foreground">Loading...</p>
{:else if !$canManageQuery.data?.canManageOrganization}
	<p class="text-muted-foreground">Access denied</p>
{:else}
	<div class="max-w-xl space-y-4">
		<Card.Root>
			<Card.Header>
				<Card.Title>Organization details</Card.Title>
				<Card.Description
					>Update your organization's name and slug.</Card.Description
				>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="space-y-2">
					<Label for="org-name">Name</Label>
					<Input
						id="org-name"
						type="text"
						value={orgName}
						oninput={(e: Event) => {
							orgName = (e.target as HTMLInputElement).value;
							saveSuccess = false;
						}}
					/>
				</div>
				<div class="space-y-2">
					<Label for="org-slug">Slug</Label>
					<Input
						id="org-slug"
						type="text"
						placeholder="my-organization"
						value={orgSlug}
						oninput={(e: Event) => {
							orgSlug = (e.target as HTMLInputElement).value;
							saveSuccess = false;
						}}
					/>
					<p class="text-xs text-muted-foreground">
						Used in URLs. Only lowercase letters, numbers, and hyphens.
					</p>
				</div>
				{#if saveError}
					<p class="text-sm text-destructive">{saveError}</p>
				{/if}
				{#if saveSuccess}
					<p class="text-sm text-green-600">Changes saved.</p>
				{/if}
			</Card.Content>
			<Card.Footer>
				<Button onclick={() => void handleSave()} disabled={savePending}>
					{savePending ? "Saving..." : "Save changes"}
				</Button>
			</Card.Footer>
		</Card.Root>

		<Card.Root class="border-destructive">
			<Card.Header>
				<Card.Title class="text-destructive">Danger zone</Card.Title>
				<Card.Description>
					Permanently delete this organization and all its data.
				</Card.Description>
			</Card.Header>
			<Card.Footer>
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
			</Card.Footer>
		</Card.Root>
	</div>

	<Dialog.Root bind:open={deleteOpen}>
		<Dialog.Content>
			<Dialog.Header>
				<Dialog.Title>Delete organization</Dialog.Title>
				<Dialog.Description>
					This action is irreversible. Type <strong>{currentOrgName}</strong> to
					confirm.
				</Dialog.Description>
			</Dialog.Header>
			<div class="space-y-3 py-2">
				<Input
					type="text"
					placeholder={currentOrgName}
					value={deleteConfirm}
					oninput={(e: Event) =>
						(deleteConfirm = (e.target as HTMLInputElement).value)}
				/>
				{#if deleteError}
					<p class="text-sm text-destructive">{deleteError}</p>
				{/if}
			</div>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (deleteOpen = false)}
					>Cancel</Button
				>
				<Button
					variant="destructive"
					disabled={deleteConfirm !== currentOrgName || deletePending}
					onclick={() => void handleDelete()}
				>
					{deletePending ? "Deleting..." : "Delete"}
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>
{/if}
