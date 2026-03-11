# ADR-013: Backend-Governed Reference Data and Form Composition

**Date:** 2026-03-11
**Status:** Accepted
**Authors:** Platform Team
**Related:** [ADR-002: Architecture Patterns](./002_architecture-patterns.md), [ADR-005: oRPC API Boundary](./005-orpc_api_boundary.md), [ADR-010: Schema Modernization Constitution](./010_schema_modernization_constitution.md), [ADR-012: Authorization Boundary and Resource Ownership](./012_authorization_boundary_and_resource_ownership.md)

---

## Context

The repo now correctly rejects invalid `listingTypeSlug` values in the catalog domain and maps them to clean oRPC errors at the API boundary. That fixed the immediate integrity issue, but it exposed a broader frontend composition problem:

- [apps/web/src/components/org/ListingEditorForm.svelte](/Users/d/Documents/Projects/turborepo-alchemy/apps/web/src/components/org/ListingEditorForm.svelte) still renders `listingTypeSlug` as a free-text input
- [apps/web/src/routes/(app)/org/listings/new/+page.svelte](/Users/d/Documents/Projects/turborepo-alchemy/apps/web/src/routes/(app)/org/listings/new/+page.svelte) submits that free-text value directly to `listing.create`
- the backend owns the real rules for which listing types exist, which are active, and which are enabled for an organization

This pattern will repeat anywhere the UI needs to compose backend-governed option fields:

- listing types
- payment providers
- calendar providers
- publication channels
- org-enabled integrations
- listing-type-specific metadata editors
- any future domain registry with activation, scope, or policy overlays

If the frontend hardcodes or invents these values, three problems follow:

1. invalid values are only discovered at mutation time
2. backend policy overlays are duplicated or lost in the client
3. edit/create forms become brittle when a value is inactive, disabled, org-scoped, or only conditionally allowed

We also need to separate these from **canonical external registries** such as IANA timezones and from **advanced escape-hatch inputs** such as raw metadata JSON.

We need a repo rule for composing these fields in the frontend without building a generic dynamic-form framework.

---

## Decision

For all **backend-governed selectable fields**, the frontend must consume **oRPC read models owned by the backend domain**. The frontend must not invent option values locally for app-owned registries.

The canonical rule is:

> Backend-governed options are queried, not hardcoded.

This mirrors the useful part of the Medusa pattern:

- admin and widget forms load backend-owned option data through typed API reads
- module or link resolution happens on the backend
- complex editors can receive one backend-composed payload instead of stitching registry state in the client

We adopt that pattern through oRPC read models and editor bootstrap queries, not through a generic form framework or Medusa's container/runtime model.

We also adopt two adjacent rules so admin forms stay coherent without overengineering:

- canonical external registries use a shared validated source, not ad hoc free text
- raw JSON remains an advanced escape hatch until the owning domain publishes a typed editor model

### What counts as backend-governed reference data

A field is backend-governed if any of the following are true:

- the values are stored in the database
- the values can be active/inactive
- the values can be enabled/disabled per organization
- the values carry backend-owned metadata, schema, or defaults
- the values are subject to authorization or policy checks

Examples:

- `listingTypeSlug`
- payment provider selection
- calendar provider selection
- publication channel selection
- org-scoped capability enablement

### What does not require backend composition

The frontend may keep local-only options when they are presentation concerns rather than backend-governed business state.

Examples:

- UI sort order dropdowns
- purely visual filters
- static view-mode toggles
- standardized client-side datasets that are not app-owned registry state

These exceptions do **not** apply to app-owned business registries.

### Canonical external registries

Some fields are not app-owned registries, but they still should not be unconstrained free text.

Examples:

- IANA timezones
- ISO currencies when the backend accepts any standard currency code
- ISO country codes when the backend accepts any standard country code

For these fields, the rule is:

> Use one shared canonical registry and validate against it at the boundary.

The frontend may use a select, combobox, or datalist backed by that canonical registry. Prefer design-system controls over ad hoc HTML patterns. For long standardized lists such as timezones, a native select is the default because it preserves browser/mobile behavior without inventing a custom search widget.

The backend still validates the submitted value.

In this repo, those registries belong in `@my-app/reference-data`, not `@my-app/api-contract`.

These fields do **not** need a domain-owned oRPC option query unless backend policy narrows or defaults the allowed set for the current actor or resource.

### Advanced escape-hatch fields

Some fields exist for extensibility or developer-facing flexibility, but they should not define the primary product UX.

Examples:

- raw metadata JSON
- provider payload blobs
- experimental config objects

For these fields, the rule is:

> Keep the raw field available only as an advanced escape hatch until the domain publishes a typed editor model.

Raw JSON inputs should be hidden behind an advanced section, never treated as the primary editing surface when a typed schema or domain model exists or is planned.

---

## Hard Rules

### 1. No free-text entry for governed option fields

If a field is backed by a backend registry or policy overlay, the default frontend control is a constrained selector, not a text input.

`listingTypeSlug` is the canonical current example.

### 2. Domain-owned read models

The owning domain must expose the option data over oRPC.

The shape belongs to the domain that owns the rule:

- listing types → `listing` or `organization`
- payment providers → `payments`
- calendar providers → `calendar`

Do not create a generic cross-domain “options” endpoint.

### 3. Mutations keep stable scalar identifiers

Mutations should still accept stable scalar values such as:

- `slug`
- `id`
- provider key

The frontend sends the selected identifier; it does not send the whole option object back.

### 4. Backend resolves overlays before the frontend sees options

The frontend must not compose platform registry + organization overrides + active/inactive filtering on its own.

The backend read model returns the already-resolved allowed set for the current actor and scope.

For listing types, that means:

- if the org has no `organization_listing_type` rows, return active platform listing types
- if the org has configured org-level listing types, return only the enabled active subset

### 5. Complex editors may use a backend-composed bootstrap payload

When a form needs more than one backend-governed option set or needs option metadata that must stay coherent with the entity, the owning domain may expose a dedicated **editor bootstrap** query.

Examples:

- create listing editor
- edit listing editor
- payment configuration editor

This is preferred over stitching many unrelated client queries when the form depends on coherent backend state.

### 5a. Canonical registries do not need domain option endpoints by default

Do not create backend option endpoints for every standardized dataset.

If the source of truth is a stable external registry, prefer:

- a shared registry utility
- shared validation at the contract/domain boundary
- a thin frontend control bound to that registry

Escalate to a backend bootstrap query only when backend policy adds narrowing, defaults, or resource-specific rules.

### 6. No generic schema-driven form platform in this ADR

This ADR does **not** introduce:

- a generic form renderer
- a universal field registry for every UI field
- a dynamic frontend form engine

The goal is correct composition of backend-governed fields, not a no-code form system.

### 7. Use the smallest field authority pattern that preserves correctness

Admin fields should follow this escalation ladder:

1. local presentation option
2. canonical shared registry with validation
3. backend-governed option query
4. backend-composed editor bootstrap query

Choose the smallest layer that keeps the backend authoritative and the frontend predictable.

Examples:

- `timezone` → canonical shared registry with validation
- `listingTypeSlug` → backend-governed option query
- `metadata` for a listing type → advanced escape hatch first, bootstrap query or typed editor later

---

## Reference Model Shape

For simple governed option fields, the backend should return a small typed option list.

Canonical shape:

```ts
type ReferenceOption<TValue extends string = string> = {
  value: TValue
  label: string
  description?: string | null
  disabled?: boolean
}
```

For richer fields, the domain may extend the option shape with domain-owned metadata.

Example for listing types:

```ts
type ListingTypeOption = {
  value: string
  label: string
  description?: string | null
  icon?: string | null
  metadataJsonSchema: Record<string, unknown>
  requiredFields?: string[]
  defaultAmenityKeys?: string[]
  supportedPricingModels?: string[]
}
```

The frontend consumes these as read models. The mutation still sends only `listingTypeSlug`.

For canonical registries, use a shared utility rather than a domain read model.

---

## Editor Composition Pattern

### Simple option field

Use a dedicated query:

- `listing.listAvailableTypes`
- `payments.listAvailableProviders`
- `calendar.listAvailableProviders`

### Complex editor

Use a dedicated bootstrap query owned by the domain:

```ts
listing.getCreateEditorState
listing.getEditEditorState
```

That payload may include:

- current entity data
- allowed option sets
- domain-owned metadata/schema
- defaults needed for the editor
- read-only or disabled flags

This avoids frontend race conditions and partial composition for forms that need coherent backend state.

### Advanced metadata

Until a typed editor exists, metadata should follow this progression:

1. read-only schema hint from the selected backend option where available
2. raw JSON inside an advanced section
3. eventual typed metadata editor from a bootstrap payload

This keeps extensibility available without making raw JSON the primary authoring path.

---

## Handling Disabled or Legacy Values

Edit forms have an extra problem: the current entity may reference a value that is no longer selectable for new entities.

The backend-composed editor state must account for this explicitly.

Rules:

- create flows return only currently allowed values
- edit flows may include the current value even if it is no longer selectable for new entities
- if a current value is retained only for display, the read model should mark it read-only or unavailable for reselection

The frontend must not silently drop the current value because it disappeared from the allowed create set.

---

## Caching And Invalidations

Reference-data queries are still scoped business data.

Rules:

- scope queries by actor and organization where applicable
- invalidate on org switch
- invalidate after admin or org settings actions that change the option source
- do not treat backend-governed reference data as global immutable constants

Examples:

- invalidate listing type options after org listing-type settings change
- invalidate payment provider options after payment config setup changes

---

## Error Handling

Frontend option composition improves UX, but it does not replace backend enforcement.

The backend still remains the authority:

- domain validates selected value
- API maps domain errors to stable oRPC errors
- frontend shows the backend error if state changed after options were loaded

The same rule applies to canonical registries such as timezones: the frontend may guide entry, but the contract/domain still validates the submitted value.

---

## Current Applications

### Listing create/edit

- `listingTypeSlug` uses a backend-governed oRPC read model
- `timezone` should use the shared canonical timezone registry plus boundary validation
- `metadata` should stay behind an advanced disclosure until listing-type-specific editor state is introduced

### Future admin field guidance

Use this ADR before introducing any new admin field that looks like:

- a free-text slug or provider key
- a raw JSON blob
- a standard registry value entered as arbitrary text

The default question is:

> Is this a local UI option, a canonical registry, a backend-governed business option, or a schema-driven extension field?

That answer determines the field composition pattern.

The UI should assume options can go stale between query and mutation.

---

## Immediate Application To Listings

The first application of this ADR is the listing editor flow.

Current problem:

- [apps/web/src/components/org/ListingEditorForm.svelte](/Users/d/Documents/Projects/turborepo-alchemy/apps/web/src/components/org/ListingEditorForm.svelte) uses a text input for `listingTypeSlug`

Target state:

- add an oRPC query for available listing types
- replace the free-text field with a typed select/combobox
- keep backend validation in catalog
- later expose listing-type metadata/schema through a listing-editor read model instead of forcing the frontend to infer it

---

## Roadmap

### Phase 1: Listings

- add a domain-owned oRPC read model for available listing types
- update the listing create form to consume that query
- stop rendering `listingTypeSlug` as free text in create mode

### Phase 2: Editor bootstrap

- add listing create/edit bootstrap queries if metadata/schema composition becomes multi-query or brittle
- move listing-type metadata needs into that payload instead of frontend stitching

### Phase 3: Broader governed fields

- apply the same pattern to payment providers
- apply the same pattern to calendar providers
- apply the same pattern to other org-enabled registries as they appear

---

## Consequences

### Positive

- frontend stops inventing backend-owned option values
- policy overlays stay in one place: the backend domain
- create/edit forms get more reliable and easier to reason about
- the oRPC contract becomes the single typed source for selectable business options

### Tradeoffs

- more read models will exist in `packages/api-contract`
- some forms will require one extra bootstrap query
- option shapes must be maintained intentionally instead of relying on ad hoc frontend literals

---

## Summary Rule

If the backend owns the business meaning of an option field, the frontend must query that option field from the backend over oRPC and compose the form from that read model.
