# ADR-011: Organization Overlay and Readiness Projection

**Date:** 2026-03-11
**Status:** Active
**Authors:** Platform Team
**Related:** [ADR-002: Architecture Patterns](./002_architecture-patterns.md), [ADR-004: Event Bus Migration & Related Wiring](./004_event-bus-migration.md), [ADR-005: oRPC API Boundary](./005-orpc_api_boundary.md), [ADR-008: Workspace Consolidation Constitution](./008_workspace_consolidation_constitution.md)

---

## Context

The repo has already adopted the Medusa-style primitives that matter for this stack:

- domain packages
- workflow-based orchestration
- provider registries for external integrations
- event-driven side effects
- thin transport boundaries

That direction is reflected in the accepted ADR set and in the local skills (`domain-packages`, `workflows`, `provider-adapters`, `domain-events`).

The next architectural gap is not another primitive. It is the **marketplace overlay** that sits on top of those primitives.

### What Medusa contributes

Medusa provides the reusable framework layer:

- modules
- workflows
- link modules
- admin extension surfaces such as widgets and custom fields

That is the "platform core" pattern we already copied into this repo via `packages/events`, `packages/workflows`, provider registries, and the package constitution.

### What Mercur contributes

Mercur shows what happens after the primitives exist and a marketplace product is layered on top of them.

Its repo structure adds explicit marketplace modules such as:

- seller
- payout
- configuration
- commission
- requests
- reviews

It also models seller onboarding as a recomputed cross-capability state and uses workflows plus link tables to connect marketplace actors to core commerce entities.

### What is already implemented in this repo

This repo now has the first real marketplace-overlay capability:

- `organization_onboarding` persists as a DB projection row
- the overlay package now exists at [`packages/organization`](/Users/d/Documents/Projects/turborepo-alchemy/packages/organization)
- onboarding reads are exposed through [`packages/api/src/handlers/organization.ts`](/Users/d/Documents/Projects/turborepo-alchemy/packages/api/src/handlers/organization.ts)
- the projector is registered from [`apps/server/src/bootstrap.ts`](/Users/d/Documents/Projects/turborepo-alchemy/apps/server/src/bootstrap.ts)

The first event-driven projection rule is also implemented:

- payment emits readiness events from [`packages/payment/src/payment-service.ts`](/Users/d/Documents/Projects/turborepo-alchemy/packages/payment/src/payment-service.ts)
- calendar emits readiness events from [`packages/calendar/src/use-cases.ts`](/Users/d/Documents/Projects/turborepo-alchemy/packages/calendar/src/use-cases.ts)
- listing publication emits readiness events from [`packages/catalog/src/publication-service.ts`](/Users/d/Documents/Projects/turborepo-alchemy/packages/catalog/src/publication-service.ts)
- the organization overlay projector consumes those events and updates the persisted projection

This ADR therefore no longer describes a missing refactor inside `packages/api`. It defines the overlay rule that has now started shipping and should be extended instead of bypassed.

The newer discovery and season documents make the gap broader than onboarding:

- [Season 2026 Target State](../season-2026-target-state.md)
- [Season 2026 Product Builder Brief](../season-2026-product-builder-brief.md)
- [Boat Rent Model Testing Matrix](../boat-rent-model-testing-matrix.md)
- [Product Discovery Playbook](../product-discovery-playbook.md)

They all point to the same requirement:

> before turning the platform into owner tools, assistant flows, or channel products, finish the model and abstraction layer that makes those surfaces composable.

So this ADR should be read as the first marketplace-overlay constitution, not as a narrow one-table onboarding fix.

In current product terms, that means:

- make `boat_rent` the first fully shaped service-family consumer of the overlay
- keep the overlay generic enough that `excursions` can attach next without reworking the same cross-capability state model again

---

## Decision

We introduce a dedicated **organization overlay capability**. Its first shipped responsibility is the persisted onboarding/readiness projection, but its architectural role is broader:

- own cross-capability org and marketplace overlay state
- publish operator-facing and customer-facing overlay read models
- provide the first explicit layer where service-family-aware policy can attach above shared commerce primitives

The target package is:

- `packages/organization`

This package does **not** own Better Auth's organization membership model. Auth membership stays in `packages/auth` and the Better Auth plugin tables. `packages/organization` owns **org-level marketplace state derived from multiple capability packages**.

This package is the beginning of the overlay layer that Medusa-style architecture needs in this repo:

- the shared core stays in domain packages such as booking, pricing, catalog, payment, calendar, support
- the overlay layer owns readiness, publication, moderation, distribution, and operator-facing aggregate state
- service-family and variant policy may still live in the owning domain package initially, but the overlay package owns the cross-capability projection and gating state built from them

### 1. `organization_onboarding` is a projection owned by the organization package

`organization_onboarding` is a persisted read model, not handler glue and not a free-floating SQL helper.

It represents the current org readiness state derived from:

- payment configuration readiness
- calendar connection readiness
- listing publication readiness

Future org-level readiness flags extend the same overlay package, not `packages/api`.

The same rule applies to the next overlay states that are already implied by the product goals:

- publication readiness
- moderation readiness
- distribution/channel readiness
- operator dashboard blockers
- manual override state for the 10 percent that should not require code changes

### 2. Projection updates are event-driven

The organization package updates its projection from domain events emitted by the source capabilities.

The first shipped event set covers:

- payment configuration readiness transitions
- calendar connection readiness transitions
- listing publication readiness transitions

The current event names are:

- `payment:organization-config-readiness-changed`
- `calendar:organization-connection-readiness-changed`
- `listing:organization-publication-readiness-changed`

The rule is fixed:

- source capability owns the event
- organization package owns the derived projection
- API handlers do not manually fan out recalculation calls

### 3. Recalculation logic does not live in `packages/api`

`recalculateOrganizationOnboarding(...)` is organization-domain logic and no longer belongs in `packages/api/src/services`.

After this first wave:

- `packages/api` handlers call the owning domain service and return typed results
- `packages/organization` registers its projector at server bootstrap
- source capabilities emit readiness events instead of handlers manually triggering recalc

This restores the accepted layering:

`packages/api-contract` -> `packages/api` handler -> domain package service/workflow -> repository/provider`

with the organization overlay acting as a normal capability package that consumes events.

### 4. Read models stay persisted and repairable

The projection remains stored in the database instead of being recomputed on every read.

That gives us:

- fast reads for dashboard and gating checks
- an auditable current state row per organization
- deterministic backfills after migrations
- a repair path when new readiness criteria are introduced

The package now exposes:

- `getOrganizationOnboardingStatus(organizationId)`
- `recalculateOrganizationOnboarding(organizationId)` as an internal repair/backfill primitive

The public mutation path is event-driven. Direct recalc remains available for:

- migrations
- one-off repair scripts
- test setup

### 5. This is the pattern for future marketplace overlay state

This ADR is intentionally broader than a single onboarding endpoint.

It establishes the rule that **cross-capability marketplace state belongs in an overlay capability package, not in transport packages**.

Examples that should follow this pattern later:

- publication approval readiness
- payout readiness
- merchant compliance state
- request queue summaries
- operator dashboard counters
- service-family-specific readiness gates surfaced through a shared overlay shape
- channel/distribution readiness for widgets, microsites, and demand-generation surfaces

### 6. This package is overlay-first, not membership-first

The organization package should not become a dumping ground for "anything org-related".

It owns:

- cross-capability overlay state
- derived operator/customer projections
- gating and readiness checks
- repair/backfill routines for those projections

It does not own:

- Better Auth membership and invitations
- raw listing configuration
- raw pricing rules
- raw booking lifecycle
- raw payment provider logic

Those stay in their source modules. The overlay package composes their outcomes.

### 7. This is the first step toward module-owned product surfaces

The purpose of this ADR is not only to move a recalculation function out of `packages/api`.

It is to establish the first real place where the repo can attach the missing Medusa-like abstraction layer:

- module-owned operator read models
- module-owned customer truth surfaces
- cross-capability gating
- service-family-aware state without collapsing everything into generic metadata

This ADR does not finish service-family policy by itself, but it creates the overlay seam those policies need.

The repo should add these under `packages/organization` until there is a proven need to split a separate capability package under the ADR-008 constitution rule.

---

## Current Package Shape

Current structure:

```text
packages/organization/
├── package.json
├── tsconfig.json
└── src/
    ├── onboarding/
    │   ├── projector.ts
    │   ├── service.ts
    │   ├── repository.ts
    │   └── __tests__/
    ├── index.ts
    └── types.ts
```

Responsibilities:

- `repository.ts` — read/write projection rows only
- `projector.ts` — subscribe to domain events and trigger recompute
- `service.ts` — read-model queries used by handlers or workflows
- `index.ts` — exports registration and read APIs

`packages/api-contract/src/routers/organization.ts` remains the contract boundary.
`packages/api/src/handlers/organization.ts` remains the transport adapter.

---

## Consequences

### Positive

- aligns the codebase with ADR-002, ADR-005, and ADR-008 instead of leaving a known exception in place
- gives the repo its first explicit marketplace overlay capability, which is the part Mercur adds on top of Medusa primitives
- removes manual recalc fan-out from handlers
- creates a reusable pattern for future org-level projections
- creates the first clean seam for service-family-aware gating and operator OS state

### Costs

- requires new domain events in source capabilities
- adds one more capability package to the workspace
- requires discipline so the package stays an overlay package instead of absorbing source-domain CRUD
- adds one more place where composition bootstrapping must stay intentional

Per ADR-008, this package is justified because it satisfies multiple admission criteria:

1. it owns persistent state (`organization_onboarding`)
2. it owns background/subscriber behavior with its own test surface
3. it exposes a public API consumed by apps through `packages/api`

---

## Implementation Status

Implemented in the first wave:

1. `packages/organization` was created and onboarding read-model code moved there.
2. Explicit readiness events were added to `@my-app/events` for payment, calendar, and publication transitions.
3. Those events are emitted from `packages/payment`, `packages/calendar`, and `packages/catalog`.
4. The onboarding projector is registered from `apps/server/src/bootstrap.ts`.
5. Direct `recalculateOrganizationOnboarding(...)` fan-out was removed from API handlers.
6. Package-level tests were added for onboarding reads and recomputation behavior.

Next wave:

1. Extend the overlay beyond onboarding into publication and moderation state.
2. Add operator-facing blocker/readiness aggregates needed by the org panel.
3. Add manual override notes/state for the real 10 percent that should not require code changes.
4. Start attaching service-family-aware overlay gates above shared commerce primitives.

---

## Alternatives Considered

### A. Keep onboarding in `packages/api/src/services`

Rejected.

This keeps a cross-capability marketplace concern in a composition package and normalizes handler fan-out as the update mechanism.

### B. Recompute onboarding on every read with ad-hoc SQL

Rejected.

This avoids projection ownership but throws away the emerging read-model pattern and makes future readiness checks harder to cache, audit, and extend.

### C. Create a broad `packages/marketplace` package now

Rejected for now.

The repo does not yet have enough overlay concerns implemented to justify a very broad marketplace package. `packages/organization` is the smallest package that cleanly owns the current problem while leaving room for future expansion.

---

## Summary

Medusa gave this repo the right primitives. Mercur shows the next layer: marketplace overlay modules that own cross-capability operator state.

This repo has already started that layer and shipped the first overlay capability:

- `packages/organization` exists
- onboarding moved there
- updates flow through domain events
- handlers stay thin

The remaining work is not to re-argue the package. It is to keep extending the overlay pattern into the next operator-facing states instead of letting them leak back into transport or generic metadata.
