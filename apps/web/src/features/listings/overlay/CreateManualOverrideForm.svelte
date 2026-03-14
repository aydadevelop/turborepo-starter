<script lang="ts">
	import { Button } from "@my-app/ui/components/button";
	import { Input } from "@my-app/ui/components/input";
	import { Label } from "@my-app/ui/components/label";
	import {
		Option as NativeSelectOption,
		Root as NativeSelectRoot,
	} from "@my-app/ui/components/native-select";
	import { Textarea } from "@my-app/ui/components/textarea";
	import { createForm } from "@tanstack/svelte-form";
	import { z } from "zod";
	import FormFieldShell from "../../../components/operator/FormFieldShell.svelte";
	import type { ManualOverrideInput, OrganizationOverlayListingOption } from "./types";

	const manualOverrideSchema = z
		.object({
			scopeType: z.enum(["organization", "listing"]),
			scopeKey: z.string().trim(),
			code: z.string().trim().min(1, "Code is required."),
			title: z.string().trim().min(1, "Title is required."),
			note: z.string().trim().max(5000),
		})
		.superRefine((value, ctx) => {
			if (value.scopeType === "listing" && value.scopeKey.length === 0) {
				ctx.addIssue({
					code: "custom",
					path: ["scopeKey"],
					message: "Select a listing for listing-scoped overrides.",
				});
			}
		});

	let {
		listingOptions = [],
		onSubmit,
		pending = false,
		errorMessage = null,
		showIntro = true,
	}: {
		errorMessage?: string | null;
		listingOptions?: OrganizationOverlayListingOption[];
		onSubmit: (input: ManualOverrideInput) => boolean | void | Promise<boolean | void>;
		pending?: boolean;
		showIntro?: boolean;
	} = $props();

	type ManualOverrideFormValues = {
		scopeType: "organization" | "listing";
		scopeKey: string;
		code: string;
		title: string;
		note: string;
	};

	const defaultValues: ManualOverrideFormValues = {
		scopeType: "organization",
		scopeKey: "",
		code: "",
		title: "",
		note: "",
	};

	const form = createForm(() => ({
		defaultValues,
		onSubmit: async ({ value }) => {
			await onSubmit({
				scopeType: value.scopeType,
				scopeKey: value.scopeType === "listing" ? value.scopeKey : null,
				code: value.code.trim(),
				title: value.title.trim(),
				note: value.note.trim() || undefined,
			});
		},
		validators: {
			onSubmit: manualOverrideSchema,
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
			<h4 class="text-sm font-semibold">Create manual override</h4>
			<p class="text-sm text-muted-foreground">
				Record the exceptional operator/admin case explicitly instead of hiding it in ad hoc notes.
			</p>
		</div>
	{/if}

	<div class="grid gap-4 md:grid-cols-2">
		<form.Field name="code">
			{#snippet children(field)}
				<FormFieldShell
					id="overlay-override-code"
					label="Code"
					showErrors={field.state.meta.isTouched}
					errors={getFieldErrors(field)}
				>
					{#snippet children()}
						<Input
							id="overlay-override-code"
							placeholder="manual-pricing-exception"
							value={field.state.value}
							onblur={field.handleBlur}
							oninput={(event: Event) =>
								field.handleChange((event.target as HTMLInputElement).value)}
						/>
					{/snippet}
				</FormFieldShell>
			{/snippet}
		</form.Field>

		<form.Field name="title">
			{#snippet children(field)}
				<FormFieldShell
					id="overlay-override-title"
					label="Title"
					showErrors={field.state.meta.isTouched}
					errors={getFieldErrors(field)}
				>
					{#snippet children()}
						<Input
							id="overlay-override-title"
							placeholder="Allow manual pricing override"
							value={field.state.value}
							onblur={field.handleBlur}
							oninput={(event: Event) =>
								field.handleChange((event.target as HTMLInputElement).value)}
						/>
					{/snippet}
				</FormFieldShell>
			{/snippet}
		</form.Field>

		<form.Field name="scopeType">
			{#snippet children(field)}
				<FormFieldShell
					id="overlay-override-scope-type"
					label="Scope"
					showErrors={field.state.meta.isTouched}
					errors={getFieldErrors(field)}
				>
					{#snippet children()}
						<NativeSelectRoot
							id="overlay-override-scope-type"
							name={field.name}
							value={field.state.value}
							onchange={(event) => {
								field.handleChange(
									(event.target as HTMLSelectElement).value as
										| "organization"
										| "listing"
								);
							}}
						>
							<NativeSelectOption value="organization">Organization</NativeSelectOption>
							<NativeSelectOption value="listing">Listing</NativeSelectOption>
						</NativeSelectRoot>
					{/snippet}
				</FormFieldShell>
			{/snippet}
		</form.Field>

		<form.Subscribe selector={(state) => state.values.scopeType}>
			{#snippet children(scopeType)}
				{#if scopeType === "listing"}
					<form.Field name="scopeKey">
						{#snippet children(field)}
							<FormFieldShell
								id="overlay-override-scope-key"
								label="Listing"
								showErrors={field.state.meta.isTouched}
								errors={getFieldErrors(field)}
							>
								{#snippet children()}
									<NativeSelectRoot
										id="overlay-override-scope-key"
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
			{/snippet}
		</form.Subscribe>
	</div>

	<form.Field name="note">
		{#snippet children(field)}
			<div class="space-y-2">
				<Label for="overlay-override-note">Note</Label>
				<Textarea
					id="overlay-override-note"
					rows={4}
					placeholder="Explain why this override exists and when it should be resolved."
					value={field.state.value}
					onblur={field.handleBlur}
					oninput={(event: Event) =>
						field.handleChange((event.target as HTMLTextAreaElement).value)}
				/>
				{#if getFieldErrors(field).length > 0}
					<p class="text-sm text-destructive">
						{getFieldErrors(field)[0]}
					</p>
				{/if}
			</div>
		{/snippet}
	</form.Field>

	{#if errorMessage}
		<p class="text-sm text-destructive">{errorMessage}</p>
	{/if}

	<form.Subscribe selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}>
		{#snippet children(state)}
			<Button type="submit" disabled={!state.canSubmit || state.isSubmitting || pending}>
				{state.isSubmitting || pending ? "Creating..." : "Create override"}
			</Button>
		{/snippet}
	</form.Subscribe>
</form>
