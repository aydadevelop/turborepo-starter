<script lang="ts">
	import ChevronDown from "@lucide/svelte/icons/chevron-down";
	import {
		SUPPORTED_TIMEZONES,
		isSupportedTimezone,
	} from "@my-app/reference-data/timezones";
	import { Button } from "@my-app/ui/components/button";
	import * as Card from "@my-app/ui/components/card";
	import {
		Collapsible,
		CollapsibleContent,
		CollapsibleTrigger,
	} from "@my-app/ui/components/collapsible";
	import { Input } from "@my-app/ui/components/input";
	import { Label } from "@my-app/ui/components/label";
	import * as NativeSelect from "@my-app/ui/components/native-select";
	import {
		Content as SelectContent,
		Item as SelectItem,
		Root as SelectRoot,
		Trigger as SelectTrigger,
	} from "@my-app/ui/components/select";
	import { Textarea } from "@my-app/ui/components/textarea";

	type ListingTypeOption = {
		icon?: string | null;
		isDefault: boolean;
		label: string;
		metadataJsonSchema: Record<string, unknown>;
		value: string;
	};

	type ListingEditorValues = {
		listingTypeSlug: string;
		name: string;
		slug: string;
		timezone: string;
		description?: string;
		metadata?: Record<string, unknown>;
	};

	type ListingEditorState = {
		listingTypeSlug?: string;
		name?: string;
		slug?: string;
		timezone?: string | null;
		description?: string | null;
		metadata?: Record<string, unknown> | null;
	};

	let {
		mode,
		initialValue = {},
		onSubmit,
		submitLabel,
		pending = false,
		errorMessage = null,
		listingTypeOptions = [],
	}: {
		mode: "create" | "edit";
		initialValue?: ListingEditorState;
		onSubmit: (values: ListingEditorValues) => void | Promise<void>;
		submitLabel: string;
		pending?: boolean;
		errorMessage?: string | null;
		listingTypeOptions?: ListingTypeOption[];
	} = $props();

	let listingTypeSlug = $state("");
	let name = $state("");
	let slug = $state("");
	let timezone = $state("UTC");
	let description = $state("");
	let metadataText = $state("{}");
	let advancedMetadataOpen = $state(false);
	let listingTypeError = $state<string | null>(null);
	let timezoneError = $state<string | null>(null);
	let metadataError = $state<string | null>(null);
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

	const formSeedKey = $derived(
		JSON.stringify({
			listingTypeSlug: initialValue.listingTypeSlug ?? "",
			name: initialValue.name ?? "",
			slug: initialValue.slug ?? "",
			timezone: initialValue.timezone ?? "UTC",
			description: initialValue.description ?? "",
			metadata: initialValue.metadata ?? {},
		})
	);

	$effect(() => {
		if (seededFrom === formSeedKey) return;

		listingTypeSlug = initialValue.listingTypeSlug ?? "";
		name = initialValue.name ?? "";
		slug = initialValue.slug ?? "";
		timezone = initialValue.timezone ?? "UTC";
		description = initialValue.description ?? "";
		metadataText = JSON.stringify(initialValue.metadata ?? {}, null, 2);
		advancedMetadataOpen = Boolean(
			initialValue.metadata && Object.keys(initialValue.metadata).length > 0
		);
		timezoneError = null;
		metadataError = null;
		seededFrom = formSeedKey;
	});

	const canEditType = $derived(mode === "create");
	const canEditSlug = $derived(mode === "create");
	const availableListingTypeCount = $derived(listingTypeOptions.length);
	const defaultListingTypeSlug = $derived(
		listingTypeOptions.find((option) => option.isDefault)?.value ??
			listingTypeOptions[0]?.value ??
			""
	);
	const selectedListingTypeLabel = $derived(
		listingTypeOptions.find((option) => option.value === listingTypeSlug)?.label ??
			"Select listing type"
	);
	const selectedListingTypeOption = $derived(
		listingTypeOptions.find((option) => option.value === listingTypeSlug) ?? null
	);
	const hasSelectedMetadataSchema = $derived(
		Boolean(
			selectedListingTypeOption &&
				Object.keys(selectedListingTypeOption.metadataJsonSchema).length > 0
		)
	);
	const selectedMetadataSchemaText = $derived(
		selectedListingTypeOption
			? JSON.stringify(selectedListingTypeOption.metadataJsonSchema, null, 2)
			: "{}"
	);
	const hasUnsupportedTimezone = $derived(
		timezone.trim().length > 0 && !isSupportedTimezone(timezone.trim())
	);
	const timezoneGroups = $derived.by(() => {
		const groups: Array<{ label: string; options: string[] }> = [];

		if (hasUnsupportedTimezone) {
			groups.push({
				label: "Current value",
				options: [timezone.trim()],
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

			const rawGroupLabel = option.includes("/") ? option.split("/")[0] : "Other";
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
	});
	const canSubmit = $derived(
		!pending &&
			name.trim().length > 0 &&
			slug.trim().length > 0 &&
			timezone.trim().length > 0 &&
			(!canEditType ||
				(availableListingTypeCount > 0 && listingTypeSlug.trim().length > 0))
	);

	$effect(() => {
		if (!canEditType) return;
		if (availableListingTypeCount === 0) return;

		const currentSelectionIsAvailable = listingTypeOptions.some(
			(option) => option.value === listingTypeSlug
		);
		if (!currentSelectionIsAvailable) {
			listingTypeSlug = defaultListingTypeSlug;
		}
	});

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		listingTypeError = null;
		timezoneError = null;
		metadataError = null;

		if (canEditType && listingTypeSlug.trim().length === 0) {
			listingTypeError = "Select a listing type.";
			return;
		}

		const normalizedTimezone = timezone.trim() || "UTC";
		if (!isSupportedTimezone(normalizedTimezone)) {
			timezoneError = "Use a valid IANA timezone such as UTC or Europe/Berlin.";
			return;
		}

		let metadata: Record<string, unknown> | undefined;
		const trimmedMetadata = metadataText.trim();

		if (trimmedMetadata.length > 0) {
			try {
				const parsed = JSON.parse(trimmedMetadata) as unknown;
				if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
					metadataError = "Metadata must be a JSON object.";
					return;
				}
				metadata = parsed as Record<string, unknown>;
			} catch {
				metadataError = "Metadata must be valid JSON.";
				return;
			}
		}

		void onSubmit({
			listingTypeSlug: listingTypeSlug.trim(),
			name: name.trim(),
			slug: slug.trim(),
			timezone: normalizedTimezone,
			description: description.trim() || undefined,
			metadata,
		});
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{mode === "create" ? "Create listing" : "Edit listing"}</Card.Title>
		<Card.Description>
			{mode === "create"
				? "Create a new listing using the live catalog contract."
				: "Update listing details and metadata for this organization."}
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<form class="space-y-4" onsubmit={handleSubmit}>
			<div class="grid gap-4 md:grid-cols-2">
				<div class="space-y-2">
					<Label for="listing-type-slug">Listing type</Label>
					{#if canEditType}
						<SelectRoot
							type="single"
							value={listingTypeSlug}
							onValueChange={(value) => {
								listingTypeSlug = value ?? "";
								listingTypeError = null;
							}}
							disabled={pending || availableListingTypeCount === 0}
						>
							<SelectTrigger id="listing-type-slug">
								{selectedListingTypeLabel}
							</SelectTrigger>
							<SelectContent>
								{#each listingTypeOptions as option (option.value)}
									<SelectItem value={option.value} label={option.label} />
								{/each}
							</SelectContent>
						</SelectRoot>
						{#if availableListingTypeCount === 0}
							<p class="text-xs text-muted-foreground">
								No listing types are currently available for this organization.
							</p>
						{/if}
						{#if listingTypeError}
							<p class="text-sm text-destructive">{listingTypeError}</p>
						{/if}
					{:else}
						<Input
							id="listing-type-slug"
							type="text"
							bind:value={listingTypeSlug}
							disabled={true}
							/>
						<p class="text-xs text-muted-foreground">
							Listing type is fixed after creation.
						</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="listing-timezone">Timezone</Label>
					<NativeSelect.Root
						id="listing-timezone"
						bind:value={timezone}
						class="w-full"
						disabled={pending}
						required
						aria-invalid={timezoneError ? "true" : undefined}
						onchange={() => {
							timezoneError = null;
						}}
					>
						{#each timezoneGroups as group (group.label)}
							<NativeSelect.OptGroup label={group.label}>
								{#each group.options as option (option)}
									<NativeSelect.Option value={option}>{option}</NativeSelect.Option>
								{/each}
							</NativeSelect.OptGroup>
						{/each}
					</NativeSelect.Root>
					<p class="text-xs text-muted-foreground">
						{#if hasUnsupportedTimezone}
							The current value is outside the supported IANA registry. Choose a valid
							timezone before saving.
						{:else}
							Choose a valid IANA timezone such as <code>UTC</code> or
							<code>Europe/Berlin</code>.
						{/if}
					</p>
					{#if timezoneError}
						<p class="text-sm text-destructive">{timezoneError}</p>
					{/if}
				</div>
			</div>

			<div class="space-y-2">
				<Label for="listing-name">Name</Label>
				<Input
					id="listing-name"
					type="text"
					bind:value={name}
					disabled={pending}
					placeholder="Evening charter"
					required
					maxlength={200}
					minlength={1}
					/>
			</div>

			<div class="space-y-2">
				<Label for="listing-slug">Slug</Label>
				<Input
					id="listing-slug"
					type="text"
					bind:value={slug}
					disabled={!canEditSlug || pending}
					placeholder="evening-charter"
					pattern="^[a-z0-9-]+$"
					required
					maxlength={200}
					minlength={1}
					/>
				<p class="text-xs text-muted-foreground">
					Lowercase letters, numbers, and hyphens only.
				</p>
				{#if !canEditSlug}
					<p class="text-xs text-muted-foreground">
						Slug stays read-only for edits because the current update contract does not accept it.
					</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="listing-description">Description</Label>
				<Textarea
					id="listing-description"
					bind:value={description}
					disabled={pending}
					placeholder="Describe the experience, amenities, and what customers should know."
					rows={5}
					/>
			</div>

			<Collapsible
				bind:open={advancedMetadataOpen}
				class="overflow-hidden rounded-lg border"
			>
				<div class="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
					<div class="space-y-1">
						<h3 class="font-medium">Advanced metadata</h3>
						<p class="text-xs text-muted-foreground">
							Use raw JSON only for listing-type fields that do not yet have a typed
							editor.
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
					class="border-t data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden"
				>
					<div class="space-y-4 p-4">
						<div class="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
							<p class="font-medium text-foreground">Metadata guidance</p>
							<p class="mt-1">
								Keep metadata as an escape hatch. Prefer typed fields whenever the
								backend publishes them.
							</p>
							{#if selectedListingTypeOption}
								{#if hasSelectedMetadataSchema}
									<pre
										class="mt-3 overflow-x-auto rounded-md border bg-background p-3 font-mono text-[11px] leading-5"
									>{selectedMetadataSchemaText}</pre>
								{:else}
									<p class="mt-2">
										The selected listing type does not currently publish a metadata
										schema.
									</p>
								{/if}
							{/if}
						</div>

						<div class="space-y-2">
							<Label for="listing-metadata">Metadata JSON</Label>
							<Textarea
								id="listing-metadata"
								bind:value={metadataText}
								disabled={pending}
								rows={10}
								spellcheck={false}
								class="font-mono text-xs"
							/>
							<p class="text-xs text-muted-foreground">
								Metadata must be a JSON object. Leave it empty unless you need fields
								that are not modeled directly in the form yet.
							</p>
							{#if metadataError}
								<p class="text-sm text-destructive">{metadataError}</p>
							{/if}
						</div>
					</div>
				</CollapsibleContent>
			</Collapsible>

			{#if errorMessage}
				<p class="text-sm text-destructive">{errorMessage}</p>
			{/if}

			<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
				<Button href="/org/listings" variant="outline" disabled={pending}>
					Cancel
				</Button>
				<Button type="submit" disabled={!canSubmit}>
					{pending ? `${submitLabel}...` : submitLabel}
				</Button>
			</div>
		</form>
	</Card.Content>
</Card.Root>
