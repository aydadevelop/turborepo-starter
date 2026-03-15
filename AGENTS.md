# Project Agent Guide

This repository has a small set of **main local skills** that should be used proactively during architecture and feature iteration.

## Default posture

- Follow existing package boundaries before inventing new abstractions.
- Keep transport thin, domain logic in owning packages, persistence isolated, and external integrations behind adapters/providers.
- Prefer explicit validation, deterministic behavior, and small verifiable changes.

## Main skills to use

### 1. GSD planning workflow

Use the repo's GSD skills whenever the user asks for GSD or uses a `gsd-*` or `/gsd-*` command.

- Load from `.github/skills/gsd-*`
- Prefer matching custom agents from `.github/agents` when the workflow asks for a subagent
- Do not apply GSD workflows unless the user explicitly asked for them

### 2. `domain-packages`

Use for domain extraction and thin wiring work.

Reach for this when work involves:

- creating or extending `packages/booking`, `packages/pricing`, `packages/catalog`, `packages/calendar`, `packages/payments`, `packages/disputes`, or `packages/messaging`
- adding a new repository/service boundary in a domain package
- adding a new oRPC contract tree and wiring thin handlers in `packages/api`

### 3. `workflows`

Use for multi-step orchestration with rollback/compensation.

Reach for this when work involves:

- booking flows
- cancellation/refund orchestration
- multi-step write paths with external side effects
- idempotency-keyed saga-style operations

Do **not** use it for simple single-step CRUD.

### 4. `domain-events`

Use for typed event emission and subscribers via `packages/events`.

Reach for this when work involves:

- adding a new event type to `DomainEventMap`
- registering subscribers with `registerEventPusher`
- migrating code off the old API event bus
- testing event-driven flows with `clearEventPushers()`

### 5. `provider-adapters`

Use for any external integration that should stay swappable.

Reach for this when work involves:

- payment providers
- calendar providers
- messaging/channel adapters
- provider registries and fakes for tests

## Working rule of thumb

When a task touches one of these themes, prefer the matching skill **before** implementing the change ad hoc.

If a task spans multiple themes, combine them in this order:

1. `domain-packages`
2. `workflows`
3. `domain-events`
4. `provider-adapters`

That order mirrors the repo's target architecture:

`packages/api-contract` → `packages/api` → domain package service/workflow → repository/provider
