# ADR-014: Admin Surface Composition and Resource Descriptors

**Date:** 2026-03-11
**Status:** Accepted
**Authors:** Platform Team
**Related:** [ADR-005: oRPC API Boundary](./005-orpc_api_boundary.md), [ADR-010: Schema Modernization Constitution](./010_schema_modernization_constitution.md), [ADR-013: Backend-Governed Reference Data and Form Composition](./013_backend_governed_reference_data_and_form_composition.md)

---

## Context

The web app already has several admin and operator surfaces, but they are still built ad hoc:

- admin tables inline query, filter, pagination, and empty-state logic in route files
- org and admin forms keep field state and mutation wiring directly in route components
- auth-owned organization flows and domain-owned oRPC flows use different transport shapes directly in UI code
- backend-governed field composition is now partially standardized for listing types, but there is no wider rule for how complex org/admin interfaces should be authored

Current repo truth:

- `apps/web` is primarily a SPA-style app using TanStack Query reads and client-side mutations
- `apps/web/src/lib/orpc.ts` already exposes both:
  - `orpc` for query option builders and lightweight action mutations
  - `client` for raw promise-based oRPC calls
- `packages/ui` already provides the design-system primitives needed for most surfaces
- Formsnap / Superforms are not currently installed or used in the app layer
- TanStack Form already exists in the app and is a better fit than inventing more local-state form patterns
- admin and org surfaces still mix app-owned oRPC reads with some auth-owned `authClient` calls
- repeated table, filter, pagination, and mutation patterns already exist in routes such as:
  - `apps/web/src/routes/(app)/admin/organizations/+page.svelte`
  - `apps/web/src/routes/(app)/admin/users/+page.svelte`
  - `apps/web/src/routes/(app)/org/listings/+page.svelte`
  - `apps/web/src/routes/(app)/org/settings/+page.svelte`
  - `apps/web/src/routes/(app)/org/team/+page.svelte`
  - `apps/web/src/routes/(app)/org/team/invite/+page.svelte`
  - `apps/web/src/components/org/ListingEditorForm.svelte`

The system needs an organized way to build many admin and operator interfaces without:

- leaking backend rules into the client
- generating UI directly from database schema or raw Zod schema
- inventing a full no-code form engine
- duplicating filters, columns, invalidation, field layout, and loading/error states in every route
- coupling route structure to transport details like `authClient` vs oRPC

---

## Decision

We will use a **resource descriptor + feature module** model for admin and operator surfaces.

The core rule is:

> Backend owns business meaning, capability, and allowed state transitions. Frontend owns layout and interaction through typed resource modules and small descriptors.

This yields five layers:

1. **Canonical registries**
   - stable shared datasets such as timezones, currencies, and country codes
   - live in `@my-app/reference-data`
2. **Backend-governed surface data**
   - option sets, defaults, capability flags, bootstrap payloads, server-driven table rows, and filter contracts
   - live behind oRPC contracts and domain handlers
3. **Feature mutation adapters**
   - normalize auth-backed and oRPC-backed mutations into one screen-facing model
   - live in `apps/web/src/features/<resource>/`
4. **Frontend resource descriptors**
   - field layout, section grouping, column definitions, filter presentation, and action placement
   - live in `apps/web/src/features/<resource>/`
5. **Shared UI shells**
   - reusable wrappers for page states, filter bars, resource tables, section scaffolding, confirm flows, and advanced fields
   - live in `apps/web/src/components` or `packages/ui` depending on scope

We explicitly do **not** adopt:

- a universal schema-to-admin generator
- Superforms as the default form architecture
- direct route-level transport calls once a feature module exists

---

## Live Surface Inventory

The org/admin mutation surface is **not** currently mostly oRPC. It is split.

### Auth-owned org and admin mutation surfaces

These currently call `authClient` directly from the web layer:

- `apps/web/src/routes/(app)/org/create/+page.svelte`
- `apps/web/src/components/OrgSwitcher.svelte`
- `apps/web/src/routes/(app)/org/settings/+page.svelte`
- `apps/web/src/routes/(app)/org/team/invite/+page.svelte`
- `apps/web/src/routes/(app)/org/team/+page.svelte`
- `apps/web/src/routes/(app)/org/invitations/+page.svelte`
- `apps/web/src/routes/(app)/admin/users/+page.svelte`
- `apps/web/src/components/Header.svelte`

### Domain-owned oRPC mutation surfaces already in org flows

These already use oRPC-backed mutations:

- `apps/web/src/routes/(app)/org/listings/new/+page.svelte`
- `apps/web/src/routes/(app)/org/listings/[id]/+page.svelte`
- `apps/web/src/components/org/ListingPublicationButton.svelte`

This boundary split is acceptable at the backend layer. It must not become the screen architecture.

Routes should compose feature modules. Feature modules should own transport differences.

---

## Hard Rules

### 1. Do not generate forms or tables directly from DB schema

Database schema is not a UI contract.

It does not express:

- actor-specific visibility
- backend policy overlays
- copy, grouping, and field order
- display-only and action-only fields
- advanced vs primary editing paths
- cross-field workflow behavior
- moderation state

Schema and JSON Schema may inform a surface, but they are not the surface definition.

### 2. Backend-governed fields still come from backend read models

Any business-governed option set, capability flag, or typed metadata schema must come from the owning backend domain via oRPC.

Examples:

- listing types
- payment providers
- calendar providers
- org-enabled integrations
- listing-type metadata schema
- readiness and moderation state
- allowed actions for a row or section

This extends ADR-013.

### 3. Canonical registries live outside `@my-app/api-contract`

Shared registries that are not API contracts belong in `@my-app/reference-data`, not `@my-app/api-contract`.

Examples:

- IANA timezones
- ISO currencies
- ISO countries

`packages/api-contract` remains contract-only.

### 4. Routes stay thin

Once a resource module exists, route files should primarily:

- read params
- assemble top-level queries
- render the feature surface

Route files should not become the home for:

- transport branching
- schema validation
- invalidation lists
- mutation error mapping
- repeated table/filter definitions

### 5. Frontend descriptors are resource-specific, not global magic

Each admin surface may define typed descriptors for:

- fields
- sections
- columns
- filters
- row actions
- bulk actions

Those descriptors belong to the resource module that owns the screen.

Do not create a single global descriptor registry for the entire app.

### 6. Shared shells may render descriptors, but only for a small whitelisted DSL

If we render descriptors, we only support a finite set of field and column kinds.

Allowed field kinds should stay small and explicit:

- `text`
- `textarea`
- `number`
- `checkbox`
- `switch`
- `native-select`
- `select`
- `date`
- `money`
- `json-advanced`

Allowed table cell kinds should also stay small and explicit:

- `text`
- `badge`
- `date`
- `money`
- `boolean`
- `link`
- `actions`

No arbitrary component names or executable UI definitions from the backend.

### 7. Tables stay server-driven

Admin and operator tables must use backend contracts for:

- row DTO shape
- pagination
- filtering
- sorting
- bulk-action eligibility

The frontend controls rendering, but the backend remains the source of truth for data, filtering, and policy.

### 8. Forms are authored first, rendered second

Default posture:

- use authored resource forms with shared field primitives
- extract repeated sections into shared renderers only after real duplication appears

Do not begin with a generic form generator.

### 9. TanStack Form is the default for non-trivial SPA forms

For this repo today:

- keep TanStack Query for reads
- keep `createMutation(() => orpc.<...>.mutationOptions(...))` for lightweight one-step actions
- use TanStack Form plus zod for non-trivial SPA resource editors

Do not introduce Superforms as the default mutation architecture for org/admin surfaces at this stage.

Superforms remains an optional tool for future action-native routes, not the baseline here.

### 10. Better Auth-owned surfaces are a temporary backend exception, not a frontend exception

Where the source of truth still lives behind Better Auth client APIs, the surface may continue using `authClient`.

But once a resource module exists:

- the screen must consume a feature-layer adapter
- raw `authClient.organization.*` and `authClient.admin.*` calls should not live in route markup

### 11. Generated interfaces must be built from resource workspaces, not isolated CRUD pages

If a domain needs many related editors, tables, and actions, the frontend should compose them as a workspace grouped by operator flow.

This is the default rule for listings and other dense operator domains.

---

## Query And Mutation Composition

The repo already has two useful clients in `apps/web/src/lib/orpc.ts`:

- `client`
  - raw oRPC client from `createORPCClient`
  - promise-based
  - suitable for pure TypeScript submit adapters
- `orpc`
  - TanStack Query utilities from `createTanstackQueryUtils`
  - suitable for query option builders and lightweight action mutations

### Query rule

For read-side resource data:

- use `orpc.<resource>.<query>.queryOptions(...)`
- keep resource-specific query composition in feature `queries.ts`

### Mutation rule for non-trivial forms

For non-trivial resource editors:

- use TanStack Form for client-side form state
- keep zod schemas in feature `schema.ts`
- call raw `client` or wrapped `authClient` inside a pure TypeScript submit adapter
- run invalidation through a feature `invalidations.ts`

Why:

- TanStack Form provides submit lifecycle and pending state without forcing SvelteKit actions
- pure TS adapters are easier to test than Svelte component mutations
- route and component files stay thin

### Mutation rule for buttons and lightweight actions

For simple non-form actions:

- continue using `createMutation(() => orpc.<resource>.<action>.mutationOptions(...))`

Examples:

- publish / unpublish
- accept / reject invitation
- impersonate user
- quick row actions
- confirm-dialog actions with one small payload

### Mutation adapter rule

Never make the screen care whether a mutation is backed by:

- `authClient`
- raw `client`
- `orpc.<resource>.<action>.mutationOptions`

Instead, feature modules should normalize transport to one screen-facing API.

Example shape:

```ts
type MutationResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };
```

The screen consumes the feature API, not the transport client.

---

## Target Structure

### Shared canonical data

`packages/reference-data`

- `timezones.ts`
- later `currencies.ts`, `countries.ts`, `languages.ts`

### Backend-governed surface contracts

`packages/api-contract/src/routers/*`

- bootstrap queries
- list/query contracts
- filter inputs
- row DTOs
- action inputs/outputs
- moderation and readiness state

### Frontend resource modules

`apps/web/src/features/<resource>/`

Suggested files:

- `queries.ts`
- `mutations.ts`
- `submit.ts`
- `schema.ts`
- `surface.ts`
- `invalidations.ts`
- `errors.ts`
- `components/*`

File responsibilities:

- `queries.ts`
  - query option builders
  - bootstrap query composition
- `mutations.ts`
  - lightweight action mutation builders
  - transport adapters where a full `submit.ts` is unnecessary
- `submit.ts`
  - non-trivial form submit flows backed by raw `client` or wrapped `authClient`
- `schema.ts`
  - zod schemas and defaults
- `surface.ts`
  - sections, columns, filters, actions, and layout descriptors
- `invalidations.ts`
  - cache invalidation policy
- `errors.ts`
  - transport-to-UI error normalization

Rules:

- keep a route local until logic is reused or exceeds route readability
- promote to `features/<resource>` when used by two or more routes or when a surface becomes non-trivial

### Shared app-level shells

`apps/web/src/components/admin/`

Suggested shared shells:

- `ResourcePageState.svelte`
- `ResourceToolbar.svelte`
- `ResourceTable.svelte`
- `FilterBar.svelte`
- `FormSection.svelte`
- `AdvancedFieldSection.svelte`
- `ConfirmActionDialog.svelte`

These are app shells, not design-system primitives.

### Design-system primitives

`packages/ui`

Use only for low-level reusable UI primitives:

- buttons
- cards
- inputs
- selects
- native selects
- tables
- dialogs
- popovers

Do not move app-specific admin rendering policy into `packages/ui`.

---

## Generation Model

### Forms

There are three allowed levels:

1. **Authored form**
   - hand-written component with shared field primitives
   - default for most resource editors
2. **Descriptor-rendered sections**
   - resource module provides typed field descriptors
   - shared shell renders common field kinds
   - still resource-owned, not global
3. **Advanced escape hatch**
   - raw JSON or metadata editors behind an advanced section
   - only when no typed editor exists yet

### Tables

There are two allowed levels:

1. **Authored columns on shared table shell**
   - default
2. **Descriptor-driven columns on shared table shell**
   - only after repeated tables clearly share the same rendering model

No spreadsheet-style generic grid in this ADR.

---

## Listing Workspace Rule

Listings are the reference example for a dense operator workspace.

We should not build separate disconnected CRUD pages for:

- listing basics
- pricing profiles
- pricing rules
- discounts
- amenities
- assets
- calendar connections
- recurring availability
- minimum durations
- blocks and exceptions
- location moderation
- publish readiness

Instead, listing surfaces should converge on one workspace at `/org/listings/[id]`, grouped by operator flow.

### Suggested workspace sections

- `Basics`
  - core listing fields
  - listing type
  - timezone
  - description
- `Merchandising`
  - amenities
  - assets
- `Pricing`
  - pricing profiles
  - pricing rules
  - discounts
- `Availability`
  - recurring rules
  - minimum durations
  - exceptions
  - blocks
  - calendar connections
- `Compliance`
  - location draft
  - moderation state
- `Publish`
  - readiness checklist
  - publish / unpublish

### Allowed surface archetypes

We should solve most listing screens with a small set of repeatable shells:

- `SingularEditor`
- `ResourceTable`
- `PickerManager`
- `OrderedAssetManager`
- `ModerationPanel`
- `ReadinessPanel`

Do not create a generic admin engine just to render these.

### Listing-type-specific behavior

Listing-type differences must come from backend-composed policy/bootstrap data, not scattered frontend branching.

The backend may return editor state such as:

- allowed and default amenities
- supported pricing models
- default working-hour or duration bounds
- required fields
- metadata schema
- whether moderation is required

The frontend may use that state to:

- prefill values
- disable or hide unsupported controls
- show required fields
- render advanced metadata only when needed

It must not invent those rules.

---

## Moderation Rule

If a field family requires review before becoming live, do not edit the approved record directly.

For listing locations, the preferred model is a location-specific draft/submission flow:

- live approved location
- editable draft
- moderation status: `draft | pending_moderation | approved | rejected`
- moderator note
- submitted / approved / rejected timestamps

The flow is:

1. operator edits the draft
2. operator saves draft or submits for moderation
3. moderator approves or rejects
4. approval promotes the draft to the live record

Do not build a generic moderation engine in this ADR. Build a location-specific moderation surface first.

---

## Testing Strategy

We do not currently have frontend component test infrastructure in `apps/web`.

Therefore the low-entropy seam should be **pure TypeScript feature modules**.

For each non-trivial resource module, test:

- `schema.ts`
  - input validation and defaults
- `errors.ts`
  - transport-to-UI error normalization
- `invalidations.ts`
  - correct query invalidation policy
- `submit.ts` and `mutations.ts`
  - adapter behavior with mocked authClient or oRPC layer
- `surface.ts`
  - descriptor integrity where there is non-trivial field or column logic

Keep Playwright for:

- end-to-end happy paths
- auth and redirect behavior
- integration smoke for important operator flows

Do not rely on:

- route-component logic tests as the primary seam
- giant page snapshots

---

## Recommended Resource Breakdown

### Auth-owned org account resources

- `features/org-account/create`
- `features/org-account/settings`
- `features/org-account/team`
- `features/org-account/invitations`
- `features/org-account/switcher`

These wrap Better Auth and normalize it to the same screen architecture as oRPC resources.

### Domain-owned org operation resources

- `features/org-listings`
- `features/org-payments`
- `features/org-calendar`
- `features/org-pricing`
- `features/org-availability`
- `features/org-support`
- `features/org-bookings`

These remain oRPC-first.

### Admin oversight resources

- `features/admin-organizations`
- `features/admin-users`

These are mostly table surfaces with small action surfaces.

---

## Roadmap

### Phase 1

- Keep ADR-013 focused on field-authority rules
- Keep canonical registries in `@my-app/reference-data`
- Use this ADR as the single composition rule for org/admin surfaces

### Phase 2

- Introduce `apps/web/src/features/` for the first real resource modules
- Extract auth-owned org account flows behind feature mutation adapters:
  - org settings
  - team invite
  - team member actions
  - invitation accept / reject
  - org switcher

### Phase 3

- Add shared app-level shells for:
  - resource table
  - confirm action dialog
  - page state
  - advanced metadata section
- Apply them to:
  - admin organizations
  - admin users
  - org team members and invitations

### Phase 4

- Convert listings into a real workspace module using:
  - backend bootstrap data
  - TanStack Form for non-trivial editors
  - shared surface archetypes
  - moderation and readiness panels

### Phase 5

- Add richer org operator setup flows:
  - payment provider setup
  - calendar connection
  - organization onboarding panel
- Introduce descriptor-rendered sections only where duplication clearly justifies it

---

## Consequences

### Positive

- keeps API contracts clean
- prevents the frontend from inventing business options
- keeps routes thin
- gives auth-backed and oRPC-backed mutations one screen architecture
- keeps most form and table logic in pure TS modules that can be tested without DOM-heavy setup
- gives listing and similar dense domains a workspace model instead of scattered CRUD screens
- leaves room for generated sections without surrendering UX control

### Negative

- adds a deliberate feature-module layer in `apps/web`
- requires discipline to keep descriptors resource-scoped
- means some duplication remains intentionally until patterns are proven
- requires extraction work before the payoff becomes obvious

That tradeoff is acceptable. We prefer controlled repetition over premature meta-frameworks.
