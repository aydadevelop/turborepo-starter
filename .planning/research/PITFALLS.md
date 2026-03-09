# Domain Pitfalls

**Domain:** Brownfield marketplace extraction into an existing marketplace monorepo
**Researched:** 2026-03-09
**Overall confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Schema drift between planning docs, executable schema, and real migrations
**What goes wrong:**
The roadmap assumes the schema is "done" because `docs/drizzle-schema-plan.md` is detailed, while the executable Drizzle schema, triggers, extension-backed indexes, and committed migration history lag behind or differ.

**Why it happens:**
- The schema plan is richer than the currently exported runtime schema.
- Extension-backed features are intentionally omitted from parts of the executable schema to keep PGlite-based tests passing.
- There is no committed migration chain yet, so environment state can drift from whatever the docs imply.

**Consequences:**
- Teams build features against the wrong invariants.
- Production and local/test environments diverge.
- Late rewrites are triggered when exclusion constraints, triggers, pgvector, or pg_textsearch behavior finally lands.
- Adjacent domains (support, affiliate, booking) encode mismatched vocabularies and uniqueness rules.

**Warning signs:**
- PRs reference the schema plan but do not add or update migrations.
- A field/status/constraint exists in docs but not in `packages/db/src/schema/*`.
- Tests pass in PGlite while the same DDL is unverified in real Postgres.
- Multiple domains define the same concept with different enum values or uniqueness assumptions.

**Prevention strategy:**
- Put a **schema baseline phase first**: commit baseline migrations before feature extraction.
- Reconcile one domain at a time from **plan → runtime schema → migration → verification**.
- Split work into:
  1. core relational schema,
  2. extension-backed search/geo/vector features,
  3. trigger/exclusion/invariant enforcement.
- Require every schema PR to prove the same change in:
  - Drizzle schema,
  - migration files,
  - deterministic replay/seed flow,
  - real-Postgres verification.
- Treat docs as intent, not source of truth, until matched by executable artifacts.

**Suggested phase placement:**
- **Phase 0 / earliest foundation:** baseline migrations, deterministic replay/snapshots, Postgres verification lane.
- **Before any booking/payment/calendar extraction:** reconcile booking/support/affiliate vocabulary and invariants.

### Pitfall 2: Legacy drift from treating brownfield sources as current truth without parity checks
**What goes wrong:**
The team ports behavior from `cf-boat-api` or `full-stack-cf-app`, but the chosen source is stale, partial, or already semantically replaced in the target monorepo.

**Why it happens:**
- Legacy code is not compiled together with the active repo, so divergence is invisible by default.
- The two brownfield sources play different roles: one holds more battle-tested business behavior, the other has better architecture patterns.
- Engineers understandably remember "how it used to work" more clearly than what the active repo now permits.

**Consequences:**
- Features ship with silent behavior regressions.
- The wrong legacy source becomes de facto truth for a domain.
- The roadmap produces false progress: code moves, but semantics drift.
- Rework increases when extracted packages later fail parity or contract expectations.

**Warning signs:**
- A phase proposal says "port X from legacy" without naming the exact source of truth.
- Reviews compare new code to ADR prose only, not to proven legacy behavior.
- Two implementations exist for the same domain rule and nobody can point to the canonical one.
- Teams discover behavior differences only during manual QA.

**Prevention strategy:**
- For each extraction phase, declare a **behavior source of truth** explicitly:
  - `cf-boat-api` for business semantics,
  - `full-stack-cf-app` for adapter/provider/workflow patterns,
  - current repo for transport/auth/runtime boundaries.
- Add **legacy-parity tests** before or alongside porting any domain with meaningful state transitions.
- Port **one domain at a time**, and freeze parity scope before implementation starts.
- Require a short drift checklist in each roadmap phase:
  - which repo is authoritative,
  - which behaviors are intentionally changed,
  - which behaviors must remain identical.

**Suggested phase placement:**
- **Phase 1:** parity harness + extraction rules.
- **Every domain phase:** include explicit truth-source and drift-check deliverables.

### Pitfall 3: Direct-copy risk that hardens the wrong architecture
**What goes wrong:**
Engineers directly copy route handlers, services, or integrations from legacy trees into `packages/api` or other active runtime surfaces, reintroducing inline side effects, legacy auth assumptions, and monolithic service boundaries.

**Why it happens:**
- Direct copy is the fastest apparent way to show momentum.
- The target package boundaries (`packages/events`, `packages/workflows`, domain packages) are still being established.
- Legacy code often bundles business logic with transport, provider calls, and orchestration, which makes selective extraction slower.

**Consequences:**
- The repo calcifies around the wrong seams.
- Later package extraction becomes more expensive than doing it correctly upfront.
- Inline calendar/payment/notification logic leaks back into handlers and services.
- Auth and org-scoping bugs appear because copied code bypasses current middleware/context boundaries.

**Warning signs:**
- Large file moves from `legacy/` with only import-path edits.
- Handlers grow instead of shrinking.
- Domain services directly import SDKs or notification/calendar/payment plumbing.
- Route layers begin doing compensation logic or raw Drizzle work.

**Prevention strategy:**
- Make **thin transport** and **provider/workflow boundaries** roadmap gates, not optional cleanup.
- Extract **foundational packages first** (`events`, `workflows`) so teams have the right destination seams.
- Ban wholesale file ports in milestone acceptance criteria; require **behavior re-expression** in owning packages.
- Review extracted work against ADR-002 anti-patterns: no inline side effects, no direct SDK calls in domain logic, no business logic in handlers, no ad-hoc compensation.
- Prefer copying small pure functions or invariant logic, not file structures.

**Suggested phase placement:**
- **Phase 0–1:** create the target seams before migrating feature-heavy domains.
- **All extraction phases:** direct-copy review gate in acceptance criteria.

### Pitfall 4: Weak verification that mistakes motion for migration progress
**What goes wrong:**
The roadmap tracks implementation progress by files created or routes wired, but lacks proof that extracted behavior matches legacy expectations, survives real database conditions, and remains reversible.

**Why it happens:**
- Fast local tests cover only a subset of true platform behavior.
- PGlite convenience hides extension and migration realism gaps.
- Brownfield work is easy to validate manually for the happy path while missing edge cases.
- Teams prioritize extraction speed over red-green-refactor discipline.

**Consequences:**
- Breakage appears only after multiple phases have stacked on top of wrong assumptions.
- Hidden tests fail because invariants were never encoded.
- The roadmap marks phases complete without trustworthy regression protection.
- Rollback becomes difficult because state setup is not deterministic.

**Warning signs:**
- A phase lands without new tests tied to the extracted domain behavior.
- Verification says "manual smoke passed" but not "parity, migration, and real-Postgres checks passed."
- Seeds cover starter/demo data but not realistic marketplace states.
- No fixture exists for cancellations, retries, disputes, shift requests, or payment reconciliation.

**Prevention strategy:**
- Define **verification as a deliverable** for every roadmap phase, not a follow-up task.
- Minimum verification stack per risky domain:
  - legacy-parity tests for core behavior,
  - deterministic seeds/snapshots for representative states,
  - real-Postgres migration verification for schema-heavy changes,
  - contract/handler tests for the thin transport surface.
- Use the roadmap to force **red-green-refactor** loops and visible checkpoints.
- Add brownfield fixtures for the hardest paths first: overlap protection, cancellation/refund rules, payment webhook reconciliation, calendar sync side effects.

**Suggested phase placement:**
- **Phase 0:** deterministic replay and migration verification infrastructure.
- **Every phase:** domain-specific parity + integration verification.
- **Before integrations wave:** prove booking/payment/calendar flows with representative fixtures.

### Pitfall 5: Sequencing errors that front-load volatile domains before foundations exist
**What goes wrong:**
The roadmap starts with booking, payments, calendar, or messaging extraction before the schema baseline, event system, workflow engine, and verification harness are in place.

**Why it happens:**
- Commerce features feel more visible than foundation work.
- Payment and booking flows seem like the product core, so teams rush them.
- Foundational work can be misread as "platform polishing" instead of migration risk reduction.

**Consequences:**
- High-side-effect domains are implemented twice.
- Teams improvise temporary orchestration patterns that later must be removed.
- Payment/calendar/messaging work locks in brittle assumptions before booking lifecycle and schema invariants stabilize.
- Parallel domain extraction amplifies drift across packages.

**Warning signs:**
- Booking extraction begins while `packages/events`/`packages/workflows` are absent.
- Payment or calendar integrations are scheduled before stable booking events exist.
- Multiple extraction streams run in parallel against incomplete package boundaries.
- Teams postpone migration baseline work as "cleanup after MVP." 

**Prevention strategy:**
- Sequence the roadmap from **lowest regret to highest side effect**:
  1. schema baseline + migrations + replay,
  2. event/workflow foundations,
  3. low-side-effect catalog/pricing logic,
  4. booking orchestration,
  5. payment/calendar/messaging integrations,
  6. disputes/operational extensions.
- Keep only one high-risk commerce domain active at a time until verification is stable.
- Make "foundations complete" a hard prerequisite for booking/payment/calendar phases.
- Avoid mixing domain extraction with toolchain or schema-model rewrites in the same phase.

**Suggested phase placement:**
- **Roadmap-wide ordering rule:** foundation before orchestration; orchestration before integrations.
- **Late phases only:** payments, calendar sync, messaging fan-out, disputes.

## Roadmap Guardrails

Use the roadmap to actively prevent these mistakes, not just describe them.

### Recommended guardrail sequence

1. **Brownfield safety baseline**
   - Baseline migrations committed
   - Deterministic seed/snapshot/replay flow established
   - Real Postgres verification added for extension/invariant work

2. **Extraction foundations**
   - `packages/events` and `packages/workflows` created
   - Compatibility path defined for existing event behavior
   - Phase template requires truth-source + parity scope

3. **Low-side-effect domain extraction**
   - Start with catalog/pricing/read-heavy logic
   - Reconcile schema vocabulary and domain invariants before broad feature wiring

4. **Booking orchestration extraction**
   - Only after schema/event/workflow/verification foundations are live
   - Use workflows for compensation-sensitive operations

5. **Integration-heavy extraction**
   - Payments, calendar, messaging only after booking emits stable domain events
   - Each integration phase must prove auth, org scoping, replay, and reconciliation behavior

6. **Operational domains and hard edge cases**
   - Disputes, cancellations, shift flows, affiliate/support consistency, historical state handling

## Phase-Specific Warnings

| Phase topic | Likely pitfall | Mitigation |
|-------------|---------------|------------|
| Schema baseline | Declaring the model complete from docs alone | Require plan-to-schema-to-migration-to-Postgres verification in the same phase |
| Events/workflows foundation | Building domain code before destination seams exist | Make event/workflow packages a prerequisite for booking/payment/calendar extraction |
| Catalog/pricing extraction | Sneaking boat-only assumptions into generic marketplace abstractions | Use legacy semantics tests plus target-package boundary reviews |
| Booking extraction | Recreating monolithic service logic with inline side effects | Force workflow orchestration + event emission + compensation tests |
| Payments/calendar/messaging | Integrating before stable booking lifecycle/events exist | Gate on booking domain events, idempotency, replay, and reconciliation tests |
| Support/affiliate/reviews follow-up | Propagating plan/schema vocabulary drift into adjacent domains | Reconcile enums, uniqueness rules, and ownership boundaries before implementation |

## Sources

- `.planning/PROJECT.md`
- `.planning/codebase/CONCERNS.md`
- `docs/ADR/001_legacy-extraction.md`
- `docs/ADR/002_architecture-patterns.md`
- `docs/drizzle-schema-plan.md`
