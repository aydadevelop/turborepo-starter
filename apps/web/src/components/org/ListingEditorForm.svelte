<!-- biome-ignore-all format: TanStack Form component member syntax not supported -->
<script lang="ts">
	import ChevronDown from "@lucide/svelte/icons/chevron-down";
	import {
		isSupportedTimezone,
		SUPPORTED_TIMEZONES,
	} from "@my-app/reference-data/timezones";
	import { Button } from "@my-app/ui/components/button";
	import {
		Content as CardContent,
		Description as CardDescription,
		Header as CardHeader,
		Root as CardRoot,
		Title as CardTitle,
	} from "@my-app/ui/components/card";
	import {
		Collapsible,
		CollapsibleContent,
		CollapsibleTrigger,
	} from "@my-app/ui/components/collapsible";
	import { Input } from "@my-app/ui/components/input";
	import { Label } from "@my-app/ui/components/label";
	import {
		OptGroup as NativeSelectOptGroup,
		Option as NativeSelectOption,
		Root as NativeSelectRoot,
	} from "@my-app/ui/components/native-select";
	import {
		Content as SelectContent,
		Item as SelectItem,
		Root as SelectRoot,
		Trigger as SelectTrigger,
	} from "@my-app/ui/components/select";
	import { Textarea } from "@my-app/ui/components/textarea";
	import { createForm } from "@tanstack/svelte-form";

	import type { ListingTypeOption } from "$lib/orpc-types";
	import { getListingEditorDefaults } from "../../features/listings/editor/defaults";
	import { createListingEditorSchema } from "../../features/listings/editor/schema";
	import { buildListingEditorSubmitValues } from "../../features/listings/editor/submit";
	import {
		findListingTypeOption,
	} from "../../features/listings/editor/shared";
	import type {
		ListingEditorInitialValue,
		ListingEditorMode,
		ListingEditorSubmitValues,
	} from "../../features/listings/editor/types";

	let {
		mode,
		initialValue = {},
		onSubmit,
		submitLabel,
		pending = false,
		errorMessage = null,
		listingTypeOptions = [],
		showCardChrome = true,
		showCancelButton = true,
		cancelHref = "/org/listings",
		onCancel = null,
	}: {
		cancelHref?: string;
		errorMessage?: string | null;
		initialValue?: ListingEditorInitialValue;
		listingTypeOptions?: ListingTypeOption[];
		mode: ListingEditorMode;
		onCancel?: (() => void) | null;
		onSubmit: (
			values: ListingEditorSubmitValues
		) => void | Promise<void>;
		pending?: boolean;
		showCancelButton?: boolean;
		showCardChrome?: boolean;
		submitLabel: string;
	} = $props();

	let advancedMetadataOpen = $state(false);
	let seededFrom = $state<string | null>(null);

	const COMMON_TIMEZONES = [
		"UTC",
		"Europe/London",
		"Europe/Berlin",
		"Europe/Moscow",
		"America/New_York",
		"America/Chicago",
		"America/Denver",
		"America/Los_Angeles",
		"Asia/Dubai",
		"Asia/Singapore",
		"Asia/Tokyo",
	] as const;

	const commonTimezoneSet = new Set<string>(COMMON_TIMEZONES);
	const canEditType = $derived(mode === "create");
	const canEditSlug = $derived(mode === "create");
	const availableListingTypeCount = $derived(listingTypeOptions.length);
	const defaultListingTypeSlug = $derived(
		listingTypeOptions.find((option) => option.isDefault)?.value ??
			listingTypeOptions[0]?.value ??
			""
	);

	const formSeedKey = $derived(
		JSON.stringify({
			mode,
			defaultListingTypeSlug,
			listingTypeOptions: listingTypeOptions.map((option) => option.value),
			listingTypeSlug: initialValue.listingTypeSlug ?? "",
			name: initialValue.name ?? "",
			slug: initialValue.slug ?? "",
			timezone: initialValue.timezone ?? "UTC",
			description: initialValue.description ?? "",
			metadata: initialValue.metadata ?? {},
			boatRent: initialValue.serviceFamilyDetails?.boatRent ?? null,
			excursion: initialValue.serviceFamilyDetails?.excursion ?? null,
		})
	);

	const form = createForm(() => ({
		defaultValues: getListingEditorDefaults({
			mode,
			initialValue,
			listingTypeOptions,
		}),
		onSubmit: async ({ value }) => {
			const result = buildListingEditorSubmitValues(value, {
				mode,
				listingTypeOptions,
			});

			if (!result.ok) {
				return;
			}

			await onSubmit(result.data);
		},
		validators: {
			onSubmit: createListingEditorSchema({
				mode,
				listingTypeOptions,
			}),
		},
	}));

	$effect(() => {
		if (seededFrom === formSeedKey) return;

		form.reset(
			getListingEditorDefaults({
				mode,
				initialValue,
				listingTypeOptions,
			})
		);
		advancedMetadataOpen = Boolean(
			initialValue.metadata && Object.keys(initialValue.metadata).length > 0
		);
		seededFrom = formSeedKey;
	});

	function getTimezoneGroups(timezone: string) {
		const groups: Array<{ label: string; options: string[] }> = [];
		const normalizedTimezone = timezone.trim();

		if (
			normalizedTimezone.length > 0 &&
			!isSupportedTimezone(normalizedTimezone)
		) {
			groups.push({
				label: "Current value",
				options: [normalizedTimezone],
			});
		}

		const commonOptions = COMMON_TIMEZONES.filter((option) =>
			SUPPORTED_TIMEZONES.includes(option)
		);
		groups.push({
			label: "Common",
			options: [...commonOptions],
		});

		const regionMap = new Map<string, string[]>();
		for (const option of SUPPORTED_TIMEZONES) {
			if (commonTimezoneSet.has(option)) continue;

			const rawGroupLabel = option.includes("/")
				? option.split("/")[0]
				: "Other";
			const groupLabel =
				rawGroupLabel === "Etc"
					? "UTC & Offsets"
					: rawGroupLabel.replaceAll("_", " ");
			const options = regionMap.get(groupLabel) ?? [];
			options.push(option);
			regionMap.set(groupLabel, options);
		}

		for (const [label, options] of [...regionMap.entries()].sort((left, right) =>
			left[0].localeCompare(right[0])
		)) {
			groups.push({ label, options });
		}

		return groups;
	}

function getFieldErrors(field: {
		state: { meta: { errors: unknown[] } };
	}): string[] {
		return field.state.meta.errors.map((error) =>
			typeof error === "string" ? error : String(error)
		);
	}
</script>

{#snippet formContent()}
		<form.Subscribe
			selector={(state) => ({
				canSubmit: state.canSubmit,
				isSubmitting: state.isSubmitting,
				values: state.values,
			})}
		>
			{#snippet children(state)}
				{@const selectedListingTypeOption = findListingTypeOption(
					listingTypeOptions,
					state.values.listingTypeSlug
				)}
				{@const selectedListingTypeLabel =
					selectedListingTypeOption?.label ?? "Select listing type"}
				{@const selectedServiceFamilyLabel =
					selectedListingTypeOption?.serviceFamilyPolicy.label ?? null}
				{@const selectedRequiredFieldsText =
					selectedListingTypeOption?.requiredFields.join(", ") ?? ""}
				{@const selectedProfileEditor =
					selectedListingTypeOption?.serviceFamilyPolicy.profileEditor ?? null}
				{@const selectedIsBoatRent =
					selectedListingTypeOption?.serviceFamily === "boat_rent"}
				{@const selectedIsExcursions =
					selectedListingTypeOption?.serviceFamily === "excursions"}
				{@const selectedPricingModelsText =
					selectedListingTypeOption?.supportedPricingModels.join(", ") ?? ""}
				{@const hasSelectedMetadataSchema = Boolean(
					selectedListingTypeOption &&
						Object.keys(selectedListingTypeOption.metadataJsonSchema).length > 0
				)}
				{@const selectedMetadataSchemaText = selectedListingTypeOption
					? JSON.stringify(selectedListingTypeOption.metadataJsonSchema, null, 2)
					: "{}"}
				{@const timezoneGroups = getTimezoneGroups(state.values.timezone)}
				{@const hasUnsupportedTimezone =
					state.values.timezone.trim().length > 0 &&
					!isSupportedTimezone(state.values.timezone.trim())}

				<form
					class="space-y-4"
					onsubmit={(event) => {
						event.preventDefault();
						event.stopPropagation();
						form.handleSubmit();
					}}
				>
					<div class="grid gap-4 md:grid-cols-2">
						<form.Field name="listingTypeSlug">
							{#snippet children(field)}
								<div class="space-y-2">
									<Label for="listing-type-slug">Listing type</Label>
									{#if canEditType}
										<SelectRoot
											type="single"
											value={field.state.value}
											onValueChange={(value) => {
												field.handleChange(value ?? "");
											}}
											disabled={pending || availableListingTypeCount === 0}
										>
											<SelectTrigger id="listing-type-slug">
												{selectedListingTypeLabel}
											</SelectTrigger>
											<SelectContent>
												{#each listingTypeOptions as option (option.value)}
													<SelectItem
														value={option.value}
														label={option.label}
													/>
												{/each}
											</SelectContent>
										</SelectRoot>
										{#if availableListingTypeCount === 0}
											<p class="text-xs text-muted-foreground">
												No listing types are currently available for this
												organization.
											</p>
										{/if}
										{#if getFieldErrors(field).length > 0}
											<p class="text-sm text-destructive">
												{getFieldErrors(field)[0]}
											</p>
										{/if}
										{#if selectedServiceFamilyLabel}
											<p class="text-xs text-muted-foreground">
												Service family: {selectedServiceFamilyLabel}
											</p>
										{/if}
										{#if selectedRequiredFieldsText}
											<p class="text-xs text-muted-foreground">
												Required fields for this type:
												{selectedRequiredFieldsText}
											</p>
										{/if}
										{#if selectedPricingModelsText}
											<p class="text-xs text-muted-foreground">
												Supported pricing models: {selectedPricingModelsText}
											</p>
										{/if}
									{:else}
										<Input
											id="listing-type-slug"
											type="text"
											value={field.state.value}
											disabled={true}
										/>
										<p class="text-xs text-muted-foreground">
											Listing type is fixed after creation.
										</p>
									{/if}
								</div>
							{/snippet}
						</form.Field>

						<form.Field name="timezone">
							{#snippet children(field)}
								<div class="space-y-2">
									<Label for="listing-timezone">Timezone</Label>
									<NativeSelectRoot
										id="listing-timezone"
										value={field.state.value}
										class="w-full"
										disabled={pending}
										required
										aria-invalid={
											getFieldErrors(field).length > 0 ? "true" : undefined
										}
										onchange={(event) => {
											const target = event.target as HTMLSelectElement;
											field.handleChange(target.value);
										}}
									>
										{#each timezoneGroups as group (group.label)}
											<NativeSelectOptGroup label={group.label}>
												{#each group.options as option (option)}
													<NativeSelectOption value={option}
														>{option}</NativeSelectOption
													>
												{/each}
											</NativeSelectOptGroup>
										{/each}
									</NativeSelectRoot>
									<p class="text-xs text-muted-foreground">
										{#if hasUnsupportedTimezone}
											The current value is outside the supported IANA registry.
											Choose a valid timezone before saving.
										{:else}
											Choose a valid IANA timezone such as <code>UTC</code> or
											<code>Europe/Berlin</code>.
										{/if}
									</p>
									{#if getFieldErrors(field).length > 0}
										<p class="text-sm text-destructive">
											{getFieldErrors(field)[0]}
										</p>
									{/if}
								</div>
							{/snippet}
						</form.Field>
					</div>

					<form.Field name="name">
						{#snippet children(field)}
							<div class="space-y-2">
								<Label for="listing-name">Name</Label>
								<Input
									id="listing-name"
									type="text"
									value={field.state.value}
									disabled={pending}
									placeholder="Evening charter"
									required
									maxlength={200}
									minlength={1}
									onblur={field.handleBlur}
									oninput={(event: Event) => {
										const target = event.target as HTMLInputElement;
										field.handleChange(target.value);
									}}
								/>
								{#if getFieldErrors(field).length > 0}
									<p class="text-sm text-destructive">
										{getFieldErrors(field)[0]}
									</p>
								{/if}
							</div>
						{/snippet}
					</form.Field>

					<form.Field name="slug">
						{#snippet children(field)}
							<div class="space-y-2">
								<Label for="listing-slug">Slug</Label>
								<Input
									id="listing-slug"
									type="text"
									value={field.state.value}
									disabled={!canEditSlug || pending}
									placeholder="evening-charter"
									pattern="^[a-z0-9-]+$"
									required
									maxlength={200}
									minlength={1}
									onblur={field.handleBlur}
									oninput={(event: Event) => {
										const target = event.target as HTMLInputElement;
										field.handleChange(target.value);
									}}
								/>
								<p class="text-xs text-muted-foreground">
									Lowercase letters, numbers, and hyphens only.
								</p>
								{#if !canEditSlug}
									<p class="text-xs text-muted-foreground">
										Slug stays read-only for edits because the current update
										contract does not accept it.
									</p>
								{/if}
								{#if getFieldErrors(field).length > 0}
									<p class="text-sm text-destructive">
										{getFieldErrors(field)[0]}
									</p>
								{/if}
							</div>
						{/snippet}
					</form.Field>

					<form.Field name="description">
						{#snippet children(field)}
							<div class="space-y-2">
								<Label for="listing-description">Description</Label>
								<Textarea
									id="listing-description"
									value={field.state.value}
									disabled={pending}
									placeholder="Describe the experience, amenities, and what customers should know."
									rows={5}
									onblur={field.handleBlur}
									oninput={(event: Event) => {
										const target = event.target as HTMLTextAreaElement;
										field.handleChange(target.value);
									}}
								/>
								{#if getFieldErrors(field).length > 0}
									<p class="text-sm text-destructive">
										{getFieldErrors(field)[0]}
									</p>
								{/if}
							</div>
						{/snippet}
					</form.Field>

					{#if selectedIsBoatRent && selectedProfileEditor}
						<div class="space-y-4 rounded-lg border p-4">
							<div class="space-y-1">
								<h3 class="font-medium">{selectedProfileEditor.title}</h3>
								<p class="text-xs text-muted-foreground">
									{selectedProfileEditor.description}
								</p>
							</div>

							<div class="grid gap-4 md:grid-cols-2">
								<form.Field name="boatRentCapacity">
									{#snippet children(field)}
										<div class="space-y-2">
											<Label for="boat-rent-capacity">
												{selectedProfileEditor.fields.find(
													(entry) => entry.key === "capacity"
												)?.label ?? "Capacity"}
											</Label>
											<Input
												id="boat-rent-capacity"
												type="number"
												min="1"
												step="1"
												value={field.state.value}
												disabled={pending}
												placeholder="10"
												onblur={field.handleBlur}
												oninput={(event: Event) => {
													const target = event.target as HTMLInputElement;
													field.handleChange(target.value);
												}}
											/>
											{#if selectedProfileEditor.fields.find((entry) => entry.key === "capacity")?.helpText}
												<p class="text-xs text-muted-foreground">
													{selectedProfileEditor.fields.find(
														(entry) => entry.key === "capacity"
													)?.helpText}
												</p>
											{/if}
											{#if getFieldErrors(field).length > 0}
												<p class="text-sm text-destructive">
													{getFieldErrors(field)[0]}
												</p>
											{/if}
										</div>
									{/snippet}
								</form.Field>

								<form.Field name="boatRentCaptainMode">
									{#snippet children(field)}
										<div class="space-y-2">
											<Label for="boat-rent-captain-mode">
												{selectedProfileEditor.fields.find(
													(entry) => entry.key === "captainMode"
												)?.label ?? "Captain policy"}
											</Label>
											<NativeSelectRoot
												id="boat-rent-captain-mode"
												value={field.state.value}
												class="w-full"
												disabled={pending}
												onchange={(event) => {
													const target = event.target as HTMLSelectElement;
													field.handleChange(target.value as typeof field.state.value);
												}}
											>
												{#each selectedProfileEditor.fields.find((entry) => entry.key === "captainMode")?.options ?? [] as option (option.value)}
													<NativeSelectOption value={option.value}>
														{option.label}
													</NativeSelectOption>
												{/each}
											</NativeSelectRoot>
										</div>
									{/snippet}
								</form.Field>

								<form.Field name="boatRentBasePort">
									{#snippet children(field)}
										<div class="space-y-2">
											<Label for="boat-rent-base-port">
												{selectedProfileEditor.fields.find(
													(entry) => entry.key === "basePort"
												)?.label ?? "Base port"}
											</Label>
											<Input
												id="boat-rent-base-port"
												type="text"
												value={field.state.value}
												disabled={pending}
												placeholder="Sochi Marine Station"
												onblur={field.handleBlur}
												oninput={(event: Event) => {
													const target = event.target as HTMLInputElement;
													field.handleChange(target.value);
												}}
											/>
											{#if selectedProfileEditor.fields.find((entry) => entry.key === "basePort")?.helpText}
												<p class="text-xs text-muted-foreground">
													{selectedProfileEditor.fields.find(
														(entry) => entry.key === "basePort"
													)?.helpText}
												</p>
											{/if}
											{#if getFieldErrors(field).length > 0}
												<p class="text-sm text-destructive">
													{getFieldErrors(field)[0]}
												</p>
											{/if}
										</div>
									{/snippet}
								</form.Field>

								<form.Field name="boatRentDepartureArea">
									{#snippet children(field)}
										<div class="space-y-2">
											<Label for="boat-rent-departure-area">
												{selectedProfileEditor.fields.find(
													(entry) => entry.key === "departureArea"
												)?.label ?? "Departure area"}
											</Label>
											<Input
												id="boat-rent-departure-area"
												type="text"
												value={field.state.value}
												disabled={pending}
												placeholder="Imeretinskaya Bay"
												onblur={field.handleBlur}
												oninput={(event: Event) => {
													const target = event.target as HTMLInputElement;
													field.handleChange(target.value);
												}}
											/>
											{#if selectedProfileEditor.fields.find((entry) => entry.key === "departureArea")?.helpText}
												<p class="text-xs text-muted-foreground">
													{selectedProfileEditor.fields.find(
														(entry) => entry.key === "departureArea"
													)?.helpText}
												</p>
											{/if}
											{#if getFieldErrors(field).length > 0}
												<p class="text-sm text-destructive">
													{getFieldErrors(field)[0]}
												</p>
											{/if}
										</div>
									{/snippet}
								</form.Field>

								<form.Field name="boatRentFuelPolicy">
									{#snippet children(field)}
										<div class="space-y-2">
											<Label for="boat-rent-fuel-policy">
												{selectedProfileEditor.fields.find(
													(entry) => entry.key === "fuelPolicy"
												)?.label ?? "Fuel policy"}
											</Label>
											<NativeSelectRoot
												id="boat-rent-fuel-policy"
												value={field.state.value}
												class="w-full"
												disabled={pending}
												onchange={(event) => {
													const target = event.target as HTMLSelectElement;
													field.handleChange(target.value as typeof field.state.value);
												}}
											>
												{#each selectedProfileEditor.fields.find((entry) => entry.key === "fuelPolicy")?.options ?? [] as option (option.value)}
													<NativeSelectOption value={option.value}>
														{option.label}
													</NativeSelectOption>
												{/each}
											</NativeSelectRoot>
										</div>
									{/snippet}
								</form.Field>

								<form.Field name="boatRentDepositRequired">
									{#snippet children(field)}
										<div class="space-y-3">
											<div class="flex items-center gap-3">
												<input
													id="boat-rent-deposit-required"
													type="checkbox"
													checked={field.state.value}
													disabled={pending}
													onchange={(event) => {
														const target = event.target as HTMLInputElement;
														field.handleChange(target.checked);
													}}
												>
												<Label for="boat-rent-deposit-required">
													{selectedProfileEditor.fields.find(
														(entry) => entry.key === "depositRequired"
													)?.label ?? "Deposit required"}
												</Label>
											</div>
										</div>
									{/snippet}
								</form.Field>

								<form.Field name="boatRentInstantBookAllowed">
									{#snippet children(field)}
										<div class="space-y-3">
											<div class="flex items-center gap-3">
												<input
													id="boat-rent-instant-book-allowed"
													type="checkbox"
													checked={field.state.value}
													disabled={pending}
													onchange={(event) => {
														const target = event.target as HTMLInputElement;
														field.handleChange(target.checked);
													}}
												>
												<Label for="boat-rent-instant-book-allowed">
													{selectedProfileEditor.fields.find(
														(entry) => entry.key === "instantBookAllowed"
													)?.label ?? "Instant book allowed"}
												</Label>
											</div>
										</div>
									{/snippet}
								</form.Field>
							</div>
						</div>
					{/if}

					{#if selectedIsExcursions && selectedProfileEditor}
						<div class="space-y-4 rounded-lg border p-4">
							<div class="space-y-1">
								<h3 class="font-medium">{selectedProfileEditor.title}</h3>
								<p class="text-xs text-muted-foreground">
									{selectedProfileEditor.description}
								</p>
							</div>

							<div class="grid gap-4 md:grid-cols-2">
								<form.Field name="excursionMeetingPoint">
									{#snippet children(field)}
										<div class="space-y-2">
											<Label for="excursion-meeting-point">
												{selectedProfileEditor.fields.find(
													(entry) => entry.key === "meetingPoint"
												)?.label ?? "Meeting point"}
											</Label>
											<Input
												id="excursion-meeting-point"
												type="text"
												value={field.state.value}
												disabled={pending}
												placeholder="Main city square"
												onblur={field.handleBlur}
												oninput={(event: Event) => {
													const target = event.target as HTMLInputElement;
													field.handleChange(target.value);
												}}
											/>
											{#if selectedProfileEditor.fields.find((entry) => entry.key === "meetingPoint")?.helpText}
												<p class="text-xs text-muted-foreground">
													{selectedProfileEditor.fields.find(
														(entry) => entry.key === "meetingPoint"
													)?.helpText}
												</p>
											{/if}
											{#if getFieldErrors(field).length > 0}
												<p class="text-sm text-destructive">
													{getFieldErrors(field)[0]}
												</p>
											{/if}
										</div>
									{/snippet}
								</form.Field>

								<form.Field name="excursionDurationMinutes">
									{#snippet children(field)}
										<div class="space-y-2">
											<Label for="excursion-duration-minutes">
												{selectedProfileEditor.fields.find(
													(entry) => entry.key === "durationMinutes"
												)?.label ?? "Duration (minutes)"}
											</Label>
											<Input
												id="excursion-duration-minutes"
												type="number"
												min="1"
												step="1"
												value={field.state.value}
												disabled={pending}
												placeholder="180"
												onblur={field.handleBlur}
												oninput={(event: Event) => {
													const target = event.target as HTMLInputElement;
													field.handleChange(target.value);
												}}
											/>
											{#if selectedProfileEditor.fields.find((entry) => entry.key === "durationMinutes")?.helpText}
												<p class="text-xs text-muted-foreground">
													{selectedProfileEditor.fields.find(
														(entry) => entry.key === "durationMinutes"
													)?.helpText}
												</p>
											{/if}
											{#if getFieldErrors(field).length > 0}
												<p class="text-sm text-destructive">
													{getFieldErrors(field)[0]}
												</p>
											{/if}
										</div>
									{/snippet}
								</form.Field>

								<form.Field name="excursionGroupFormat">
									{#snippet children(field)}
										<div class="space-y-2">
											<Label for="excursion-group-format">
												{selectedProfileEditor.fields.find(
													(entry) => entry.key === "groupFormat"
												)?.label ?? "Group format"}
											</Label>
											<NativeSelectRoot
												id="excursion-group-format"
												value={field.state.value}
												class="w-full"
												disabled={pending}
												onchange={(event) => {
													const target = event.target as HTMLSelectElement;
													field.handleChange(target.value as typeof field.state.value);
												}}
											>
												{#each selectedProfileEditor.fields.find((entry) => entry.key === "groupFormat")?.options ?? [] as option (option.value)}
													<NativeSelectOption value={option.value}>
														{option.label}
													</NativeSelectOption>
												{/each}
											</NativeSelectRoot>
										</div>
									{/snippet}
								</form.Field>

								<form.Field name="excursionMaxGroupSize">
									{#snippet children(field)}
										<div class="space-y-2">
											<Label for="excursion-max-group-size">
												{selectedProfileEditor.fields.find(
													(entry) => entry.key === "maxGroupSize"
												)?.label ?? "Max group size"}
											</Label>
											<Input
												id="excursion-max-group-size"
												type="number"
												min="1"
												step="1"
												value={field.state.value}
												disabled={pending}
												placeholder="12"
												onblur={field.handleBlur}
												oninput={(event: Event) => {
													const target = event.target as HTMLInputElement;
													field.handleChange(target.value);
												}}
											/>
											{#if selectedProfileEditor.fields.find((entry) => entry.key === "maxGroupSize")?.helpText}
												<p class="text-xs text-muted-foreground">
													{selectedProfileEditor.fields.find(
														(entry) => entry.key === "maxGroupSize"
													)?.helpText}
												</p>
											{/if}
											{#if getFieldErrors(field).length > 0}
												<p class="text-sm text-destructive">
													{getFieldErrors(field)[0]}
												</p>
											{/if}
										</div>
									{/snippet}
								</form.Field>

								<form.Field name="excursionPrimaryLanguage">
									{#snippet children(field)}
										<div class="space-y-2">
											<Label for="excursion-primary-language">
												{selectedProfileEditor.fields.find(
													(entry) => entry.key === "primaryLanguage"
												)?.label ?? "Primary language"}
											</Label>
											<Input
												id="excursion-primary-language"
												type="text"
												value={field.state.value}
												disabled={pending}
												placeholder="English"
												onblur={field.handleBlur}
												oninput={(event: Event) => {
													const target = event.target as HTMLInputElement;
													field.handleChange(target.value);
												}}
											/>
											{#if selectedProfileEditor.fields.find((entry) => entry.key === "primaryLanguage")?.helpText}
												<p class="text-xs text-muted-foreground">
													{selectedProfileEditor.fields.find(
														(entry) => entry.key === "primaryLanguage"
													)?.helpText}
												</p>
											{/if}
											{#if getFieldErrors(field).length > 0}
												<p class="text-sm text-destructive">
													{getFieldErrors(field)[0]}
												</p>
											{/if}
										</div>
									{/snippet}
								</form.Field>

								<form.Field name="excursionTicketsIncluded">
									{#snippet children(field)}
										<div class="space-y-3">
											<div class="flex items-center gap-3">
												<input
													id="excursion-tickets-included"
													type="checkbox"
													checked={field.state.value}
													disabled={pending}
													onchange={(event) => {
														const target = event.target as HTMLInputElement;
														field.handleChange(target.checked);
													}}
												>
												<Label for="excursion-tickets-included">
													{selectedProfileEditor.fields.find(
														(entry) => entry.key === "ticketsIncluded"
													)?.label ?? "Tickets included"}
												</Label>
											</div>
										</div>
									{/snippet}
								</form.Field>

								<form.Field name="excursionChildFriendly">
									{#snippet children(field)}
										<div class="space-y-3">
											<div class="flex items-center gap-3">
												<input
													id="excursion-child-friendly"
													type="checkbox"
													checked={field.state.value}
													disabled={pending}
													onchange={(event) => {
														const target = event.target as HTMLInputElement;
														field.handleChange(target.checked);
													}}
												>
												<Label for="excursion-child-friendly">
													{selectedProfileEditor.fields.find(
														(entry) => entry.key === "childFriendly"
													)?.label ?? "Child friendly"}
												</Label>
											</div>
										</div>
									{/snippet}
								</form.Field>

								<form.Field name="excursionInstantBookAllowed">
									{#snippet children(field)}
										<div class="space-y-3">
											<div class="flex items-center gap-3">
												<input
													id="excursion-instant-book-allowed"
													type="checkbox"
													checked={field.state.value}
													disabled={pending}
													onchange={(event) => {
														const target = event.target as HTMLInputElement;
														field.handleChange(target.checked);
													}}
												>
												<Label for="excursion-instant-book-allowed">
													{selectedProfileEditor.fields.find(
														(entry) => entry.key === "instantBookAllowed"
													)?.label ?? "Instant confirmation allowed"}
												</Label>
											</div>
										</div>
									{/snippet}
								</form.Field>
							</div>
						</div>
					{/if}

					<Collapsible
						bind:open={advancedMetadataOpen}
						class="overflow-hidden rounded-lg border"
					>
						<div
							class="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
						>
							<div class="space-y-1">
								<h3 class="font-medium">Advanced metadata</h3>
								<p class="text-xs text-muted-foreground">
									Use raw JSON only for listing-type fields that do not yet have
									a typed editor.
								</p>
							</div>
							<CollapsibleTrigger>
								{#snippet child({ props })}
									<Button type="button" variant="ghost" size="sm" {...props}>
										{advancedMetadataOpen ? "Hide JSON" : "Edit JSON"}
										<ChevronDown
											class={`ml-2 h-4 w-4 transition-transform ${
												advancedMetadataOpen ? "rotate-180" : ""
											}`}
										/>
									</Button>
								{/snippet}
							</CollapsibleTrigger>
						</div>
						<CollapsibleContent
							class="overflow-hidden border-t data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down"
						>
							<div class="space-y-4 p-4">
								<div
									class="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground"
								>
									<p class="font-medium text-foreground">Metadata guidance</p>
									<p class="mt-1">
										Keep metadata as an escape hatch. Prefer typed fields whenever
										the backend publishes them.
									</p>
									{#if selectedListingTypeOption}
										{#if hasSelectedMetadataSchema}
											<pre
												class="mt-3 overflow-x-auto rounded-md border bg-background p-3 font-mono text-[11px] leading-5"
											>{selectedMetadataSchemaText}</pre>
										{:else}
											<p class="mt-2">
												The selected listing type does not currently publish a
												metadata schema.
											</p>
										{/if}
									{/if}
								</div>

								<form.Field name="metadataText">
									{#snippet children(field)}
										<div class="space-y-2">
											<Label for="listing-metadata">Metadata JSON</Label>
											<Textarea
												id="listing-metadata"
												value={field.state.value}
												disabled={pending}
												rows={10}
												spellcheck={false}
												class="font-mono text-xs"
												onblur={field.handleBlur}
												oninput={(event: Event) => {
													const target = event.target as HTMLTextAreaElement;
													field.handleChange(target.value);
												}}
											/>
											<p class="text-xs text-muted-foreground">
												Metadata must be a JSON object. Leave it empty unless you
												need fields that are not modeled directly in the form yet.
											</p>
											{#if getFieldErrors(field).length > 0}
												<p class="text-sm text-destructive">
													{getFieldErrors(field)[0]}
												</p>
											{/if}
										</div>
									{/snippet}
								</form.Field>
							</div>
						</CollapsibleContent>
					</Collapsible>

					{#if errorMessage}
						<p class="text-sm text-destructive">{errorMessage}</p>
					{/if}

					<div
						class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end"
					>
						{#if showCancelButton}
							{#if onCancel}
								<Button
									type="button"
									variant="outline"
									disabled={pending}
									onclick={onCancel}
								>
									Cancel
								</Button>
							{:else}
								<Button href={cancelHref} variant="outline" disabled={pending}>
									Cancel
								</Button>
							{/if}
						{/if}
						<Button
							type="submit"
							disabled={pending || state.isSubmitting || !state.canSubmit}
						>
							{pending || state.isSubmitting
								? `${submitLabel}...`
								: submitLabel}
						</Button>
					</div>
				</form>
			{/snippet}
		</form.Subscribe>
{/snippet}

{#if showCardChrome}
	<CardRoot>
		<CardHeader>
			<CardTitle
				>{mode === "create" ? "Create listing" : "Edit listing"}</CardTitle
			>
			<CardDescription>
				{mode === "create"
					? "Create a new listing using the live catalog contract."
					: "Update listing details and metadata for this organization."}
			</CardDescription>
		</CardHeader>
		<CardContent>
			{@render formContent()}
		</CardContent>
	</CardRoot>
{:else}
	<div class="space-y-4">
		{@render formContent()}
	</div>
{/if}
