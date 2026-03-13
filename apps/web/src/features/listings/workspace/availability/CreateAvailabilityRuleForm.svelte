<!-- biome-ignore-all format: TanStack Form component member syntax not supported -->
<script lang="ts">
	import { Button } from "@my-app/ui/components/button";
	import { Input } from "@my-app/ui/components/input";
	import {
		Option as NativeSelectOption,
		Root as NativeSelectRoot,
	} from "@my-app/ui/components/native-select";
	import { createForm } from "@tanstack/svelte-form";

	import FormFieldShell from "../../../../components/operator/FormFieldShell.svelte";
	import { getCreateAvailabilityRuleDefaults } from "./create-rule/defaults";
	import { createAvailabilityRuleSchema } from "./create-rule/schema";
	import { buildCreateAvailabilityRuleInput } from "./create-rule/submit";

	const DAYS = [
		{ value: "0", label: "Sunday" },
		{ value: "1", label: "Monday" },
		{ value: "2", label: "Tuesday" },
		{ value: "3", label: "Wednesday" },
		{ value: "4", label: "Thursday" },
		{ value: "5", label: "Friday" },
		{ value: "6", label: "Saturday" },
	] as const;

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
			dayOfWeek: number;
			endMinute: number;
			listingId: string;
			startMinute: number;
		}) => void | Promise<void>;
		pending?: boolean;
		showIntro?: boolean;
	} = $props();

	const form = createForm(() => ({
		defaultValues: getCreateAvailabilityRuleDefaults(),
		onSubmit: async ({ value }) => {
			const result = buildCreateAvailabilityRuleInput(listingId, value);
			if (!result.ok) {
				return;
			}

			await onSubmit(result.data);
		},
		validators: {
			onSubmit: createAvailabilityRuleSchema,
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
			<h4 class="text-sm font-semibold">Add recurring rule</h4>
			<p class="text-sm text-muted-foreground">
				Create the next recurring availability window without leaving the workspace.
			</p>
		</div>
	{/if}

	<div class="grid gap-4 md:grid-cols-3">
		<form.Field name="dayOfWeek">
			{#snippet children(field)}
				<FormFieldShell
					id="availability-rule-day"
					label="Day"
					showErrors={field.state.meta.isTouched}
					errors={getFieldErrors(field)}
				>
					{#snippet children()}
						<NativeSelectRoot
							id="availability-rule-day"
							name={field.name}
							value={field.state.value}
							onchange={(event) => {
								field.handleChange((event.target as HTMLSelectElement).value);
							}}
						>
							{#each DAYS as day}
								<NativeSelectOption value={day.value}>{day.label}</NativeSelectOption>
							{/each}
						</NativeSelectRoot>
					{/snippet}
				</FormFieldShell>
			{/snippet}
		</form.Field>

		<form.Field name="startTime">
			{#snippet children(field)}
				<FormFieldShell
					id="availability-rule-start"
					label="Start time"
					showErrors={field.state.meta.isTouched}
					errors={getFieldErrors(field)}
				>
					{#snippet children()}
						<Input
							id="availability-rule-start"
							name={field.name}
							type="time"
							value={field.state.value}
							onblur={field.handleBlur}
							oninput={(event: Event) => {
								field.handleChange((event.target as HTMLInputElement).value);
							}}
						/>
					{/snippet}
				</FormFieldShell>
			{/snippet}
		</form.Field>

		<form.Field name="endTime">
			{#snippet children(field)}
				<FormFieldShell
					id="availability-rule-end"
					label="End time"
					showErrors={field.state.meta.isTouched}
					errors={getFieldErrors(field)}
				>
					{#snippet children()}
						<Input
							id="availability-rule-end"
							name={field.name}
							type="time"
							value={field.state.value}
							onblur={field.handleBlur}
							oninput={(event: Event) => {
								field.handleChange((event.target as HTMLInputElement).value);
							}}
						/>
					{/snippet}
				</FormFieldShell>
			{/snippet}
		</form.Field>
	</div>

	{#if errorMessage}
		<p class="text-sm text-destructive">{errorMessage}</p>
	{/if}

	<form.Subscribe
		selector={(state) => ({
			canSubmit: state.canSubmit,
			isSubmitting: state.isSubmitting,
		})}
	>
		{#snippet children(state)}
			<Button type="submit" disabled={!state.canSubmit || state.isSubmitting || pending}>
				{state.isSubmitting || pending ? "Saving rule..." : "Add recurring rule"}
			</Button>
		{/snippet}
	</form.Subscribe>
</form>
