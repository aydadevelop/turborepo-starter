# ADR-014: Admin Surface Composition and Resource Descriptors

**Date:** 2026-03-11
**Status:** Accepted
**Authors:** Platform Team
**Related:** [ADR-005: oRPC API Boundary](./005-orpc_api_boundary.md), [ADR-010: Schema Modernization Constitution](./010_schema_modernization_constitution.md), [ADR-013: Backend-Governed Reference Data and Form Composition](./013_backend_governed_reference_data_and_form_composition.md)

---

## Context

The web app already has several admin and operator surfaces, but they are built ad hoc:

- admin tables inline query, filter, pagination, and empty-state logic in route files
- org and admin forms keep local field state directly in route components
- backend-governed field composition is now partially standardized for listing types, but there is no wider rule for how tables, forms, filters, and generated admin sections should be authored

Current repo truth:

- `apps/web` uses SPA-style `createQuery` and `createMutation` flows for most app surfaces
- `packages/ui` has design-system primitives such as `table`, `select`, `native-select`, `dialog`, `popover`, and basic inputs
- Formsnap / Superforms are not currently installed or used in the app layer
- admin and org surfaces mix app-owned oRPC reads with some auth-owned `authClient` calls
- repeated table/filter/pagination code already exists in routes such as:
  - `apps/web/src/routes/(app)/admin/organizations/+page.svelte`
  - `apps/web/src/routes/(app)/admin/users/+page.svelte`
  - `apps/web/src/routes/(app)/org/listings/+page.svelte`
- repeated local-form patterns already exist in routes and components such as:
  - `apps/web/src/routes/(app)/org/settings/+page.svelte`
  - `apps/web/src/components/org/ListingEditorForm.svelte`

The system needs an organized way to build many admin surfaces without:

- leaking backend rules into the client
- generating UI directly from database schema
- inventing a full no-code form engine
- duplicating filters, columns, field layout rules, and loading/error/empty states in every route

---

## Decision

We will use a **resource descriptor** model for admin and operator surfaces.

The core rule is:

> Backend owns business meaning and capability. Frontend owns layout and interaction through typed resource descriptors.

This yields four distinct layers:

1. **Canonical registries**
   - stable shared datasets such as timezones, currencies, and country codes
   - live in `@my-app/reference-data`
2. **Backend-governed surface data**
   - option sets, defaults, capability flags, bootstrap payloads, server-driven table rows, and filter contracts
   - live behind oRPC contracts and domain handlers
3. **Frontend resource descriptors**
   - field layout, section grouping, column definitions, filter presentation, and action placement
   - live in `apps/web` feature modules
4. **Shared UI shells**
   - reusable wrappers for page states, filter bars, resource tables, section scaffolding, and advanced fields
   - live in `apps/web/src/components` or `packages/ui` depending on whether they are app-specific or design-system-level

We explicitly do **not** adopt a universal schema-to-admin generator in this ADR.

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

Schema and JSON Schema may inform a surface, but they are not the surface definition.

### 2. Backend-governed fields still come from backend read models

Any business-governed option set, capability flag, or typed metadata schema must come from the owning backend domain via oRPC.

Examples:

- listing types
- payment providers
- calendar providers
- org-enabled integrations
- listing-type metadata schema
- bulk-action capabilities

This extends ADR-013.

### 3. Canonical registries live outside `@my-app/api-contract`

Shared registries that are not API contracts belong in `@my-app/reference-data`, not `@my-app/api-contract`.

Examples:

- IANA timezones
- ISO currencies
- ISO countries

`packages/api-contract` remains contract-only.

### 4. Frontend descriptors are resource-specific, not global magic

Each admin surface may define a typed descriptor for:

- fields
- sections
- columns
- filters
- row actions
- bulk actions

But those descriptors belong to the resource module that owns the screen.

Do not create a single global descriptor registry for the entire app.

### 5. Shared shells may render descriptors, but only for a small whitelisted DSL

If we render descriptors, we only support a finite set of field and column kinds.

Allowed field kinds should be small and explicit:

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

Allowed table cell kinds should also be small and explicit:

- `text`
- `badge`
- `date`
- `money`
- `boolean`
- `link`
- `actions`

No arbitrary component names or executable UI definitions from the backend.

### 6. Tables stay server-driven

Admin and operator tables must use backend contracts for:

- row DTO shape
- pagination
- filtering
- sorting
- bulk-action eligibility

The frontend controls rendering, but the backend remains the source of truth for data, filtering, and policy.

### 7. Forms are authored first, rendered second

Default posture:

- use authored resource forms with shared field primitives
- extract repeated sections into shared renderers only after real duplication appears

Do not begin with a generic form generator.

### 8. Formsnap / Superforms are optional, not mandatory

This repo currently uses SPA-style TanStack Query mutation forms for most app surfaces.

Therefore:

- do not force all admin forms into Formsnap / Superforms immediately
- use Formsnap / Superforms when a route is action-based, SSR-heavy, or benefits from server-native validation flow
- keep mutation-driven forms valid when that is the current surface model

For SPA-heavy admin surfaces:

- simple forms may remain local-state driven initially
- once a resource form becomes non-trivial, prefer a consistent client-side form layer such as TanStack Form over bespoke field state in the route

This keeps the client-side form model coherent without forcing every screen through SvelteKit actions.

We optimize for consistent composition, not for adopting a form library everywhere at once.

### 9. Better Auth-owned surfaces are a temporary exception

Where the source of truth still lives behind Better Auth client APIs, the surface may continue using `authClient`.

But the descriptor and shared-shell rules still apply at the frontend layer.

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

### Frontend resource modules

`apps/web/src/features/<resource>/`

Suggested files:

- `queries.ts`
- `mutations.ts`
- `fields.ts`
- `filters.ts`
- `columns.ts`
- `surface.ts`
- `mappers.ts`
- `components/*`

Rules:

- keep a route local until logic is reused or exceeds route readability
- promote to `features/<resource>` when used by two or more routes or when a descriptor becomes non-trivial

### Shared app-level shells

`apps/web/src/components/admin/`

Suggested shared shells:

- `ResourcePageState.svelte`
- `ResourceToolbar.svelte`
- `ResourceTable.svelte`
- `FilterBar.svelte`
- `FormSection.svelte`
- `AdvancedFieldSection.svelte`

These are app shells, not design-system primitives.

### Design-system primitives

`packages/ui`

Use only for low-level reusable UI primitives:

- buttons
- cards
- inputs
- selects
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
   - only after repeated admin tables clearly share the same rendering model

No spreadsheet-style generic grid in this ADR.

---

## Query And Mutation Placement

Rules:

- oRPC query/mutation factories stay in `apps/web/src/lib/orpc.ts`
- stable shared query option builders may live in `apps/web/src/lib/query-options.ts`
- resource-specific query and mutation composition belongs in feature modules, not in every route file

Route files should primarily:

- load the relevant feature module
- pass route params
- render the resource screen

---

## Roadmap

### Phase 1

- Move canonical registries out of `@my-app/api-contract` into `@my-app/reference-data`
- Keep ADR-013 focused on field authority rules
- Add this ADR for admin surface composition

### Phase 2

- Introduce `apps/web/src/features/` for the first real resource modules
- Extract listing editor composition out of route code
- Extract admin users and organizations tables into resource modules

### Phase 3

- Add shared app-level shells for:
  - page state
  - resource toolbar
  - resource table
  - advanced metadata section

### Phase 4

- Introduce descriptor-rendered sections only where duplication justifies it
- Start with one or two resources, not the whole admin panel

### Phase 5

- Add backend bootstrap queries for richer editor surfaces where metadata schema, options, and current values must stay coherent
- Example candidates:
  - listing create/edit editor state
  - payment configuration editor state
  - org integration settings editor state

---

## Consequences

### Positive

- keeps API contracts clean
- prevents the frontend from inventing business options
- avoids a fragile global form engine
- gives admin tables and forms a repeatable structure
- leaves room for generated sections without surrendering control of UX

### Negative

- adds a thin descriptor layer in the frontend
- requires discipline to keep descriptors resource-scoped
- means some duplication remains intentionally until patterns are proven

That tradeoff is acceptable. We prefer controlled repetition over premature meta-frameworks.
