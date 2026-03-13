<!-- biome-ignore-all format: TanStack Form component member syntax not supported -->
<script lang="ts">
	import { Button } from "@my-app/ui/components/button";
	import {
		Option as NativeSelectOption,
		Root as NativeSelectRoot,
	} from "@my-app/ui/components/native-select";
	import { createForm } from "@tanstack/svelte-form";
	import FormFieldShell from "../../../../components/operator/FormFieldShell.svelte";
	import { z } from "zod";

	const distributionActionSchema = z.object({
		listingId: z.string().trim().min(1, "Select a listing."),
		channelType: z.enum(["own_site", "platform_marketplace"]),
	});
	type ListingActionOption = {
		id: string;
		name: string;
	};
	const distributionActionDefaults: {
		listingId: string;
		channelType: "own_site" | "platform_marketplace";
	} = {
		listingId: "",
		channelType: "platform_marketplace",
	};

	let {
		listingId,
		listingOptions = [],
		onSubmit,
		pending = false,
		errorMessage = null,
		showIntro = true,
		}: {
		errorMessage?: string | null;
		listingId?: string;
		listingOptions?: ListingActionOption[];
		onSubmit: (input: {
			channelType: "own_site" | "platform_marketplace";
			listingId: string;
		}) => void | Promise<void>;
		pending?: boolean;
		showIntro?: boolean;
	} = $props();

	const form = createForm(() => ({
		defaultValues: {
			...distributionActionDefaults,
			listingId: listingId ?? "",
		},
		onSubmit: async ({ value }) => {
			await onSubmit({
				listingId: value.listingId,
				channelType: value.channelType,
			});
		},
		validators: {
			onSubmit: distributionActionSchema,
		},
	}));

	function getFieldErrors(field: {
		state: { meta: { errors: unknown[] } };
	}): string[] {
		return field.state.meta.errors.map((error) =>
			typeof error === "string" ? error : String(error)
		);
	}
</script>

<form
	class="space-y-4"
	onsubmit={(event) => {
		event.preventDefault();
		event.stopPropagation();
		form.handleSubmit();
	}}
>
	{#if showIntro}
		<div class="space-y-1">
			<h4 class="text-sm font-semibold">Publish to channel</h4>
			<p class="text-sm text-muted-foreground">
				Choose which distribution channel should receive this listing.
			</p>
		</div>
	{/if}

	{#if !listingId}
		<form.Field name="listingId">
			{#snippet children(field)}
				<FormFieldShell
					id="publish-listing-id"
					label="Listing"
					showErrors={field.state.meta.isTouched}
					errors={getFieldErrors(field)}
				>
					{#snippet children()}
						<NativeSelectRoot
							id="publish-listing-id"
							name={field.name}
							value={field.state.value}
							onchange={(event) => {
								field.handleChange((event.target as HTMLSelectElement).value);
							}}
						>
							<NativeSelectOption value="">Select listing</NativeSelectOption>
							{#each listingOptions as option (option.id)}
								<NativeSelectOption value={option.id}>{option.name}</NativeSelectOption>
							{/each}
						</NativeSelectRoot>
					{/snippet}
				</FormFieldShell>
			{/snippet}
		</form.Field>
	{/if}

	<form.Field name="channelType">
		{#snippet children(field)}
			<FormFieldShell
				id="publish-channel-type"
				label="Channel"
				showErrors={field.state.meta.isTouched}
				errors={getFieldErrors(field)}
			>
				{#snippet children()}
					<NativeSelectRoot
						id="publish-channel-type"
						name={field.name}
						value={field.state.value}
						onchange={(event) => {
							field.handleChange((event.target as HTMLSelectElement).value as typeof field.state.value);
						}}
					>
						<NativeSelectOption value="platform_marketplace">
							Marketplace
						</NativeSelectOption>
						<NativeSelectOption value="own_site">Own site</NativeSelectOption>
					</NativeSelectRoot>
				{/snippet}
			</FormFieldShell>
		{/snippet}
	</form.Field>

	{#if errorMessage}
		<p class="text-sm text-destructive">{errorMessage}</p>
	{/if}

	<form.Subscribe selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}>
		{#snippet children(state)}
			<Button type="submit" disabled={!state.canSubmit || state.isSubmitting || pending}>
				{state.isSubmitting || pending ? "Publishing..." : "Publish to channel"}
			</Button>
		{/snippet}
	</form.Subscribe>
</form>
