<script lang="ts">
	import { Button } from "@my-app/ui/components/button";
	import { Input } from "@my-app/ui/components/input";
	import { createForm } from "@tanstack/svelte-form";

	import FormFieldShell from "../../../../components/operator/FormFieldShell.svelte";
	import { getCreateAvailabilityBlockDefaults } from "./create-block/defaults";
	import { createAvailabilityBlockSchema } from "./create-block/schema";
	import { buildCreateAvailabilityBlockInput } from "./create-block/submit";

	let {
		listingId,
		onSubmit,
		pending = false,
		errorMessage = null,
		showIntro = true,
	}: {
		errorMessage?: string | null;
		listingId: string;
		onSubmit: (input: {
			endsAt: string;
			listingId: string;
			reason?: string;
			startsAt: string;
		}) => void | Promise<void>;
		pending?: boolean;
		showIntro?: boolean;
	} = $props();

	const form = createForm(() => ({
		defaultValues: getCreateAvailabilityBlockDefaults(),
		onSubmit: async ({ value }) => {
			const result = buildCreateAvailabilityBlockInput(listingId, value);
			if (!result.ok) {
				return;
			}
			await onSubmit(result.data);
		},
		validators: {
			onSubmit: createAvailabilityBlockSchema,
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
	class="space-y-4 rounded-lg border border-dashed p-4"
	onsubmit={(event) => {
		event.preventDefault();
		event.stopPropagation();
		form.handleSubmit();
	}}
>
	{#if showIntro}
		<div class="space-y-1">
			<h4 class="text-sm font-semibold">Add availability block</h4>
			<p class="text-sm text-muted-foreground">
				Block a date range for maintenance, private charters, or manual closures.
			</p>
		</div>
	{/if}

	<div class="grid gap-4 md:grid-cols-2">
		<form.Field name="startsAt">
			{#snippet children(field)}
				<FormFieldShell
					id="availability-block-start"
					label="Starts at"
					showErrors={field.state.meta.isTouched}
					errors={getFieldErrors(field)}
				>
					{#snippet children()}
						<Input
							id="availability-block-start"
							type="datetime-local"
							name={field.name}
							value={field.state.value}
							onblur={field.handleBlur}
							oninput={(event: Event) => field.handleChange((event.target as HTMLInputElement).value)}
						/>
					{/snippet}
				</FormFieldShell>
			{/snippet}
		</form.Field>
		<form.Field name="endsAt">
			{#snippet children(field)}
				<FormFieldShell
					id="availability-block-end"
					label="Ends at"
					showErrors={field.state.meta.isTouched}
					errors={getFieldErrors(field)}
				>
					{#snippet children()}
						<Input
							id="availability-block-end"
							type="datetime-local"
							name={field.name}
							value={field.state.value}
							onblur={field.handleBlur}
							oninput={(event: Event) => field.handleChange((event.target as HTMLInputElement).value)}
						/>
					{/snippet}
				</FormFieldShell>
			{/snippet}
		</form.Field>
	</div>

	<form.Field name="reason">
		{#snippet children(field)}
			<FormFieldShell
				id="availability-block-reason"
				label="Reason"
				showErrors={field.state.meta.isTouched}
				errors={getFieldErrors(field)}
			>
				{#snippet children()}
					<Input
						id="availability-block-reason"
						name={field.name}
						value={field.state.value}
						onblur={field.handleBlur}
						oninput={(event: Event) => field.handleChange((event.target as HTMLInputElement).value)}
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
				{state.isSubmitting || pending ? "Saving block..." : "Add availability block"}
			</Button>
		{/snippet}
	</form.Subscribe>
</form>
