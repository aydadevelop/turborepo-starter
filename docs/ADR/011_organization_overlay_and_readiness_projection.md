# ADR-011: Organization Overlay and Readiness Projection

**Date:** 2026-03-11
**Status:** Proposed
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

### What is already emerging in this repo

This repo now has the first real marketplace-overlay read model:

- `organization_onboarding` exists in [`packages/db/src/schema/marketplace.ts`](/Users/d/Documents/Projects/turborepo-alchemy/packages/db/src/schema/marketplace.ts)
- onboarding is exposed through [`packages/api/src/handlers/organization.ts`](/Users/d/Documents/Projects/turborepo-alchemy/packages/api/src/handlers/organization.ts)
- onboarding is recalculated by [`packages/api/src/services/organization-onboarding.ts`](/Users/d/Documents/Projects/turborepo-alchemy/packages/api/src/services/organization-onboarding.ts)

The current recalculation rule is:

- payment changes call recalc from [`packages/api/src/handlers/payments.ts`](/Users/d/Documents/Projects/turborepo-alchemy/packages/api/src/handlers/payments.ts)
- calendar changes call recalc from [`packages/api/src/handlers/calendar.ts`](/Users/d/Documents/Projects/turborepo-alchemy/packages/api/src/handlers/calendar.ts)
- listing publication changes call recalc from [`packages/api/src/handlers/listing.ts`](/Users/d/Documents/Projects/turborepo-alchemy/packages/api/src/handlers/listing.ts)

This works, but it violates the architecture we already accepted:

- `packages/api` is a composition package per ADR-008, not the owner of a marketplace capability
- handlers are supposed to stay thin per ADR-002 and ADR-005
- cross-capability side effects are supposed to flow through events, not handler fan-out

If we do not define a rule now, future marketplace overlay concerns will accumulate in `packages/api` the same way:

- org readiness
- approval queues
- payout readiness
- merchant compliance state
- "can publish" / "can accept bookings" gates

That would recreate a Medusa-shaped architecture at the edges, but keep Mercur-style marketplace state trapped in the transport layer.

---

## Decision

We introduce a dedicated **organization overlay capability**. Its first responsibility is the persisted onboarding/readiness projection.

The target package is:

- `packages/organization`

This package does **not** own Better Auth's organization membership model. Auth membership stays in `packages/auth` and the Better Auth plugin tables. `packages/organization` owns **org-level marketplace state derived from multiple capability packages**.

### 1. `organization_onboarding` becomes a projection owned by the organization package

`organization_onboarding` is a persisted read model, not handler glue and not a free-floating SQL helper.

It represents the current org readiness state derived from:

- payment configuration readiness
- calendar connection readiness
- listing publication readiness

Future org-level readiness flags extend the same overlay package, not `packages/api`.

### 2. Projection updates are event-driven

The organization package updates its projection from domain events emitted by the source capabilities.

The first event set should cover at least:

- payment configuration became valid / invalid / inactive
- calendar connection became active / inactive
- listing publication became active / inactive

Exact event names can be finalized during implementation, but the rule is fixed:

- source capability owns the event
- organization package owns the derived projection
- API handlers do not manually fan out recalculation calls

### 3. Recalculation logic moves out of `packages/api`

`recalculateOrganizationOnboarding(...)` is organization-domain logic and must not remain in `packages/api/src/services`.

After this ADR is implemented:

- `packages/api` handlers call the owning domain service and return typed results
- `packages/organization` registers event subscribers at server bootstrap
- the subscriber recalculates or incrementally updates the projection

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

The package must expose:

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

The repo should add these under `packages/organization` until there is a proven need to split a separate capability package under the ADR-008 constitution rule.

---

## Package Shape

Target structure:

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

### Costs

- requires new domain events in source capabilities
- requires moving the current onboarding logic into a new package
- adds one more capability package to the workspace

Per ADR-008, this package is justified because it satisfies multiple admission criteria:

1. it owns persistent state (`organization_onboarding`)
2. it owns background/subscriber behavior with its own test surface
3. it exposes a public API consumed by apps through `packages/api`

---

## Implementation Plan

1. Create `packages/organization` and move onboarding read-model code there.
2. Add explicit readiness events to `@my-app/events` for payment, calendar, and publication transitions.
3. Emit those events from `packages/payment`, `packages/calendar`, and `packages/catalog`.
4. Register the onboarding projector from `apps/server/src/bootstrap.ts`.
5. Remove direct `recalculateOrganizationOnboarding(...)` calls from API handlers.
6. Keep a repair/backfill function for migrations and tests.
7. Add package-level tests for projector behavior and idempotent recomputation.

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

This repo has already started that layer with `organization_onboarding`, but it is still wired through `packages/api`.

The next ADR should therefore formalize the first overlay capability:

- create `packages/organization`
- move onboarding there
- update it from events
- keep handlers thin

That is the most direct way to turn the current implementation into a coherent Medusa-core plus Mercur-overlay architecture.
