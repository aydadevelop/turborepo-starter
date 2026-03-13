<!-- biome-ignore-all format: TanStack Form component member syntax not supported -->
<script lang="ts">
	import { Button } from "@my-app/ui/components/button";
	import { Input } from "@my-app/ui/components/input";
	import {
		Option as NativeSelectOption,
		Root as NativeSelectRoot,
	} from "@my-app/ui/components/native-select";
	import { Textarea } from "@my-app/ui/components/textarea";
	import { createForm } from "@tanstack/svelte-form";

	import FormFieldShell from "../../../../components/operator/FormFieldShell.svelte";
	import type { PricingWorkspaceState } from "$lib/orpc-types";
	import { getCreatePricingRuleDefaults } from "./create-rule/defaults";
	import { createPricingRuleSchema } from "./create-rule/schema";
	import { buildCreatePricingRuleInput } from "./create-rule/submit";

	const RULE_TYPES = [
		{ value: "dayOfWeek", label: "Day of week" },
		{ value: "hourRange", label: "Hour range" },
		{ value: "dayHourRange", label: "Day + hour range" },
		{ value: "dateRange", label: "Date range" },
		{ value: "passengerCount", label: "Passenger count" },
		{ value: "duration", label: "Duration" },
	] as const;

	const ADJUSTMENT_TYPES = [
		{ value: "percent", label: "Percent" },
		{ value: "flat_cents", label: "Flat cents" },
	] as const;

	let {
		listingId,
		pricing = null,
		onSubmit,
		pending = false,
		errorMessage = null,
		showIntro = true,
	}: {
		errorMessage?: string | null;
		listingId: string;
		onSubmit: (input: {
			adjustmentType: "flat_cents" | "percent";
			adjustmentValue: number;
			conditionJson: Record<string, unknown>;
			listingId: string;
			name: string;
			priority?: number;
			pricingProfileId: string;
			ruleType: string;
		}) => void | Promise<void>;
		pending?: boolean;
		pricing?: PricingWorkspaceState | null;
		showIntro?: boolean;
	} = $props();

	let seededFrom = $state<string | null>(null);

	const formSeedKey = $derived(
		JSON.stringify({
			profiles: pricing?.profiles.map((profile) => profile.id) ?? [],
			defaultProfileId: pricing?.defaultProfileId ?? null,
		})
	);

	const form = createForm(() => ({
		defaultValues: getCreatePricingRuleDefaults(pricing),
		onSubmit: async ({ value }) => {
			const result = buildCreatePricingRuleInput(listingId, value);
			if (!result.ok) {
				return;
			}

			await onSubmit(result.data);
		},
		validators: {
			onSubmit: createPricingRuleSchema,
		},
	}));

	$effect(() => {
		if (seededFrom === formSeedKey) return;

		form.reset(getCreatePricingRuleDefaults(pricing));
		seededFrom = formSeedKey;
	});

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
			<h4 class="text-sm font-semibold">Add pricing rule</h4>
			<p class="text-sm text-muted-foreground">
				Create the next pricing adjustment on top of an existing profile.
			</p>
		</div>
	{/if}

	{#if !pricing?.profiles.length}
		<p class="text-sm text-muted-foreground">
			Create a pricing profile first before adding rules.
		</p>
	{:else}
		<div class="grid gap-4 md:grid-cols-2">
			<form.Field name="pricingProfileId">
				{#snippet children(field)}
					<FormFieldShell
						id="pricing-rule-profile"
						label="Pricing profile"
						showErrors={field.state.meta.isTouched}
						errors={getFieldErrors(field)}
					>
						{#snippet children()}
							<NativeSelectRoot
								id="pricing-rule-profile"
								name={field.name}
								value={field.state.value}
								onchange={(event) => {
									field.handleChange((event.target as HTMLSelectElement).value);
								}}
							>
								{#each pricing.profiles as profile}
									<NativeSelectOption value={profile.id}>{profile.name}</NativeSelectOption>
								{/each}
							</NativeSelectRoot>
						{/snippet}
					</FormFieldShell>
				{/snippet}
			</form.Field>

			<form.Field name="name">
				{#snippet children(field)}
					<FormFieldShell
						id="pricing-rule-name"
						label="Rule name"
						showErrors={field.state.meta.isTouched}
						errors={getFieldErrors(field)}
					>
						{#snippet children()}
							<Input
								id="pricing-rule-name"
								name={field.name}
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

			<form.Field name="ruleType">
				{#snippet children(field)}
					<FormFieldShell
						id="pricing-rule-type"
						label="Rule type"
						showErrors={field.state.meta.isTouched}
						errors={getFieldErrors(field)}
					>
						{#snippet children()}
							<NativeSelectRoot
								id="pricing-rule-type"
								name={field.name}
								value={field.state.value}
								onchange={(event) => {
									field.handleChange((event.target as HTMLSelectElement).value as typeof field.state.value);
								}}
							>
								{#each RULE_TYPES as ruleType}
									<NativeSelectOption value={ruleType.value}>{ruleType.label}</NativeSelectOption>
								{/each}
							</NativeSelectRoot>
						{/snippet}
					</FormFieldShell>
				{/snippet}
			</form.Field>

			<form.Field name="adjustmentType">
				{#snippet children(field)}
					<FormFieldShell
						id="pricing-rule-adjustment-type"
						label="Adjustment type"
						showErrors={field.state.meta.isTouched}
						errors={getFieldErrors(field)}
					>
						{#snippet children()}
							<NativeSelectRoot
								id="pricing-rule-adjustment-type"
								name={field.name}
								value={field.state.value}
								onchange={(event) => {
									field.handleChange((event.target as HTMLSelectElement).value as typeof field.state.value);
								}}
							>
								{#each ADJUSTMENT_TYPES as adjustmentType}
									<NativeSelectOption value={adjustmentType.value}>{adjustmentType.label}</NativeSelectOption>
								{/each}
							</NativeSelectRoot>
						{/snippet}
					</FormFieldShell>
				{/snippet}
			</form.Field>

			<form.Field name="adjustmentValue">
				{#snippet children(field)}
					<FormFieldShell
						id="pricing-rule-adjustment-value"
						label="Adjustment value"
						showErrors={field.state.meta.isTouched}
						errors={getFieldErrors(field)}
					>
						{#snippet children()}
							<Input
								id="pricing-rule-adjustment-value"
								name={field.name}
								inputmode="numeric"
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

			<form.Field name="priority">
				{#snippet children(field)}
					<FormFieldShell
						id="pricing-rule-priority"
						label="Priority"
						showErrors={field.state.meta.isTouched}
						errors={getFieldErrors(field)}
					>
						{#snippet children()}
							<Input
								id="pricing-rule-priority"
								name={field.name}
								inputmode="numeric"
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

		<form.Field name="conditionJsonText">
			{#snippet children(field)}
				<FormFieldShell
					id="pricing-rule-condition-json"
					label="Condition JSON"
					description="Provide a JSON object that matches the selected rule type."
					showErrors={field.state.meta.isTouched}
					errors={getFieldErrors(field)}
				>
					{#snippet children()}
						<Textarea
							id="pricing-rule-condition-json"
							name={field.name}
							rows={6}
							value={field.state.value}
							onblur={field.handleBlur}
							oninput={(event: Event) => {
								field.handleChange((event.target as HTMLTextAreaElement).value);
							}}
						/>
					{/snippet}
				</FormFieldShell>
			{/snippet}
		</form.Field>

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
					{state.isSubmitting || pending ? "Saving rule..." : "Add pricing rule"}
				</Button>
			{/snippet}
		</form.Subscribe>
	{/if}
</form>
