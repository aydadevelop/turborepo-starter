<script lang="ts">
	import { Button } from "@my-app/ui/components/button";
	import {
		Option as NativeSelectOption,
		Root as NativeSelectRoot,
	} from "@my-app/ui/components/native-select";
	import { Textarea } from "@my-app/ui/components/textarea";
	import { createForm } from "@tanstack/svelte-form";
	import { z } from "zod";
	import FormFieldShell from "../../../../components/operator/FormFieldShell.svelte";

	const moderationActionSchema = z.object({
		listingId: z.string().trim().min(1, "Select a listing."),
		note: z.string().trim().max(5000),
	});
	type ListingActionOption = {
		id: string;
		name: string;
	};

	let {
		listingId,
		listingOptions = [],
		mode,
		onSubmit,
		pending = false,
		errorMessage = null,
		showIntro = true,
	}: {
		errorMessage?: string | null;
		listingId?: string;
		listingOptions?: ListingActionOption[];
		mode: "approve" | "clear";
		onSubmit: (input: { listingId: string; note?: string }) => void | Promise<void>;
		pending?: boolean;
		showIntro?: boolean;
	} = $props();

	const form = createForm(() => ({
		defaultValues: {
			listingId: listingId ?? "",
			note: "",
		} satisfies { listingId: string; note: string },
		onSubmit: async ({ value }) => {
			await onSubmit({
				listingId: value.listingId,
				note: value.note?.trim() ? value.note.trim() : undefined,
			});
		},
		validators: {
			onSubmit: moderationActionSchema,
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
			<h4 class="text-sm font-semibold">
				{mode === "approve" ? "Approve listing" : "Clear approval"}
			</h4>
			<p class="text-sm text-muted-foreground">
				{mode === "approve"
					? "Record a moderation note before approving this listing."
					: "Document why moderation approval is being cleared."}
			</p>
		</div>
	{/if}

	{#if !listingId}
		<form.Field name="listingId">
			{#snippet children(field)}
				<FormFieldShell
					id={`publish-moderation-listing-${mode}`}
					label="Listing"
					showErrors={field.state.meta.isTouched}
					errors={getFieldErrors(field)}
				>
					{#snippet children()}
						<NativeSelectRoot
							id={`publish-moderation-listing-${mode}`}
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

	<form.Field name="note">
		{#snippet children(field)}
			<FormFieldShell
				id={`publish-moderation-note-${mode}`}
				label="Moderation note"
				showErrors={field.state.meta.isTouched}
				errors={getFieldErrors(field)}
			>
				{#snippet children()}
					<Textarea
						id={`publish-moderation-note-${mode}`}
						rows={4}
						placeholder="Why was this action taken?"
						value={field.state.value}
						onblur={field.handleBlur}
						oninput={(event: Event) =>
							field.handleChange((event.target as HTMLTextAreaElement).value)}
					/>
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
				{#if state.isSubmitting || pending}
					{mode === "approve" ? "Approving..." : "Clearing..."}
				{:else}
					{mode === "approve" ? "Approve listing" : "Clear approval"}
				{/if}
			</Button>
		{/snippet}
	</form.Subscribe>
</form>
