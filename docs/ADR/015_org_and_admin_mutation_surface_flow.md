# ADR-015: Org and Admin Mutation Surface Flow

**Date:** 2026-03-11
**Status:** Accepted
**Authors:** Platform Team
**Related:** [ADR-005: oRPC API Boundary](./005-orpc_api_boundary.md), [ADR-013: Backend-Governed Reference Data and Form Composition](./013_backend_governed_reference_data_and_form_composition.md), [ADR-014: Admin Surface Composition and Resource Descriptors](./014_admin_surface_composition_and_resource_descriptors.md)

---

## Context

We need a low-entropy way to build org-facing and admin-facing mutation interfaces that:

- reuse current building blocks
- stay testable without bloated route components
- avoid inventing a generic admin generator
- make org interaction flows obvious and coherent

The current repo already has the primitives to do this:

- typed oRPC contracts and TanStack Query integration
- Better Auth client for auth-owned organization and membership flows
- design-system primitives in `@my-app/ui`
- TanStack Form available in `apps/web`
- route-level SPA mutation patterns already working in the web app

The main problem is not missing components. It is **surface entropy**:

- route files mix data fetching, field state, mutation calls, invalidation, copy, and layout
- auth-owned mutations and oRPC-owned mutations use different call patterns directly in UI files
- repeated table/filter/pagination patterns exist without a shared surface model
- there is no explicit inventory of current org/admin mutation surfaces

---

## Live Inventory

### Auth-owned org and admin mutation surfaces

These currently call `authClient` directly from the web layer.

#### Organization identity and membership

- `apps/web/src/routes/(app)/org/create/+page.svelte`
  - `authClient.organization.create`
  - `authClient.organization.setActive`
  - plus `client.consent.accept`
- `apps/web/src/components/OrgSwitcher.svelte`
  - `authClient.organization.setActive`
- `apps/web/src/routes/(app)/org/settings/+page.svelte`
  - `authClient.organization.update`
  - `authClient.organization.delete`
- `apps/web/src/routes/(app)/org/team/invite/+page.svelte`
  - `authClient.organization.inviteMember`
- `apps/web/src/routes/(app)/org/team/+page.svelte`
  - `authClient.organization.removeMember`
  - `authClient.organization.updateMemberRole`
  - `authClient.organization.cancelInvitation`
- `apps/web/src/routes/(app)/org/invitations/+page.svelte`
  - `authClient.organization.acceptInvitation`
  - `authClient.organization.rejectInvitation`

#### Admin auth actions

- `apps/web/src/routes/(app)/admin/users/+page.svelte`
  - `authClient.admin.impersonateUser`
- `apps/web/src/components/Header.svelte`
  - `authClient.admin.stopImpersonating`

### Domain-owned oRPC mutation surfaces already in org flows

These already use `createMutation` + oRPC.

- `apps/web/src/routes/(app)/org/listings/new/+page.svelte`
  - `orpc.listing.create`
- `apps/web/src/routes/(app)/org/listings/[id]/+page.svelte`
  - `orpc.listing.update`
- `apps/web/src/components/org/ListingPublicationButton.svelte`
  - `orpc.listing.publish`
  - `orpc.listing.unpublish`

### Domain-owned org surfaces that exist in contracts but do not yet have full org UI flows

These are the next likely operator/admin mutation candidates:

- `listing`
- `pricing`
- `availability`
- `calendar`
- `payments`
- `support`
- `booking` operator flows
- `organization.getOnboardingStatus` as read-side bootstrap for setup flows

### Admin read-heavy surfaces already present

- `apps/web/src/routes/(app)/admin/organizations/+page.svelte`
- `apps/web/src/routes/(app)/admin/organizations/[id]/+page.svelte`
- `apps/web/src/routes/(app)/admin/users/+page.svelte`

These are not mutation-heavy today, but they already show repeated query/table/filter/pagination patterns.

---

## Key Finding

The org/admin surface is **not** currently “mostly oRPC”.

It is split:

- auth-owned organization and membership flows are still Better Auth client calls
- domain-owned operational flows are the part already moving through oRPC

That split is acceptable at the backend boundary, but it must not leak into the screen architecture.

The frontend needs one consistent feature-layer model regardless of whether a mutation is backed by:

- `authClient`
- `client.<contract>.execute`
- `orpc.<contract>.mutationOptions`

---

## Decision

We standardize org/admin mutation surfaces around **resource modules with mutation adapters**.

The screen layer should not care whether the underlying transport is Better Auth or oRPC.

The resource module owns:

- query wiring
- mutation wiring
- input schema
- field descriptors
- invalidation rules
- action availability
- user-facing error normalization

Routes should become thin composition files.

---

## Surface Classes

All org/admin mutation screens should fit one of these classes:

### 1. Action surface

Small one-step or confirm-step actions.

Examples:

- set active organization
- accept or reject invitation
- publish or unpublish listing
- impersonate user
- cancel invitation

Preferred shape:

- action button or menu
- optional confirm dialog
- no standalone page unless necessary

### 2. Resource editor surface

A structured editor for one resource or one setup step.

Examples:

- create organization
- org settings
- invite team member
- listing editor
- future payment provider setup
- future calendar connection editor

Preferred shape:

- resource form component
- schema-backed validation
- shared advanced section for raw metadata/config when needed

### 3. Resource table surface

A filtered, paginated list with row actions.

Examples:

- admin organizations
- admin users
- org members
- org invitations
- future support ticket queue
- future booking operations table

Preferred shape:

- backend-driven filters and row DTOs
- shared table shell
- authored columns or column descriptors

---

## Feature Module Structure

For any non-trivial org/admin surface, create a resource module under:

`apps/web/src/features/<resource>/`

Suggested files:

- `queries.ts`
- `mutations.ts`
- `schema.ts`
- `surface.ts`
- `invalidations.ts`
- `errors.ts`
- `components/*`

### File responsibilities

#### `queries.ts`

- query option builders
- query key helpers if resource-specific
- bootstrap query composition

#### `mutations.ts`

- expose mutation option builders for oRPC-backed resources
- expose adapter functions for auth-backed resources
- normalize transport-specific result and error handling

#### `schema.ts`

- zod input schemas for client-side validation
- optional derived defaults

#### `surface.ts`

- field sections
- field order
- advanced sections
- column definitions
- filter descriptors
- action descriptors

#### `invalidations.ts`

- all query invalidation rules for the resource
- no inline invalidation lists scattered across routes

#### `errors.ts`

- map backend/auth errors into stable UI-facing messages

---

## Mutation Adapter Rule

### Goal

Make auth-backed and oRPC-backed mutations look the same to the screen layer.

### Rule

Never call `authClient.organization.*` or `authClient.admin.*` directly inside route markup once a resource module exists.

Instead:

- wrap auth-client operations in resource mutation adapters
- keep oRPC mutations in resource mutation option builders
- normalize both into one feature-facing API

Example shape:

```ts
type MutationResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };
```

The screen consumes the feature API, not the transport client.

This is the key low-entropy move for the current repo.

---

## Form Defaults

### Default for trivial forms

Use local state only when all of these are true:

- 3 fields or fewer
- single mutation
- no conditional sections
- no backend-governed bootstrap data
- no reusable invalidation logic

### Default for non-trivial SPA forms

Use:

- zod schema in `schema.ts`
- TanStack Form in the feature component
- shadcn primitives for field controls

This is the preferred default once a resource form becomes more than a few fields.

### Formsnap / Superforms

Use when:

- the route is action-based
- server-native validation roundtrip is the right model
- SSR or file-upload/action semantics benefit from SvelteKit actions

Do not force org/admin mutation screens into Formsnap just for consistency theater.

---

## Table Defaults

### Default

Use a shared resource table shell with authored columns or small typed column descriptors.

Each resource module owns:

- row DTO type
- filter input shape
- column config
- row actions

### Not allowed

- generating tables directly from DB schema
- placing filter and pagination logic inline in every route file
- mixing row action mutation logic directly into table markup once a feature module exists

---

## Testing Strategy

We do not currently have frontend component test infrastructure in `apps/web`.

Therefore the testable low-entropy seam should be **pure TypeScript feature modules**.

### Required test targets

For each non-trivial resource module, test:

- `schema.ts`
  - input validation and defaulting
- `errors.ts`
  - transport-to-UI error normalization
- `invalidations.ts`
  - correct query keys invalidated for each mutation class
- `mutations.ts`
  - adapter behavior with mocked authClient or oRPC layer
- `surface.ts`
  - descriptor integrity where there is non-trivial field/column logic

### Keep Playwright for:

- end-to-end happy paths
- auth and redirect behavior
- integration smoke for important operator flows

### Do not rely on:

- route-component logic tests as the primary seam
- giant page-level snapshots

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

These should remain oRPC-first.

### Admin oversight resources

- `features/admin-organizations`
- `features/admin-users`

These are mostly table surfaces with small action surfaces.

---

## First Implementation Sequence

### Wave 1

Extract auth-owned org account flows behind feature mutation adapters:

- org settings
- team invite
- team member actions
- invitation accept/reject
- org switcher

### Wave 2

Introduce one shared app shell for resource tables and one shared app shell for confirm actions.

Apply them to:

- admin organizations
- admin users
- org team members/invitations

### Wave 3

Migrate listing editor and publication controls into a `features/org-listings` module using:

- backend bootstrap data
- TanStack Form for non-trivial form state
- advanced metadata section

### Wave 4

Add the next domain setup flows:

- payment provider setup
- calendar connection
- organization onboarding panel

These should become the reference implementation for richer org operator setup screens.

---

## Consequences

### Positive

- route files become thinner
- auth-backed and oRPC-backed mutations share one screen architecture
- most form and table logic becomes pure TS and therefore testable without DOM-heavy setup
- shared UI shells reduce repetition without creating a generic admin engine

### Negative

- adds a deliberate feature-module layer in `apps/web`
- some one-off screens will need extraction work before the payoff becomes obvious

That is acceptable. The current entropy comes from letting every route be its own architecture.
