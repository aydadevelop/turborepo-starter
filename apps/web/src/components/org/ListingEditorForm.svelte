<script lang="ts">
	import { Button } from "@my-app/ui/components/button";
	import * as Card from "@my-app/ui/components/card";
	import { Input } from "@my-app/ui/components/input";
	import { Label } from "@my-app/ui/components/label";
	import { Textarea } from "@my-app/ui/components/textarea";

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
	}: {
		mode: "create" | "edit";
		initialValue?: ListingEditorState;
		onSubmit: (values: ListingEditorValues) => void | Promise<void>;
		submitLabel: string;
		pending?: boolean;
		errorMessage?: string | null;
	} = $props();

	let listingTypeSlug = $state("");
	let name = $state("");
	let slug = $state("");
	let timezone = $state("UTC");
	let description = $state("");
	let metadataText = $state("{}");
	let metadataError = $state<string | null>(null);
	let seededFrom = $state<string | null>(null);

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
		metadataError = null;
		seededFrom = formSeedKey;
	});

	const canEditType = $derived(mode === "create");
	const canEditSlug = $derived(mode === "create");

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		metadataError = null;

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
			timezone: timezone.trim() || "UTC",
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
					<Input
						id="listing-type-slug"
						type="text"
						bind:value={listingTypeSlug}
						disabled={!canEditType || pending}
						placeholder="boat-rental"
						required
						maxlength={120}
						minlength={1}
						/>
					{#if !canEditType}
						<p class="text-xs text-muted-foreground">
							Listing type is fixed after creation.
						</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="listing-timezone">Timezone</Label>
					<Input
						id="listing-timezone"
						type="text"
						bind:value={timezone}
						disabled={pending}
						placeholder="UTC"
						required
						/>
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
					Metadata must be a JSON object that matches the listing type’s schema.
				</p>
				{#if metadataError}
					<p class="text-sm text-destructive">{metadataError}</p>
				{/if}
			</div>

			{#if errorMessage}
				<p class="text-sm text-destructive">{errorMessage}</p>
			{/if}

			<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
				<Button href="/org/listings" variant="outline" disabled={pending}>
					Cancel
				</Button>
				<Button type="submit" disabled={pending}>
					{pending ? `${submitLabel}...` : submitLabel}
				</Button>
			</div>
		</form>
	</Card.Content>
</Card.Root>