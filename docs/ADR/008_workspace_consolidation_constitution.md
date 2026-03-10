# ADR-008: Workspace Consolidation Constitution

**Date:** 2026-03-10
**Status:** Proposed
**Authors:** Platform Team
**Related:** [ADR-001: Legacy Extraction Plan](./001_legacy-extraction.md), [ADR-002: Architecture Patterns](./002_architecture-patterns.md), [ADR-007: Schema Hardening and Modularization](./007_schema_hardening_and_modularization.md)

---

## Context

The repo already adopted the right Medusa-inspired ideas:

- domain packages
- workflow-based orchestration
- provider registries for external integrations
- event-driven side effects
- thin transport boundaries

Those ideas are reflected in the local skills:

- `.agents/skills/domain-packages/SKILL.md`
- `.agents/skills/workflows/SKILL.md`
- `.agents/skills/provider-adapters/SKILL.md`
- `.agents/skills/domain-events/SKILL.md`

The problem is not the direction. The problem is that the repo extracted boundaries faster than it defined a reusable rule for **when something deserves a package at all**.

This produced a workspace that is more fragmented than Medusa's actual modularity model:

- `packages/availability` is a thin scheduling slice used mainly by `packages/booking`
- `packages/disputes` is mostly booking cancellation and refund orchestration
- `packages/support` is thin CRUD plus API-specific access flow
- `packages/api` still contains handler-level business fallback and some direct DB logic
- schema ownership is still centralized in `packages/db`, so some workspace boundaries do not yet correspond to strong persistence boundaries

Medusa avoids this by using a smaller number of heavier modules plus a strong shared core. We need the same discipline here.

---

## Decision

We will use a **package constitution** for all future extraction and for the current consolidation pass.

The constitution has two purposes:

1. Reduce package sprawl by merging thin packages back into capability modules.
2. Preserve the Medusa-style modularity that actually matters: clear ownership, thin transport, evented side effects, workflow orchestration, and provider isolation.

The target rule is:

**Packages are for capabilities with an independent lifecycle. Folders are for subdomains.**

---

## 1. Medusa Interpretation For This Repo

What we copy from Medusa:

- Large capability modules, not micro-packages
- One shared platform layer for orchestration, events, infra, and conventions
- Provider interfaces inside the owning capability
- Cross-capability side effects via workflows and event subscribers
- Thin transport adapters

What we do **not** copy blindly:

- Runtime-grade module isolation for every concern
- Link-table-first decoupling for domains that already share strong transactional invariants
- A new top-level package for each extracted legacy service

For this repo, Medusa-style modularity means:

- `booking` can contain `availability`, `cancellations`, `disputes`, and `support-facing booking flows` as internal subdomains
- `calendar` stays separate because it is an external integration capability
- `payment` stays separate because it owns provider integration, webhook reconciliation, and money movement concerns
- `events`, `workflows`, `db`, `queue`, `auth`, `env` stay platform-level

### Mercur takeaways

Mercur is useful because it shows what happens when Medusa-style modularity is pushed into a real marketplace product.

The most transferable ideas are:

- a small shared framework layer for module IDs, link constants, shared types, and common workflow helpers
- explicit marketplace overlay modules such as seller, commission, requests, reviews, and payout
- approval/request workflows for seller and product changes instead of direct mutation everywhere
- explicit onboarding state models that can be recalculated as capabilities become configured
- targeted link tables between marketplace actors and core commerce entities instead of stuffing every relationship into one giant table

What we should take from Mercur:

- listing publication and seller-facing catalog changes can move through explicit request/approval workflows
- organization onboarding can be modeled as a recomputed completeness state across payment, calendar, and listing setup
- commission rule selection should be explicit and priority-driven, even if it remains inside `pricing`
- cross-capability attachments should prefer join tables where ownership is optional or many-to-many

What we should not copy directly:

- Medusa plugin/container mechanics
- remote-link runtime abstractions
- Medusa workflow DSL primitives
- multi-vendor cart splitting and split-payment orchestration unless the product actually needs that level of marketplace checkout complexity

---

## 2. Skill Audit

### 2.1 `domain-packages`

This skill represents the right idea.

It correctly defines the target flow as:

`packages/api-contract` -> `packages/api` handler -> domain package service/workflow -> repository

It also correctly says handlers should stay thin and repositories should stay query-only.

What it misses:

- no explicit rule for when **not** to create a package
- no distinction between a domain capability and an internal subdomain
- no governance rule for package count, package size, or extraction threshold

### 2.2 `workflows`

This skill represents the idea well.

It correctly adapts Medusa workflows to this stack instead of copying Medusa's DSL.

Current repo state mostly matches this skill:

- `packages/workflows` exists
- `packages/disputes` already uses `createStep` and `createWorkflow`

What is missing is not the workflow package itself, but broader workflow adoption. Important booking flows still happen in service and handler code instead of a workflow boundary.

### 2.3 `provider-adapters`

This skill represents the idea well, but the implementation is only partially complete.

What is already real:

- `packages/calendar` has an adapter registry
- `packages/payment` has a provider registry

What is still inconsistent:

- payment webhook adapter glue still lives under `packages/api/src/payments/webhooks`
- runtime startup registers calendar integrations, but not payment providers

That means the provider pattern exists, but module ownership is not fully consolidated yet.

### 2.4 `domain-events`

This skill represents the idea well, but the status text is outdated.

What is already real:

- `packages/events` exists
- `apps/server` registers notification and calendar pushers at startup

What still drifts from the skill:

- some event emission still happens in handlers instead of domain services/workflows
- the skill still describes `packages/events` as target-state even though it now exists

### 2.5 Overall conclusion

The skills do represent the intended Medusa-inspired architecture.

What they miss is the **constitution layer**:

- package admission criteria
- merge-back criteria
- ownership rules for thin slices
- rules for when to keep logic as an internal folder instead of a workspace package

That missing constitution is the main reason the architecture drifted.

---

## 3. Package Constitution

### 3.1 Package classes

Every top-level workspace package must be one of these:

1. **Platform package**
2. **Capability package**
3. **Composition package**

#### Platform packages

Shared technical primitives used by many capabilities.

Current examples:

- `packages/db`
- `packages/auth`
- `packages/env`
- `packages/queue`
- `packages/events`
- `packages/workflows`
- `packages/config`
- `packages/vitest-config`
- `packages/tailwind-config`

#### Capability packages

Business or product capabilities with a meaningful lifecycle of their own.

Current examples to keep:

- `packages/booking`
- `packages/catalog`
- `packages/pricing`
- `packages/payment`
- `packages/calendar`
- `packages/notifications`
- `packages/assistant`

#### Composition packages

Transport, UI, or app assembly layers.

Current examples:

- `packages/api-contract`
- `packages/api`
- `packages/ui`
- `packages/ai-chat`
- `apps/server`
- `apps/web`
- `apps/assistant`
- `apps/notifications`

### 3.2 Admission rule for new packages

A new top-level package must satisfy at least **two** of the following:

1. It owns persistent state or a coherent part of the write model.
2. It owns an external integration boundary.
3. It exposes a public API consumed by multiple packages or apps.
4. It owns workflows, subscribers, or background processing with an independent test surface.
5. It needs to evolve on a different cadence from its nearest parent capability.

If it satisfies fewer than two, it must stay as:

- a folder inside the owning package, or
- a platform helper inside an existing platform package

### 3.3 Folder-first rule

New subdomains start as folders inside an existing capability package unless they already meet the admission rule.

Examples:

- `booking/src/availability`
- `booking/src/cancellation`
- `booking/src/disputes`
- `booking/src/support`
- `catalog/src/storefront`
- `payment/src/webhooks`

### 3.4 Handler rule

`packages/api` handlers are transport adapters, not mini-services.

Handlers may:

- parse and normalize transport input
- build context
- call a domain function or workflow
- map domain errors to oRPC errors
- format output

Handlers may not:

- emit domain events directly
- contain compensation logic
- query the DB unless the logic is intentionally app-local and not worth a domain package

### 3.5 Service and workflow rule

Capability packages own business state transitions.

- single mutation or simple read/write flow -> service
- multi-step operation with rollback or external effects -> workflow
- event emission happens in the domain service/workflow, not in the handler

### 3.6 Provider rule

Provider interfaces, registries, fake adapters, and provider-specific webhooks belong to the owning capability package.

Examples:

- `payment` owns payment providers and payment webhook reconciliation
- `calendar` owns calendar adapters and booking lifecycle sync registration

### 3.7 Read-model rule

Not every read model deserves a package.

Simple app-specific reads stay in:

- `packages/api`
- the owning capability package

Only extract a read-side package when it becomes:

- shared across multiple apps, or
- independently complex enough to justify its own lifecycle

### 3.8 Merge-back rule

A package should be merged into its parent capability when it has any two of these signals:

1. It is consumed by only one other capability or only by `packages/api`.
2. It has no external integration boundary.
3. It has no independent workflow/event surface.
4. Its codebase is mostly CRUD and type definitions.
5. Its schema and invariants are already governed by another capability.

---

## 4. Concrete Consolidation Map

### 4.1 Keep as top-level packages

#### Platform

- `packages/db`
- `packages/auth`
- `packages/env`
- `packages/queue`
- `packages/events`
- `packages/workflows`
- `packages/config`
- `packages/vitest-config`
- `packages/tailwind-config`

#### Capability

- `packages/booking`
- `packages/catalog`
- `packages/pricing`
- `packages/payment`
- `packages/calendar`
- `packages/notifications`
- `packages/assistant`

#### Composition

- `packages/api-contract`
- `packages/api`
- `packages/ui`
- `packages/ai-chat`
- `packages/proxy` only if still needed for local webhook/dev tunnel workflows

### 4.2 Merge into `packages/booking`

#### `packages/availability` -> `packages/booking/src/availability`

Reason:

- used mainly by `booking`
- no external integration boundary
- no independent event/workflow surface
- represents booking/scheduling invariants, not a platform capability

Suggested internal layout:

```text
packages/booking/src/
  availability/
    service.ts
    policy.ts
    overlap.ts
    types.ts
```

#### `packages/disputes` -> `packages/booking/src/cancellation` and `packages/booking/src/disputes`

Reason:

- current scope is mostly booking cancellation, refund, and dispute resolution
- depends directly on `booking`, `payment`, `events`, and `workflows`
- does not yet justify a standalone operator/case-management module

Keep as a folder until there is a real operations lifecycle:

- SLA tracking
- evidence review queues
- multi-actor resolution policies
- dispute reporting and analytics
- channel-specific escalation

#### `packages/support` -> `packages/booking/src/support`

Reason:

- currently thin ticket CRUD around booking/customer context
- only consumed by `packages/api`
- no external integration boundary yet

If support later expands into a real omnichannel case-management capability, extract it then.

### 4.3 Keep separate but consolidate ownership internally

#### `packages/payment`

Keep top-level, but move payment-specific transport glue into the package:

- move webhook adapter logic out of `packages/api/src/payments/webhooks`
- keep provider registry, webhook reconciliation, and provider-specific logic under `packages/payment`

Suggested internal layout:

```text
packages/payment/src/
  providers/
  webhooks/
  service.ts
  registry.ts
  types.ts
```

#### `packages/calendar`

Keep top-level because it owns an external integration boundary.

But keep it integration-focused:

- adapter registry
- provider implementations
- booking lifecycle event subscribers
- connection management

Do not treat internal listing availability rules as a separate top-level peer to `calendar`.

### 4.4 Leave inside `packages/api`

Do not create new domain packages for simple app-local surfaces unless they grow materially:

- `todo`
- `consent`
- admin list/search handlers
- internal health/ops routes

These are valid composition-layer concerns.

---

## 5. Target Shape

```text
packages/
  api/
  api-contract/
  assistant/
  auth/
  booking/
    src/
      availability/
      cancellation/
      disputes/
      support/
      workflows/
  calendar/
    src/
      adapters/
      sync/
  catalog/
    src/
      storefront/
  db/
  env/
  events/
  notifications/
  payment/
    src/
      adapters/
      webhooks/
  pricing/
  queue/
  ui/
  ai-chat/
  workflows/
```

This is closer to how Medusa achieves modularity:

- fewer domain packages
- stronger internal substructure
- clearer platform/core layer
- better separation of capability vs transport vs infrastructure

---

## 6. Why We Drifted

The likely reasons are structural, not accidental.

### 6.1 Legacy extraction mapped nouns to packages

ADR-001 mapped many legacy services directly to target packages. That helped migration planning, but it encouraged a 1:1 extraction mindset:

- service name -> package name
- route group -> package name

That is useful for migration tracking, but not enough for stable package design.

### 6.2 The repo defined patterns before it defined package admission rules

The skills and ADRs describe:

- how to build a package
- how to build workflows
- how to build provider registries

They do not define:

- when to avoid creating a package
- when to merge one back
- what minimum mass a capability needs before becoming top-level

### 6.3 Shared primitives were target-state while extraction already started

`events`, `workflows`, and provider patterns were described early as architecture targets. Some packages were extracted before those primitives were fully real and consistently adopted, so the extracted domains kept mixed responsibilities.

### 6.4 Persistence is still centralized

The write model still lives primarily in `packages/db`. That is fine, but it means package boundaries cannot rely on schema ownership alone yet. Thin packages were created even though their data and invariants still belonged operationally to a larger parent capability.

### 6.5 Handler boundaries stayed leaky

Examples in current code:

- booking handlers still emit events directly
- support handlers still use direct DB reads for customer checks

Once handlers keep fallback business logic, packages stop feeling self-contained and teams create more packages trying to recover structure.

### 6.6 Docs and skills became partially stale

The skills still describe `events` and `workflows` as target-state packages even though they now exist. That kind of drift usually signals a repo that is halfway between architecture phases, which makes people preserve temporary seams longer than intended.

---

## 7. Migration Phases

### Phase 1: Constitution and cleanup

- adopt this ADR as the package admission rule
- stop creating new top-level packages without the two-signal test
- refresh the Medusa-inspired skill files so status matches reality

### Phase 2: Merge thin booking-adjacent packages

- merge `availability` into `booking`
- merge `disputes` into `booking`
- merge `support` into `booking`
- leave backward-compatible exports temporarily if needed

### Phase 3: Finish capability ownership

- move payment webhook glue into `payment`
- move remaining booking lifecycle event emission out of handlers and into booking services/workflows
- keep calendar integration registration at app startup, but owned by `calendar`

### Phase 4: Re-audit package graph

- remove dead aliases and stale dependencies
- re-check top-level packages against the constitution
- only then decide if any additional extraction is justified

---

## Consequences

Expected gains:

- fewer top-level packages to reason about
- stronger Medusa-style capability ownership
- less handler bloat
- fewer circular boundary pressures
- better reuse of the same consolidation rule for future domains

Tradeoff:

- `packages/booking` becomes larger

That is acceptable. Medusa-style modularity depends more on **clear ownership and internal structure** than on keeping packages small.
