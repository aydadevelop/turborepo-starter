# Real-User Test Matrix

**Status:** Proposed  
**Date:** 2026-03-11  
**Related:** [ADR-005](./ADR/005-orpc_api_boundary.md), [ADR-009](./ADR/009_seed_bootstrap_and_scenario_fixtures.md), [ADR-014](./ADR/014_admin_surface_composition_and_resource_descriptors.md)

## Purpose

This document defines how to test product behavior with the lowest-entropy mix of:

- package-level Vitest tests for backend and domain correctness
- `apps/web` Vitest Browser Mode for fast real-browser UI interaction tests
- `packages/e2e-web` Playwright for hardened cross-service user journeys

The rule is:

> Every meaningful feature starts with one failing user-facing test at the highest-value lane that can falsify the behavior, then fills in lower supporting tests only where they reduce debugging cost or protect important invariants.

That gives us a test stack that is:

- fast enough for local iteration and AI-assisted change loops
- honest enough to catch integration regressions
- structured enough that browser tests do not become the only place correctness lives

## Browser Harness Rule

`apps/web` Browser Mode mounts feature components directly. It does not automatically run the root layout, so it does not inherit the global stylesheet import from [`apps/web/src/routes/+layout.svelte`](../apps/web/src/routes/+layout.svelte).

That is why [`apps/web/src/test/browser/setup.ts`](../apps/web/src/test/browser/setup.ts) imports [`apps/web/src/app.css`](../apps/web/src/app.css).

This is correct for Tailwind v4 and shadcn-svelte in this harness because:

- the stylesheet is still imported from the app layer, not duplicated in each test
- Browser Mode needs the same global design-system CSS as the real app
- the import belongs in shared browser test setup, not in individual specs

If we later add a richer route-shell harness, the stylesheet should still be loaded once at the harness/setup layer.

## Test Lanes

| Lane | Tool | Scope | Primary owner | Use it for | Avoid using it for |
|---|---|---|---|---|---|
| `L0` | Vitest | pure TS logic | domain packages, web features | parsing, policies, adapters, submit helpers, formatter logic, invalidation maps | proving browser interaction or real integration |
| `L1` | Vitest + test DB | package integration | `packages/db`, `packages/api`, domain packages | schema invariants, repositories, service rules, oRPC handlers, provider contracts, workflow steps | full browser journeys |
| `L2` | Vitest Browser Mode + Playwright provider | app-local browser interaction | `apps/web` | forms, tables, dialogs, tabs, route-level UI composition with mocked transport seams | cross-service startup, auth storage-state orchestration, deploy-like flows |
| `L3` | Playwright Test | hardened system journeys | `packages/e2e-web` | auth, onboarding, impersonation, notifications, payments, snapshots, dedicated e2e DB, cross-service behavior | every small UI branch or every field-level validation detail |
| `L4` | targeted Playwright / perf / snapshots | non-functional regression | `packages/e2e-web`, `apps/web` perf lane | visual baselines, heap growth guardrails, smoke performance checks | business-rule correctness |

## Default Development Flow

### For backend-heavy features

1. Write one failing `L1` test in the owning package.
2. If the behavior is user-visible, add one `L2` or `L3` test after the package test fails for the right reason.
3. Implement the feature.
4. Add `L0` tests only for extracted pure helpers or error mapping that would otherwise require brittle integration setup.

### For frontend-heavy features

1. Write one failing `L2` browser test against the feature screen or resource component.
2. Implement the interaction.
3. Add or update `L0` tests for submit adapters, descriptor logic, and invalidation helpers.
4. Promote a stabilized journey to `L3` only when it becomes a real cross-service or product-critical flow.

## Matrix By Concern

| Concern | Red test lane | Supporting lanes | Notes |
|---|---|---|---|
| DB constraints, indexes, triggers, exclusion rules | `L1` in `packages/db` | `L3` only when the user can trigger it through a real flow | Source of truth stays in the DB lane |
| Domain service rules | `L1` in owning package | `L0` for helper policies | Example: pricing calculation, cancellation policy, support status transitions |
| oRPC handler behavior | `L1` in `packages/api` | `L2` for the screen that consumes it | Contract and error mapping should be proven without a browser first |
| Auth-client-backed org/account flows | `L2` in `apps/web` | `L3` for end-to-end auth/session behavior | UI module should be testable with mocked auth seams |
| Resource forms and dialogs | `L2` | `L0` submit helper tests | Browser Mode is the default lane here |
| Resource tables and filters | `L2` | `L0` filter/descriptor tests | Keep server-driven row DTOs and filter contracts |
| Full onboarding / cross-service flows | `L3` | `L1` per service/package underneath | Example: new account -> org create -> team access |
| Visual shell regressions | `L4` snapshots | `L2` for interactive details | Public pages and stabilized workspaces only |
| Performance guardrails | `L4` | none by default | Keep isolated and targeted |

## Listing Workspace Matrix

The listing workspace is the highest-leverage place to apply this model.

| Surface | Red test lane | Supporting tests |
|---|---|---|
| Listing basics editor | `L2` Browser Mode | `L1` catalog handler/service tests, `L0` submit helpers |
| Pricing profiles | `L2` Browser Mode for table + editor dialog | `L1` pricing service tests |
| Pricing rules | `L2` Browser Mode | `L1` pricing rule validation/tests |
| Discounts | `L2` Browser Mode | `L1` pricing/discount service tests |
| Amenities | `L2` Browser Mode picker/manager | `L1` catalog policy tests |
| Assets | `L2` Browser Mode ordered asset manager | `L1` storage/asset API tests |
| Calendar connections | `L2` Browser Mode setup surface | `L1` calendar package tests, `L3` only when real provider connection matters |
| Availability rules / durations / blocks | `L2` for editor interactions | `L1` booking availability tests and DB overlap tests |
| Publish/readiness panel | `L2` for panel state | `L1` onboarding/readiness API tests, `L3` when publish flow spans multiple services |
| Location moderation | `L2` draft/submission UI | `L1` moderation API/state tests, `L3` when moderator and operator flows are both in scope |

## Org/Admin Matrix

| Surface | Red test lane | Supporting tests |
|---|---|---|
| Org settings | `L2` | `L0` submit helper |
| Team invite | `L2` | `L0` submit helper |
| Team management table | `L2` | `L1` auth/org API tests |
| Invitations | `L2` | `L1` auth/org API tests |
| Org switcher | `L2` | `L0` invalidation tests |
| Admin users/organizations tables | `L2` | `L1` admin API tests |
| Impersonation | `L3` | `L1` authorization tests |

## What Belongs In `apps/web` Browser Mode

`apps/web` Browser Mode should cover:

- feature screens
- dialogs
- resource tables
- editor sections
- tab/workspace interactions
- optimistic UI and submit/error states
- route-level composition with mocked `authClient`, oRPC query options, and feature adapters

It should not try to own:

- full auth/session orchestration
- storage-state setup
- real provider integrations
- multi-service startup and health
- deploy-like browser gates

## What Belongs In `packages/e2e-web`

`packages/e2e-web` remains the source of truth for:

- login/session persistence
- anonymous and authenticated onboarding
- impersonation
- notifications + payment cross-service behavior
- real user journeys that touch multiple runtimes
- browser snapshots for stabilized pages
- dedicated e2e database bootstrap and global setup

If a journey is still rapidly changing, keep it in `apps/web` Browser Mode first. Promote it to `packages/e2e-web` when:

- the flow spans multiple runtimes or auth state
- the UI contract is stable enough to harden
- the value of deploy-like verification outweighs the maintenance cost

## Required Test Set Per New Surface

Every new operator/admin surface should usually land with:

1. one `L2` browser test that proves the main happy path
2. one `L0` or `L1` test that proves the core mutation or rule underneath

Add `L3` only when the feature becomes a real system journey.

## Suggested Commands

### Fast local loop

```bash
cd apps/web
bun run test:browser:watch
```

### Feature package loop

```bash
bunx turbo run test --filter=@my-app/catalog
bunx turbo run test --filter=@my-app/api
```

### Hardened browser gate

```bash
bun run test:e2e
```

### Deploy-like browser gate

```bash
bun run test:e2e:docker
```

## Immediate Adoption Plan

### Phase 1

- keep `apps/web` Browser Mode as the default fast browser lane
- keep `packages/e2e-web` as the hardened source of truth
- stop adding new app-local Playwright smoke specs in `apps/web`

### Phase 2

- add a route-shell browser harness in `apps/web` for layout-aware tests
- build one shared `ResourceTable` browser test harness
- build one shared resource-form browser helper for descriptor-driven screens

### Phase 3

- apply the matrix to the listing workspace:
  - basics
  - pricing profiles
  - availability
  - assets
  - publish/readiness

### Phase 4

- promote only stabilized, cross-service flows to `packages/e2e-web`
- add snapshot coverage only after UI stabilizes enough that baseline churn is low
