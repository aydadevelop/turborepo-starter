# Architecture Gap Remediation Plan

> Status: Active backbone and implementation order
> Date: 2026-03-12
> Scope: Current repo backbone aligned to season goals, Medusa-style modularity, and the updated gap ADRs

## Purpose

This document is no longer a narrow cleanup audit.

It is the current project backbone:

- what the repo already is
- what layer is still missing
- what must be finished before turning abstractions into owner tools, assistants, and channel products

The goal is not legacy parity.
The goal is to finish the model and abstraction shape so the product can ship faster and extend cleanly.

Primary business direction:

- `boat_rent` is the first fully shaped service family
- `excursions` is the next family and must reuse the same abstraction layer

Related ADRs:

- [ADR-003: Remaining Capability Gaps from `full-stack-cf-app`](./ADR/003_missing-extractions-full-stack-cf-app.md)
- [ADR-005: oRPC API Boundary](./ADR/005-orpc_api_boundary.md)
- [ADR-010: Schema Modernization Constitution](./ADR/010_schema_modernization_constitution.md)
- [ADR-011: Organization Overlay and Readiness Projection](./ADR/011_organization_overlay_and_readiness_projection.md)
- [ADR-014: Admin Surface Composition and Resource Descriptors](./ADR/014_admin_surface_composition_and_resource_descriptors.md)
- [Functionality Matrix](./functionality-matrix.md)

Focused implementation runbooks:

- [Booking Surface Performance Verification](./booking-surface-performance-verification.md)

## Current Repo Shape

The repo already has the platform primitives that matter:

- contract-first transport
  - `packages/api-contract`
  - `packages/api`
- shared infra primitives
  - `packages/db`
  - `packages/events`
  - `packages/workflows`
  - `packages/storage`
  - `packages/queue`
- domain capabilities
  - `packages/catalog`
  - `packages/booking`
  - `packages/pricing`
  - `packages/payment`
  - `packages/calendar`
  - `packages/support`
  - `packages/organization`
- app surfaces
  - `apps/server`
  - `apps/web`
  - hardened browser suite in `packages/e2e-web`

So the repo is not missing a framework.
It is missing the next layer above the framework.

## Current Matrix Review

The live repo now has enough implemented product surface that architecture review should be constrained by the
[Functionality Matrix](./functionality-matrix.md), not by abstract package inventories alone.

The current matrix shows five important truths.

### 1. The backbone is real

The repo now has the key Medusa-like seams in place:

- isolated capability packages
- service-family policy in `packages/catalog`
- marketplace overlay state in `packages/organization`
- account-first calendar state in `packages/calendar`
- tailored operator/customer read models
- workflow-owned publication and booking-lifecycle side effects

So the repo is no longer a generic marketplace skeleton. The main architecture work is now completion, not invention.

### 2. `boat_rent` is the strongest proof of the model

`boat_rent` is currently the only family with a believable end-to-end chain:

- typed family profile
- operator-facing workspace basics
- minimal public truth surface
- composed booking surface with query-budget guardrails
- promotion preview layer
- seeded smoke coverage

That makes it the correct benchmark family for module, workflow, and test decisions.

### 3. The operator OS is still read-heavy

The listing workspace proves the right shape, but most sections beyond basics are still:

- summary views
- read models without full write paths
- or thin action surfaces

The biggest current product/architecture gap is therefore not a missing package.
It is finishing write-complete module surfaces for:

- pricing
- availability
- assets/media
- richer calendar controls

### 4. `excursions` proves the abstraction, but not the product

The family layer now supports a second service family, which is strategically important.

But `excursions` is still shallow in the places that matter commercially:

- booking is still generic rather than schedule-led
- guide identity and trust are not modeled as product surfaces
- validated reviews and richer storytelling are still absent

So `excursions` confirms the abstraction is reusable, while also showing where the current model is still incomplete.

### 5. The overlay is real, but still too listing-centric

`packages/organization` already owns:

- onboarding
- publication summary
- moderation state
- manual overrides

That is a major improvement over handler-local recomputation.
But it has not yet become the broader operator dashboard and blocker hub implied by the product model.

This is the clearest place where Mercur’s marketplace overlay is still only partially adopted:

- explicit seller/operator state exists
- but broader distribution, compliance, and blocker surfaces are still thin

### 6. Real provider lifecycle verification is structurally ready, not operationally routine

The account-first calendar model and the opt-in `calendar-integration` seed profile are correct architectural moves.

What is still missing is a routine, repeatable run that proves live provider behavior for:

- connect
- discover
- attach
- busy-sync
- booking create/update/cancel external event lifecycle

That means the module boundary is now right, but the live verification loop is still immature.

## Targeted Review: Remaining Non-Standardized Seams

The standardized operator pass is complete enough that the remaining gaps are no longer broad UI inconsistency.

The remaining seams are now concentrated in five places.

### 1. Public storefront composition is still route-owned

The operator side has moved strongly toward feature-owned screens and backend-owned read models.

The public storefront has not caught up:

- `apps/web/src/routes/(public)/listings/+page.svelte`
- `apps/web/src/routes/(public)/listings/[id]/+page.svelte`

These routes still own:

- query composition
- filter/search URL state
- view-level loading/error/empty logic
- family-specific rendering branches

The listings route still uses the `history.pushState + popstate` reactivity workaround rather than a proper feature-owned state layer.

This is now the clearest frontend seam that breaks the otherwise consistent surface model.

Medusa-aligned implication:

- public/storefront surfaces should use the same pattern as admin/operator surfaces
- feature modules own screen composition
- routes stay transport/thin
- backend contracts return collection/index state in consistent shapes

### 2. Storefront contracts are behind the new collection contract standard

`listing.list`, `booking.listOrgBookings`, and `support.list*` now use the normalized collection shape.

`storefront.list` does not.

Current shape:

- `packages/api-contract/src/routers/storefront.ts`
  - `input: { type, q, limit, offset }`
  - `output: { items, total }`

This means the most customer-visible list surface is now behind the newer oRPC collection contract conventions.

It should move to:

- `page`
- `search`
- `filter`
- typed `sort`
- `page: { limit, offset, total, hasMore }`

This would remove duplicated frontend pagination/filter conventions and align storefront with the rest of the app.

### 3. Booking and cancellation writes are still service-heavy

The publication path already moved to a workflow-owned shape.

The booking/cancellation core has not caught up yet:

- `packages/booking/src/booking-service.ts`
- `packages/booking/src/cancellation-service.ts`

These services still own multi-step transitions that should become workflow-first:

- reservation/booking creation
- payment intent progression
- schedule update propagation
- cancellation request/application
- refund side effects

The logic is correct, but the orchestration boundary is still too concentrated in services compared to the rest of the backbone.

Medusa-aligned implication:

- CRUD stays in services
- multi-module lifecycle transitions move into workflows
- side effects and compensation become explicit

### 4. The organization listings index still assembles state from multiple queries

The edit workspace is now strongly backend-owned.

The listings index is not yet at the same level:

- `apps/web/src/features/listings/index/query-state.ts`
- `apps/web/src/features/listings/index/OrganizationListingsScreen.svelte`

It still composes:

- overlay summary query
- listing collection query
- multiple overlay action mutations

This is a reasonable intermediate state, but it is now the clearest index-level candidate for a backend-owned combined read model such as:

- `organization.getListingsIndexState`

That would align the listings index with the “workspace state / editor state / overlay summary” pattern already established elsewhere.

### 5. Remaining feature hotspots are large enough to deserve another internal split

The app-level route standardization is now mostly complete, but several feature screens remain dense:

- `apps/web/src/features/org-account/team/OrganizationTeamScreen.svelte`
- `apps/web/src/features/account-settings/LinkedAccountsSection.svelte`
- `apps/web/src/features/org-account/settings/OrganizationSettingsScreen.svelte`
- `apps/web/src/features/org-account/create/OrganizationCreateScreen.svelte`
- `apps/web/src/features/listings/workspace/ListingWorkspaceScreen.svelte`

These are no longer route problems.
They are now feature-internal composition problems:

- query wiring
- local dialog state
- table/action wiring
- embedded form orchestration

The correct next move is not another top-level architecture change.
It is smaller feature-local splits:

- query/adaptor modules
- section/action subcomponents
- mutation status/footer helpers

### 6. Support is still missing an operator list/index surface

Support has a top-level package and a customer ticket detail screen, but it does not yet have a proper operator list/index surface that matches the new operator conventions.

This remains a product and architecture seam:

- package boundary is correct
- operator workflow surface is incomplete

It should follow the same pattern now used by listings, admin, and org-account:

- feature-owned screen
- normalized collection contract
- shared `ResourceTable`
- backend-owned summary/index state where needed

## Review Conclusion

The remaining architecture work is no longer “more modularity” in the abstract.

It is finishing the last places where the repo still diverges from its own chosen patterns:

1. storefront routes -> feature-owned screens + normalized collection contracts
2. booking/cancellation writes -> workflow-owned orchestration
3. listings index -> backend-owned combined index state
4. dense feature screens -> smaller feature-local composition seams
5. support operator index -> complete the operator surface model

## Recommended Next Wave

The next implementation wave should happen in this order:

1. storefront refactor
   - move public list/detail into feature modules
   - normalize `storefront.list`
2. booking workflow refactor
   - move booking/cancellation multi-step paths into workflows
3. listings index state
   - add one backend-owned combined index surface for org listings
4. support operator index
   - complete the support operator surface using the same collection/table pattern

This keeps the next step aligned with both:

- the repo’s current constitutions
- Medusa-style best practice:
  - isolated modules
  - normalized read models
  - workflows for cross-module lifecycle
  - resource-specific screens over shared shells

## Backbone Decision

The project backbone is five layers.

## Medusa and Mercur Reference Model

This backbone is inspired by Medusa and Mercur, but should not copy their runtime literally.

What Medusa contributes:

- strict module isolation
- explicit module links for cross-module associations
- workflows for cross-module business actions
- tailored admin and API extension surfaces on top of module boundaries

Reference:

- [Module Isolation](https://raw.githubusercontent.com/medusajs/medusa/develop/www/apps/book/app/learn/fundamentals/modules/isolation/page.mdx)
- [Module Links](https://raw.githubusercontent.com/medusajs/medusa/develop/www/apps/book/app/learn/fundamentals/module-links/page.mdx)
- [Admin API Reference](https://docs.medusajs.com/api/admin)
- [Retrieve Custom Linked Data Models](https://docs.medusajs.com/learn/fundamentals/api-routes/retrieve-custom-links)
- [Create a Plugin](https://docs.medusajs.com/learn/fundamentals/plugins/create)

What Mercur contributes:

- a marketplace overlay on top of Medusa primitives
- explicit onboarding state for sellers
- request/review workflows for marketplace changes
- dedicated link definitions between marketplace actors and commerce entities

Reference:

- [seller onboarding model](https://raw.githubusercontent.com/mercurjs/mercur/main/packages/modules/b2c-core/src/modules/seller/models/onboarding.ts)
- [seller-product link](https://github.com/mercurjs/mercur/blob/main/packages/modules/b2c-core/src/links/seller-product.ts)
- [create-product-request workflow](https://raw.githubusercontent.com/mercurjs/mercur/main/packages/modules/requests/src/workflows/requests/workflows/create-product-request.ts)

What we should copy:

- Medusa’s split between isolated modules, links, workflows, and tailored reads
- Mercur’s explicit marketplace overlay and request/onboarding state

What we should not copy:

- Medusa’s full runtime/container complexity
- Mercur’s exact seller/product domain model
- plugin-grade extension machinery before the backbone is stable

### 1. Platform Core

This layer should stay generic and reusable.

Owns:

- contracts and handlers
- schema, migrations, repositories, shared DB utilities
- events and workflows
- provider registries and adapters
- auth, env, queue, storage

Packages:

- `packages/api-contract`
- `packages/api`
- `packages/db`
- `packages/events`
- `packages/workflows`
- `packages/auth`
- `packages/storage`
- `packages/queue`
- `packages/env`

This layer is mostly present already.

### 2. Shared Commerce Core

This layer owns the common travel-commerce primitives that should work across families.

Owns:

- listings
- publications
- pricing
- availability
- bookings
- payments
- calendar connections
- support

Packages:

- `packages/catalog`
- `packages/pricing`
- `packages/booking`
- `packages/payment`
- `packages/calendar`
- `packages/support`

This layer exists, but some surfaces are still too generic or too table-shaped.

### 3. Marketplace Overlay

This layer owns cross-capability state and gating above the shared core.

Owns:

- organization readiness
- publication readiness
- moderation readiness
- distribution readiness
- operator blockers
- manual override state

Package:

- `packages/organization`

This layer has started with onboarding and is the first real missing Medusa-like abstraction seam.

### 4. Service-Family Layer

This layer defines the operating model for each family.

Owns:

- service-family policy
- category variants under a family
- family-specific editor defaults
- family-specific customer read-model shape
- family-specific readiness rules

Current target families:

- `boat_rent`
- `excursions`

Important rule:

- service family is not the same thing as category
- service family defines workflow and operating semantics
- categories and listing types sit under that family

This layer is only partially started today via `serviceFamily` on `listing_type_config`.

How Medusa and Mercur handle the equivalent:

- Medusa keeps the shared commerce core isolated and attaches cross-module state through links and workflows instead of direct coupling
- Mercur layers marketplace-specific behavior into dedicated modules instead of stuffing that behavior into the base commerce records

Adoption rule:

- keep listing, booking, pricing, payment, and calendar in the shared commerce core
- make service-family policy explicit above that core
- attach family-specific behavior through explicit models and read/editor payloads
- do not reduce `serviceFamily` to a taxonomy-only field

### 5. Surface Composition Layer

This layer turns the model into usable product surfaces.

Owns:

- operator workspaces
- minimal customer truth surfaces
- admin intervention surfaces
- frontend resource descriptors
- backend-owned editor/bootstrap/read state

Apps:

- `apps/web`
- `packages/e2e-web` as hardened source of truth for solidified flows

This is where the product still feels too generic.

## What Is Actually Missing

The real architecture gaps are now:

### 1. Service-family model completion

Started:

- `listing_type_config.serviceFamily`

Still missing:

- explicit family-aware editor/bootstrap state
- category-variant model under each family
- family-specific defaults and rules
- family-specific customer presentation logic

Medusa/Mercur reference:

- [Module Isolation](https://raw.githubusercontent.com/medusajs/medusa/develop/www/apps/book/app/learn/fundamentals/modules/isolation/page.mdx)
- [Module Links](https://raw.githubusercontent.com/medusajs/medusa/develop/www/apps/book/app/learn/fundamentals/module-links/page.mdx)
- [seller-product link](https://github.com/mercurjs/mercur/blob/main/packages/modules/b2c-core/src/links/seller-product.ts)

Adoption rule:

- copy the explicit extension seam
- do not copy Medusa’s exact runtime or Mercur’s exact seller/product shape
- model `serviceFamily` as the operating model, with categories and listing types beneath it

### 2. Overlay expansion beyond onboarding

Started:

- `packages/organization`
- persisted onboarding projection
- event-driven readiness updates

Still missing:

- publication and moderation overlay state
- distribution/channel readiness
- operator blocker aggregates
- manual override notes and state

Medusa/Mercur reference:

- [seller onboarding model](https://raw.githubusercontent.com/mercurjs/mercur/main/packages/modules/b2c-core/src/modules/seller/models/onboarding.ts)
- [create-product-request workflow](https://raw.githubusercontent.com/mercurjs/mercur/main/packages/modules/requests/src/workflows/requests/workflows/create-product-request.ts)

Adoption rule:

- keep `packages/organization` as the first marketplace overlay package
- extend it with publication, moderation, distribution, and blocker state
- do not spread those concerns back into `packages/api` or generic metadata

### 3. Module-owned read models

Still missing:

- operator workspace payloads
- customer truth payloads
- backend-composed editor/bootstrap state for listing workspaces

Without these, frontend screens remain generic and route-heavy.

Medusa/Mercur reference:

- [Admin API Reference](https://docs.medusajs.com/api/admin)
- [Retrieve Custom Linked Data Models](https://docs.medusajs.com/learn/fundamentals/api-routes/retrieve-custom-links)

Adoption rule:

- backend should own operator workspace state and customer truth state
- frontend should consume tailored payloads rather than composing raw rows
- do not build a universal schema-driven admin generator to get there

### 4. Operator OS completion

Still missing in a coherent workspace form:

- listing basics
- pricing profiles and rules
- discounts
- amenities
- assets
- calendar connections
- availability rules, exceptions, blocks
- locations and moderation status
- publish/readiness state

Medusa/Mercur reference:

- [Create a Plugin](https://docs.medusajs.com/learn/fundamentals/plugins/create)
- [Mercur repository overview](https://github.com/mercurjs/mercur)

Adoption rule:

- build one coherent listing workspace instead of disconnected forms
- use backend-owned workspace state plus frontend resource modules
- keep manual override/admin intervention as part of the operator system

Matrix refinement:

- the workspace shell is now correct
- `boat_rent` basics are real
- pricing, availability, assets, and calendar are still more read-oriented than write-complete
- the next work should deepen the existing workspace, not create parallel admin surfaces

### 5. Minimal customer truth surface

Still missing as a deliberate product layer:

- customer pages that let you inspect whether admin settings actually work
- family-aware trust and booking presentation
- enough surface to validate timing, slots, codes, pricing, and content before season

Medusa/Mercur reference:

- [Admin API Reference](https://docs.medusajs.com/api/admin)
- [Mercur repository overview](https://github.com/mercurjs/mercur)

Adoption rule:

- keep customer truth surfaces minimal at first
- but make them real enough that pricing, availability, and trust settings are validated through production-like reads

Matrix refinement:

- `boat_rent` now has a real minimal truth surface
- `excursions` has a family-aware detail surface, but still lacks the trust and schedule semantics that would make it a true customer product surface
- the next customer-side architecture work should therefore split into:
  - `boat_rent`: reservation/payment/completion depth
  - `excursions`: trust/guide/review/schedule depth

### 6. Shared scoped-access helper standardization

Still missing:

- moving repeated ownership/scoping helpers below the API layer
- standardizing org-owned row checks across domain packages

This is not the top product gap, but it is a real backbone cleanup.

Medusa/Mercur reference:

- [Module Isolation](https://raw.githubusercontent.com/medusajs/medusa/develop/www/apps/book/app/learn/fundamentals/modules/isolation/page.mdx)

Adoption rule:

- keep auth and permission checks in middleware and boundary layers
- keep org-owned resource access in lower-layer shared helpers
- avoid route-local or handler-local ownership drift

### 7. Listing asset write path

Still missing:

- upload transport
- asset management flow
- primary asset management
- end-to-end operator UI

The storage abstraction already exists. The product write path does not.

Medusa/Mercur reference:

- [Admin API Reference](https://docs.medusajs.com/api/admin)

Adoption rule:

- keep the current storage provider abstraction
- add the missing upload and asset-management write path on top
- do not build a second media/storage architecture

## Locked Architectural Rules

These rules should now be treated as fixed.

### Rule 1: Do not add new generic framework packages unless they remove immediate duplication

Do not build:

- `packages/admin-zones`
- `packages/field-registry`
- a generic form engine
- a generic admin generator

The repo already has enough primitives.

### Rule 2: Generate tools, not flows

oRPC surfaces can generate assistant tools later.
Flows still need explicit context and curated boundaries.

### Rule 3: Backend governs business options and editor state

Frontend should not invent business-valid fields or options.
It should consume:

- typed reference data
- backend-owned read models
- editor/bootstrap payloads

### Rule 4: The overlay package owns cross-capability marketplace state

Cross-capability readiness and gating should not drift back into transport handlers or generic metadata blobs.

### Rule 5: Service-family semantics belong above the shared commerce core

Do not collapse `boat_rent` and `excursions` differences into:

- route-only conditionals
- untyped metadata
- taxonomy-only category fields

### Rule 6: Frontend routes stay thin

Use ADR-014 style feature modules and resource descriptors.
Route files should not become orchestration hubs again.

## Implementation Order

### Phase 1: Finish model seams

Goal:

- finish the missing abstraction seams before broader productization

Work:

- extend service-family model beyond a single field
- add category variants under families
- expand `packages/organization` beyond onboarding
- define module-owned editor/bootstrap/read models

Acceptance:

- service-family-aware listing/editor state exists
- overlay package owns more than onboarding
- backend has explicit operator/customer read models instead of leaving the frontend to compose raw tables

Medusa/Mercur alignment:

- this phase finishes the missing “links + overlay + tailored reads” layer those systems rely on

### Phase 2: Build the operator OS

Goal:

- turn the org panel into the real 90 percent operating surface

Work:

- move listing subresources into one coherent workspace shape
- add assets, pricing, availability, calendar, location, publish/readiness surfaces
- add admin/manual intervention seams for the 10 percent

Acceptance:

- operator can manage the real season workflow without code changes for common cases

Medusa/Mercur alignment:

- this is the move from backend primitives to the actual vendor/admin operating surface

### Phase 3: Build the minimal customer truth surface

Goal:

- validate the admin model from the customer side

Work:

- add minimal family-aware customer listing/detail/booking pages
- surface the real admin-configured values through customer flows
- use this as the truth test for timing, slots, pricing, and trust expression

Acceptance:

- you can verify operator configuration through a real customer flow

Medusa/Mercur alignment:

- this is storefront-side validation of the same backend model, not a separate ad hoc path

### Phase 4: Finish backbone cleanups

Goal:

- remove the remaining technical friction that slows product expansion

Work:

- shared scoped-access helpers in `packages/db`
- listing asset upload and management completion
- remaining feature-module migration in `apps/web`

Acceptance:

- repeated ownership checks are standardized
- asset management is real, not read-only
- route files remain thin

Medusa/Mercur alignment:

- this is long-term module health work, not the primary product abstraction gap

### Phase 5: Convert abstractions into business surfaces

Goal:

- use the finished backbone for owner and channel models

Work:

- assistant flow packs with real flow context
- owner-controlled widgets and microsites
- grouped landing pages and demand surfaces
- category/family expansion on top of the same model

Acceptance:

- business experiments are built on stable abstractions instead of unfinished internals

Medusa/Mercur alignment:

- this is where we stop copying architecture patterns and start using them for our own owner and channel models

## Backbone Success Criteria

The backbone is complete when:

- `boat_rent` is fully expressed as a service family on top of the shared core
- `excursions` can attach without reworking the same cross-capability model
- `packages/organization` owns real overlay state, not only onboarding
- operator and customer surfaces consume backend-owned read models
- org/admin screens follow the ADR-014 composition model
- storage, ownership, and asset paths no longer force ad hoc workarounds

## Non-Goals

This plan does not mean:

- copying all of Medusa literally
- recreating legacy boat-only flows line by line
- building a plugin runtime
- building a generic low-code admin framework
- turning every business idea into code before the backbone is finished

The point is to finish the shape of the system so the next business layers are easier to ship, not harder.
