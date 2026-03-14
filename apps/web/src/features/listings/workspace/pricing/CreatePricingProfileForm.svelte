<script lang="ts">
	import { Button } from "@my-app/ui/components/button";
	import { Input } from "@my-app/ui/components/input";
	import {
		Option as NativeSelectOption,
		Root as NativeSelectRoot,
	} from "@my-app/ui/components/native-select";
	import { createForm } from "@tanstack/svelte-form";
	import type { PricingWorkspaceState } from "$lib/orpc-types";
	import FormFieldShell from "../../../../components/operator/FormFieldShell.svelte";
	import { getCreatePricingProfileDefaults } from "./create-profile/defaults";
	import { createPricingProfileSchema } from "./create-profile/schema";
	import { buildCreatePricingProfileInput } from "./create-profile/submit";

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
			baseHourlyPriceCents: number;
			currency: string;
			isDefault?: boolean;
			listingId: string;
			minimumHours?: number;
			name: string;
			serviceFeeBps?: number;
			taxBps?: number;
		}) => void | Promise<void>;
		pending?: boolean;
		pricing?: PricingWorkspaceState | null;
		showIntro?: boolean;
	} = $props();

	let seededFrom = $state<string | null>(null);

	const formSeedKey = $derived(
		JSON.stringify({
			currencies: pricing?.currencies ?? [],
			defaultProfileId: pricing?.defaultProfileId ?? null,
			profileCount: pricing?.profiles.length ?? 0,
		})
	);

	const form = createForm(() => ({
		defaultValues: getCreatePricingProfileDefaults(pricing),
		onSubmit: async ({ value }) => {
			const result = buildCreatePricingProfileInput(listingId, value);
			if (!result.ok) {
				return;
			}

			await onSubmit(result.data);
		},
		validators: {
			onSubmit: createPricingProfileSchema,
		},
	}));

	$effect(() => {
		if (seededFrom === formSeedKey) return;

		form.reset(getCreatePricingProfileDefaults(pricing));
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
			<h4 class="text-sm font-semibold">Create pricing profile</h4>
			<p class="text-sm text-muted-foreground">
				Add the next operator-ready price profile without leaving the workspace.
			</p>
		</div>
	{/if}

	<div class="grid gap-4 md:grid-cols-2">
		<form.Field name="name">
			{#snippet children(field)}
				<FormFieldShell
					id="pricing-profile-name"
					label="Profile name"
					showErrors={field.state.meta.isTouched}
					errors={getFieldErrors(field)}
				>
					{#snippet children()}
						<Input
							id="pricing-profile-name"
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

		<form.Field name="currency">
			{#snippet children(field)}
				<FormFieldShell
					id="pricing-profile-currency"
					label="Currency"
					showErrors={field.state.meta.isTouched}
					errors={getFieldErrors(field)}
				>
					{#snippet children()}
						<NativeSelectRoot
							id="pricing-profile-currency"
							name={field.name}
							value={field.state.value}
							onchange={(event) => {
								field.handleChange((event.target as HTMLSelectElement).value);
							}}
						>
							{#each pricing?.currencies ?? ["RUB"] as currency}
								<NativeSelectOption value={currency}>{currency}</NativeSelectOption>
							{/each}
						</NativeSelectRoot>
					{/snippet}
				</FormFieldShell>
			{/snippet}
		</form.Field>

		<form.Field name="baseHourlyPriceCents">
			{#snippet children(field)}
				<FormFieldShell
					id="pricing-profile-base-hourly-price"
					label="Base hourly price (cents)"
					showErrors={field.state.meta.isTouched}
					errors={getFieldErrors(field)}
				>
					{#snippet children()}
						<Input
							id="pricing-profile-base-hourly-price"
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

		<form.Field name="minimumHours">
			{#snippet children(field)}
				<FormFieldShell
					id="pricing-profile-minimum-hours"
					label="Minimum hours"
					showErrors={field.state.meta.isTouched}
					errors={getFieldErrors(field)}
				>
					{#snippet children()}
						<Input
							id="pricing-profile-minimum-hours"
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

		<form.Field name="serviceFeeBps">
			{#snippet children(field)}
				<FormFieldShell
					id="pricing-profile-service-fee"
					label="Service fee (bps)"
					showErrors={field.state.meta.isTouched}
					errors={getFieldErrors(field)}
				>
					{#snippet children()}
						<Input
							id="pricing-profile-service-fee"
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

		<form.Field name="taxBps">
			{#snippet children(field)}
				<FormFieldShell
					id="pricing-profile-tax"
					label="Tax (bps)"
					showErrors={field.state.meta.isTouched}
					errors={getFieldErrors(field)}
				>
					{#snippet children()}
						<Input
							id="pricing-profile-tax"
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

	<form.Field name="isDefault">
		{#snippet children(field)}
			<label class="flex items-center gap-2 text-sm font-medium">
				<input
					type="checkbox"
					checked={field.state.value}
					onchange={(event) => {
						field.handleChange((event.target as HTMLInputElement).checked);
					}}
				/>
				Make this the default pricing profile
			</label>
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
				{state.isSubmitting || pending ? "Saving profile..." : "Create pricing profile"}
			</Button>
		{/snippet}
	</form.Subscribe>
</form>
