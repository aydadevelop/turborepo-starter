# Project Research Summary

**Project:** Travel Commerce Marketplace Platform
**Domain:** Brownfield travel-commerce marketplace extraction
**Researched:** 2026-03-09
**Confidence:** HIGH

## Executive Summary

This project is a brownfield completion of a multi-organization travel-commerce marketplace, not a greenfield product spike. The active monorepo is already the target runtime, and the safest path is to finish it on the existing stack: Bun + Turborepo, Hono + oRPC, SvelteKit, Better Auth, Drizzle, PostgreSQL, pg-boss-backed async work, and Docker/Dokku delivery. The real challenge is not technology selection; it is disciplined extraction of proven marketplace behavior from legacy sources without reintroducing boat-only assumptions, inline side effects, or schema drift.

Research across stack, features, architecture, and pitfalls points to one clear recommendation: make the **schema baseline, deterministic seeds/snapshots, and event/workflow foundations** the earliest roadmap work. Those are not cleanup tasks. They are the enabling foundations that make catalog, pricing, booking, payments, and support flows safe to port, test, and evolve. Once those foundations exist, the roadmap should move from low-side-effect commerce logic into booking orchestration, and only then attach payment, calendar, notification, and messaging integrations behind provider and workflow seams.

The major risks are consistent across the research: schema drift between docs and executable reality, legacy drift from unclear behavioral truth, direct-copy migration that hardens the wrong architecture, weak verification, and sequencing errors that start with volatile integrations before the platform foundations exist. The mitigation is equally consistent: commit migrations early, use replayable states and parity tests, keep handlers thin, keep domains package-owned, and gate every high-risk phase with real-Postgres and workflow-aware verification.

## Stack Direction

The stack direction is to **keep and complete** the architecture already established in-repo rather than introducing a second framework or orchestration model.

**Core technologies:**
- **Bun + Turborepo** — keep the current monorepo/runtime posture to avoid churn and preserve package boundaries.
- **Hono + oRPC** — keep transport contract-first and thin so domain logic stays outside handlers.
- **SvelteKit + Svelte 5** — continue with the existing web runtime; no frontend strategy split is needed.
- **Better Auth** — keep org-aware auth, session context, and RBAC as the access foundation for all marketplace domains.
- **Drizzle + PostgreSQL 18** — treat Postgres as the real source of truth, including extension/invariant verification where needed.
- **pg-boss via `packages/queue`** — use queue-backed async work instead of adding a second orchestration stack.
- **Docker + GitHub Actions + GHCR + Dokku + Pulumi** — keep the current delivery and operations baseline for parity and rollback discipline.

## Table Stakes

The research is clear that v1 table stakes are both customer-visible commerce features and brownfield-enabling capabilities.

**Must-have platform and product work:**
- Schema baseline with committed migrations and extension-aware verification
- Deterministic seeds, fixture replay, and replayable state snapshots
- Legacy-parity verification for core marketplace behavior
- Multi-org auth, org context, and RBAC-safe operator access
- Generic listing and publication management
- Public storefront discovery and listing detail flow
- Availability management with booking-safety guarantees
- Pricing and quote generation
- Booking intake and lifecycle baseline
- Payment processing with webhook reconciliation
- Confirmation, cancellation, and support communication baseline
- Cancellation policy and refund-capable core flows

**Defer until the core transaction loop is stable:**
- AI assistant-led booking and operator tooling
- Advanced semantic/BM25/image search
- Broad external calendar sync coverage
- Partner widgets / white-label distribution breadth
- Affiliate automation
- Review systems
- Advanced reschedule/dispute automation

## Enabling Foundations

These are early-phase work, not optional groundwork:

1. **Schema baseline** — reconcile planning docs, runtime schema, and committed migrations before feature extraction.
2. **Deterministic seeds and snapshots** — create reliable, replayable marketplace states for demos, parity checks, and regression testing.
3. **Typed domain events** — establish the side-effect seam so booking and payment flows do not grow inline notification/calendar logic.
4. **Workflows with compensation** — establish the multi-step consistency seam before booking, refund, and provider-heavy operations.
5. **Parity harness** — make the behavior source of truth explicit for each domain and verify against it continuously.

## Major Risks

1. **Schema drift** — the schema plan is ahead of executable migrations and real verification. Mitigation: baseline migrations first, then prove plan → schema → migration → real Postgres in the same phase.
2. **Legacy drift** — different brownfield sources serve different purposes and can diverge silently. Mitigation: declare a source of behavioral truth per phase and add parity tests before or during extraction.
3. **Direct-copy migration** — copying legacy handlers/services will harden the wrong seams. Mitigation: re-express behavior inside owning packages, keep transport thin, and forbid runtime dependence on `legacy/`.
4. **Weak verification** — motion can be mistaken for migration progress if parity, replay, and real-Postgres checks are missing. Mitigation: make verification a deliverable for every risky phase.
5. **Bad sequencing** — extracting booking/payments/calendar before foundations exist will force rework. Mitigation: foundation before orchestration, orchestration before integrations.

## Recommended Sequencing

### Phase 0 — Data Safety Baseline
**Rationale:** Every downstream domain depends on trustworthy schema state.

**Delivers:**
- Baseline migrations committed
- Deterministic seeds and state snapshots
- Real-Postgres verification lane for extension/invariant-sensitive work
- Shared fixture/replay strategy for parity testing

### Phase 1 — Event, Workflow, and Parity Foundations
**Rationale:** High-side-effect commerce flows need stable orchestration seams before extraction begins.

**Delivers:**
- `packages/events` foundation
- `packages/workflows` foundation with execution/compensation logging
- Compatibility bridge into the existing notification pipeline
- Per-phase rule for truth-source declaration and parity scope

### Phase 2 — Catalog and Pricing Extraction
**Rationale:** These are upstream, lower-regret commerce domains that unlock the rest of the marketplace.

**Delivers:**
- Generic listing model and publication flows
- Search/filter/detail semantics for the storefront
- Pricing profiles, quote logic, and reusable pure commerce rules

### Phase 3 — Booking Core and Availability Safety
**Rationale:** Booking is the center of the marketplace and should land only after schema, pricing, and orchestration seams are stable.

**Delivers:**
- Availability ownership and overlap protection
- Booking lifecycle/state transitions
- Booking workflows and `booking:*` domain events
- Thin handler rewiring into package-owned domain logic

### Phase 4 — Payment, Calendar, Notification, and Messaging Integrations
**Rationale:** External systems should react to stable internal events, not define internal domain behavior.

**Delivers:**
- Payment provider path with webhook reconciliation and idempotency
- Calendar adapters reacting to booking events
- Notification cleanup behind event subscribers
- Messaging/channel adapters behind provider seams

### Phase 5 — Cancellations, Refunds, Disputes, and Operational Hardening
**Rationale:** These depend on faithful booking and payment state, so they belong after the commerce core is stable.

**Delivers:**
- Cancellation policy evaluation
- Refund orchestration
- Dispute and operational support flows
- Hard-path fixtures for reconciliation and policy edge cases

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | The repository already contains the target technical direction and deployment posture. |
| Features | HIGH | Table stakes and defer decisions are strongly supported by the current project brief and brownfield constraints. |
| Architecture | HIGH | ADRs and current package direction consistently favor thin transport, package-owned domains, events, workflows, and adapters. |
| Pitfalls | HIGH | Risks are concrete, repeated across sources, and directly tied to current repo state. |

**Overall confidence:** HIGH

**Gaps to address during planning:**
- Confirm the exact first set of Postgres extension-backed features that must ship in the earliest schema baseline.
- Decide how much legacy parity is required for external calendar sync in the first marketplace milestone.
- Reconcile adjacent domain vocabulary early for booking, support, affiliate, and dispute concepts before broad implementation starts.

## Sources

- `.planning/PROJECT.md`
- `.planning/research/STACK.md`
- `.planning/research/FEATURES.md`
- `.planning/research/ARCHITECTURE.md`
- `.planning/research/PITFALLS.md`
- `docs/ADR/001_legacy-extraction.md`
- `docs/ADR/002_architecture-patterns.md`
- `docs/drizzle-schema-plan.md`

## Roadmap Implications

The roadmap should start with **schema baseline + seeds/snapshots + verification**, then immediately establish **events and workflows** as the permanent seams for side effects and multi-step consistency. Only after those foundations are live should planning move into catalog/pricing, then booking/availability, then integration-heavy domains such as payments and calendar sync, and finally disputes and operational hardening.

In short: **early phases should optimize for safety and leverage, not visible surface area**. If the roadmap preserves that sequencing, later commerce features can land as small, testable vertical slices instead of fragile ports. If it skips those foundations, the project will accumulate drift faster than it accumulates product value.

---
*Research completed: 2026-03-09*
*Ready for roadmap: yes*
