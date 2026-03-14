<script lang="ts">
	import { Button } from "@my-app/ui/components/button";
	import { Input } from "@my-app/ui/components/input";
	import { createForm } from "@tanstack/svelte-form";

	import FormFieldShell from "../../../../components/operator/FormFieldShell.svelte";
	import { getCreateAvailabilityExceptionDefaults } from "./create-exception/defaults";
	import { createAvailabilityExceptionSchema } from "./create-exception/schema";
	import { buildCreateAvailabilityExceptionInput } from "./create-exception/submit";

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
			date: string;
			endMinute?: number;
			isAvailable: boolean;
			listingId: string;
			reason?: string;
			startMinute?: number;
		}) => void | Promise<void>;
		pending?: boolean;
		showIntro?: boolean;
	} = $props();

	const form = createForm(() => ({
		defaultValues: getCreateAvailabilityExceptionDefaults(),
		onSubmit: async ({ value }) => {
			const result = buildCreateAvailabilityExceptionInput(listingId, value);
			if (!result.ok) {
				return;
			}
			await onSubmit(result.data);
		},
		validators: {
			onSubmit: createAvailabilityExceptionSchema,
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
			<h4 class="text-sm font-semibold">Add availability exception</h4>
			<p class="text-sm text-muted-foreground">
				Mark one-off closures or partial-day overrides for a specific date.
			</p>
		</div>
	{/if}

	<div class="grid gap-4 md:grid-cols-2">
		<form.Field name="date">
			{#snippet children(field)}
				<FormFieldShell
					id="availability-exception-date"
					label="Date"
					showErrors={field.state.meta.isTouched}
					errors={getFieldErrors(field)}
				>
					{#snippet children()}
						<Input
							id="availability-exception-date"
							type="date"
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

	<form.Field name="isAvailable">
		{#snippet children(field)}
			<label class="flex items-center gap-2 text-sm font-medium">
				<input
					type="checkbox"
					checked={field.state.value}
					onchange={(event) => {
						field.handleChange((event.target as HTMLInputElement).checked);
					}}
				/>
				This date has a partial available window instead of being fully blocked
			</label>
		{/snippet}
	</form.Field>

	<form.Subscribe selector={(state) => state.values.isAvailable}>
		{#snippet children(isAvailable)}
			{#if isAvailable}
				<div class="grid gap-4 md:grid-cols-2">
					<form.Field name="startTime">
						{#snippet children(field)}
							<FormFieldShell
								id="availability-exception-start"
								label="Start time"
								showErrors={field.state.meta.isTouched}
								errors={getFieldErrors(field)}
							>
								{#snippet children()}
									<Input
										id="availability-exception-start"
										type="time"
										name={field.name}
										value={field.state.value}
										onblur={field.handleBlur}
										oninput={(event: Event) => field.handleChange((event.target as HTMLInputElement).value)}
									/>
								{/snippet}
							</FormFieldShell>
						{/snippet}
					</form.Field>
					<form.Field name="endTime">
						{#snippet children(field)}
							<FormFieldShell
								id="availability-exception-end"
								label="End time"
								showErrors={field.state.meta.isTouched}
								errors={getFieldErrors(field)}
							>
								{#snippet children()}
									<Input
										id="availability-exception-end"
										type="time"
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
			{/if}
		{/snippet}
	</form.Subscribe>

	<form.Field name="reason">
		{#snippet children(field)}
			<FormFieldShell
				id="availability-exception-reason"
				label="Reason"
				showErrors={field.state.meta.isTouched}
				errors={getFieldErrors(field)}
			>
				{#snippet children()}
					<Input
						id="availability-exception-reason"
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
				{state.isSubmitting || pending ? "Saving exception..." : "Add availability exception"}
			</Button>
		{/snippet}
	</form.Subscribe>
</form>
