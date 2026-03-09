# Travel Commerce Marketplace Platform

## What This Is

A brownfield rebuild of a multi-organization marketplace for time-slot listings such as boats, tours, equipment, rentals, and similar bookable inventory. The active repo is the new runtime starter and target architecture; it will absorb proven domain behavior from `cf-boat-api` and stronger abstraction/integration patterns from `full-stack-cf-app` without regressing back into boat-only or legacy-bound design.

## Core Value

Operators can publish and manage flexible bookable listings, and customers can reliably discover, quote, book, pay for, and coordinate those listings through a generic marketplace flow that is testable, extensible, and safe to evolve.

## Requirements

### Validated

- ✓ Contract-first transport foundation exists across web, server, and assistant runtimes — existing
- ✓ Better Auth organization membership, session context, and RBAC middleware are working foundations — existing
- ✓ Notification event → intent → delivery pipeline exists with queue-backed processing — existing
- ✓ PostgreSQL/Drizzle schema foundation already covers auth, notifications, assistant, and substantial marketplace modeling draft — existing
- ✓ Dokku/Pulumi/Docker deployment baseline exists for multi-app runtime delivery — existing

### Active

- [ ] Finalize the marketplace database model into reproducible migrations, deterministic seeds, and replayable state snapshots
- [ ] Extract package-owned domains for events, workflows, catalog, pricing, booking, payments, calendar, disputes, and messaging behind the documented target boundaries
- [ ] Port proven legacy behavior from `cf-boat-api` and `full-stack-cf-app` with parity tests instead of direct code copy
- [ ] Ship a generic listing marketplace flow that is not boat-specific but preserves real travel-commerce domain knowledge
- [ ] Establish TDD-managed delivery loops so each phase lands with red-green-refactor coverage and observable progress

### Out of Scope

- Direct wholesale migration of legacy directories into active runtime code — semantics and boundaries have already changed
- Boat-only domain assumptions in core abstractions — the target product must support multiple listing types
- Mobile-native clients during initial buildout — web and API foundation come first
- Speculative platform extensions before core booking, payment, calendar, and support flows are reliable — sequencing discipline matters more than breadth

## Context

This repository already contains a working starter stack: SvelteKit web, Hono/oRPC services, Better Auth, Drizzle/PostgreSQL, notifications, assistant, and Dokku/Pulumi deployment. It also carries two brownfield sources that must inform the implementation differently:
- `cf-boat-api` contains the most battle-tested domain behavior from a real boat-listing season and should be treated as the source of business truth where newer code is incomplete.
- `full-stack-cf-app` contains better abstractions for contracts, webhooks, calendar syncing, payment adapters, and provider-oriented design, but it is only partially complete and cannot be copied blindly.

The current repo is the target system. The schema plan in `docs/drizzle-schema-plan.md`, the architecture ADRs in `docs/ADR/`, and the extracted codebase map in `.planning/codebase/` collectively define the intended shape. The project should progress in small, TDD-managed parts with deterministic seeds/snapshots so progress remains visible and reversible as complexity increases.

## Constraints

- **Tech stack**: Stay within the current Bun + Turborepo + Hono/oRPC + SvelteKit + Drizzle + PostgreSQL architecture — the repo is already scaffolded around it
- **Brownfield source**: Legacy apps are reference material, not runtime dependencies — no imports from `legacy/` into active code
- **Architecture**: Keep contracts and handlers thin; domain logic belongs in owning packages, and side effects must move behind events/workflows/providers
- **Testing**: Use red-green-refactor as the default delivery loop and add deterministic seeds/snapshots for schema-heavy and integration-heavy work
- **Schema safety**: Database work must land as reproducible migrations with verification in environments closer to real Postgres where extension-backed behavior matters
- **Sequencing**: Foundation work (schema baseline, events, workflows, seeds/snapshots) must precede high-risk extraction of booking/payment/calendar behavior

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use the active root workspace as the only target runtime | Prevent split ownership and avoid shipping from legacy trees | — Pending |
| Treat `cf-boat-api` as the primary source of domain truth | It contains the most proven business behavior from live seasonal use | — Pending |
| Treat `full-stack-cf-app` as the primary source of architectural patterns and adapters | It already explored better abstractions for contracts, webhooks, calendar, and payment integrations | — Pending |
| Start with schema baseline + seeds/snapshots before feature extraction | Brownfield safety and deterministic progress depend on reproducible data state | — Pending |
| Use TDD-managed, phase-based extraction instead of bulk migration | Reduces drift and keeps each domain portable, testable, and reviewable | — Pending |

---
*Last updated: 2026-03-09 after GSD initialization*