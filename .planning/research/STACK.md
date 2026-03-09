# Recommended Stack and Infrastructure Posture

**Project:** Travel commerce marketplace brownfield completion
**Date:** 2026-03-09
**Confidence:** HIGH — based on current repo architecture, ADRs, and schema plan

## Recommended target state

Finish the platform on the stack that is already established in-repo rather than introducing new framework risk. The safe posture is: **Bun + Turborepo monorepo, Hono + oRPC transport, SvelteKit web, Better Auth for org-aware auth, Drizzle on PostgreSQL 18, pg-boss-backed async work, Docker images deployed via GitHub Actions → GHCR → Dokku, with Pulumi managing the VPS baseline and Loki/Grafana providing first-line observability.**

This repo is already opinionated in the right places. The remaining risk is not missing technology; it is incomplete domain extraction, incomplete database hardening, and brownfield drift.

## Keep as-is

| Area | Keep | Why this stays |
|---|---|---|
| Monorepo/runtime | **Bun + Turborepo** | Already wired across apps/packages; changing runtime or workspace tooling now would create churn with little business payoff. |
| Transport | **Hono + oRPC contract-first** | Matches the current thin-handler direction and keeps web/server/assistant boundaries typed. |
| Web | **SvelteKit + Svelte 5** | Already the active frontend runtime; no reason to split frontend strategy during extraction. |
| Auth/multitenancy | **Better Auth + organization membership/RBAC** | The marketplace actor model already depends on org membership, active org context, and permission middleware. |
| Persistence | **Drizzle + PostgreSQL 18** | The schema plan, domain model, and extension strategy are all PostgreSQL-first. |
| Async/side effects | **pg-boss via `packages/queue`** | Fits the repo-native workflow/event direction better than adding Redis- or broker-first orchestration. |
| Deployment | **Docker images on Dokku, provisioned with Pulumi** | Already operational, simple enough for the current stage, and compatible with multi-app rollout/rollback. |
| Ops baseline | **GitHub Actions + GHCR + Loki/Grafana** | Existing pipeline already supports image promotion, deploy automation, and basic observability. |

## Complete next

1. **Domain package extraction on the existing architecture**
   - Move marketplace logic out of `packages/api` into package-owned domains: booking, catalog, pricing, payments, calendar, disputes, messaging.
   - Add the repo-native foundations from ADR-002: `packages/events` and `packages/workflows`.
   - Keep `packages/api` as transport/auth wiring, not as the permanent home for business logic.

2. **PostgreSQL-first schema hardening**
   - Convert the marketplace schema plan into reproducible migrations, deterministic seeds, and replayable snapshots.
   - Treat PostgreSQL extensions as first-class infrastructure dependencies, not optional niceties.
   - Expected extension-backed work includes at least **`pgvector`** and **`btree_gist`**; **`pg_textsearch`**, **`cube`**, and **`earthdistance`** should only be adopted once their exact feature use is active and verified.

3. **Provider/adapter completion instead of direct integrations**
   - Keep external services behind provider interfaces for payments, calendar sync, and outbound messaging.
   - Reuse the current adapter direction rather than importing SDKs directly inside handlers or domain services.

4. **Parity-preserving infrastructure discipline**
   - Keep the current multi-app posture: separate `server`, `assistant`, `notifications`, and `web` runtimes.
   - Keep Docker Compose as the local parity harness and Dokku as the deployment target until real scaling pressure appears.
   - Keep staging restores and rollback drills part of the operating model, especially before risky schema phases.

## Avoid

- **Do not switch core frameworks** now (no rewrite away from Bun, Turborepo, Hono/oRPC, SvelteKit, Better Auth, or Drizzle).
- **Do not introduce a second orchestration stack** for workflows/queues (for example Redis-heavy workflow engines) before the repo-native `events`/`workflows` model is finished.
- **Do not bypass PostgreSQL** for critical marketplace behavior by leaning on SQLite-ish test substitutes as the final source of truth.
- **Do not import runtime code from `legacy/`**; legacy is a behavior reference, not an active dependency.
- **Do not keep business logic in transport handlers** or inline side effects in booking/payment flows.
- **Do not add external search infrastructure early**; complete the PostgreSQL-backed path first, then justify anything beyond it with measured bottlenecks.

## Database verification strategy for extension-backed features

Use a three-layer verification model:

1. **Fast logic tests**
   - Use Vitest with lightweight DB substitutes only for pure domain logic, validation, and repository behavior that does **not** depend on PostgreSQL-specific extensions or constraints.

2. **Real PostgreSQL migration verification**
   - Run migrations against a real **PostgreSQL 18** instance matching the repo baseline (`pgvector/pgvector:pg18`).
   - Explicitly verify extension install/availability and DDL that substitutes cannot prove: exclusion constraints with `btree_gist`, vector columns/indexes, full-text/BM25 features, earth-distance/location search, trigger behavior, and query plans where relevant.

3. **Staging replay before risky merges/releases**
   - Rehearse migration apply + seed/snapshot replay on staging before landing schema-heavy phases.
   - Validate at least: booking overlap protection, payment webhook persistence, publication/storefront reads, queue-backed side effects, and rollback/restore procedures.

**Rule:** if a feature depends on a PostgreSQL extension, custom SQL migration, exclusion constraint, or production-like query semantics, it is not “verified” until it passes on real Postgres.

## Test, runtime, and tooling implications

- **Bun remains the default runtime and package manager**, but keep **Node 22+** available because parts of the toolchain and ecosystem expect it.
- **Turborepo task boundaries matter more as extraction proceeds**: contracts, transport, domains, and infra should remain independently testable/buildable.
- **Vitest stays the primary unit/integration runner** for packages; **Playwright stays the deployment-gate e2e layer**; the Docker-based e2e flow should remain the closest pre-deploy confidence check.
- **Typed env validation stays mandatory** across apps so brownfield extraction does not quietly create runtime configuration drift.
- **Observability is part of the stack choice**: health endpoints, container logs to Loki, and Grafana dashboards/alerts are the minimum safe posture for multi-app rollout.

## Bottom line

The recommended path is to **finish the marketplace on the stack already chosen here**, not to redesign it. Keep the Bun/Turborepo + Hono/oRPC + SvelteKit + Better Auth + Drizzle/PostgreSQL + pg-boss + Dokku/Pulumi posture, complete the missing domain packages and database hardening, and require real-PostgreSQL verification for every extension-backed capability before calling a phase done.

## Sources

- `.planning/PROJECT.md`
- `.planning/codebase/STACK.md`
- `.planning/codebase/ARCHITECTURE.md`
- `docs/ADR/002_architecture-patterns.md`
- `docs/drizzle-schema-plan.md`
- `README.md`
- `docker-compose.yml`
