# Codebase Concerns

**Analysis Date:** 2026-03-09

## Tech Debt

**Architecture target is ahead of executable package boundaries:**
- Issue: The target architecture in `docs/ADR/001_legacy-extraction.md`, `docs/ADR/002_architecture-patterns.md`, and `docs/architecture-constitution.md` depends on domain packages such as `packages/events`, `packages/workflows`, `packages/booking`, `packages/pricing`, `packages/calendar`, and `packages/payments`, but those package paths are not present in the current workspace. Current runtime behavior still lives in `packages/api/src/handlers/*.ts`, `packages/api/src/lib/event-bus.ts`, and `packages/assistant/src/router.ts`.
- Files: `docs/ADR/001_legacy-extraction.md`, `docs/ADR/002_architecture-patterns.md`, `docs/architecture-constitution.md`, `packages/api/src/lib/event-bus.ts`, `packages/api/src/handlers/todo.ts`, `packages/assistant/src/router.ts`
- Impact: Directly copying legacy services into the current handlers layer will harden the wrong boundaries and make later extraction into domain packages more expensive.
- Fix approach: Initialize the roadmap with foundation packages and thin transport seams before porting booking, pricing, calendar, payment, or messaging logic.

**Schema-first intent is ahead of runnable database mechanics:**
- Issue: `docs/drizzle-schema-plan.md` defines extension-backed search, exclusion constraints, trigger-driven invariants, and richer operational flows, but `packages/db/src/schema/marketplace.ts` explicitly omits extension-dependent fields and indexes from the exported runtime schema, and `packages/db/src/triggers.ts` is still an empty placeholder.
- Files: `docs/drizzle-schema-plan.md`, `packages/db/src/schema/marketplace.ts`, `packages/db/src/triggers.ts`, `packages/db/src/test/index.ts`
- Impact: Schema-first work can look complete in docs while production DDL, local tests, and CI still do not exercise the same invariants.
- Fix approach: Split core relational schema from extension-backed search and constraint work; land each phase with committed migrations and extension-aware verification.

**Legacy drift is easy to miss because legacy and docs are excluded from active compilation:**
- Issue: `tsconfig.json` excludes `legacy/**` and `docs/**`. The repo still carries a large brownfield reference tree under `legacy/full-stack-cf-app/`, but TypeScript does not validate any alignment between that code, the ADRs, and the executable packages.
- Files: `tsconfig.json`, `legacy/full-stack-cf-app/`, `docs/ADR/001_legacy-extraction.md`, `docs/ADR/002_architecture-patterns.md`
- Impact: Copying code from legacy paths can import stale assumptions without any automatic detection until after the port is partially integrated.
- Fix approach: Treat legacy code as behavioral reference only; port one domain at a time and lock expected semantics with tests before reusing implementation details.

**Starter/demo surfaces still share the main runtime and schema namespace:**
- Issue: The live schema exports the demo `todo` table alongside marketplace/auth/support/affiliate tables, and the API still exposes `todo` handlers as first-class protected routes.
- Files: `packages/db/src/schema/index.ts`, `packages/db/src/schema/todo.ts`, `packages/api/src/handlers/todo.ts`, `packages/db/scripts/seed-local.mjs`
- Impact: Brownfield initialization can accidentally optimize around starter flows instead of marketplace-critical flows, and the serial-ID demo table introduces a different identity pattern than the text-ID marketplace tables.
- Fix approach: Fence demo surfaces from roadmap acceptance criteria and avoid using `todo` patterns as precedent for marketplace domain design.

**Committed migration history is missing from the database package:**
- Issue: `packages/db/drizzle.config.ts` writes migrations to `packages/db/src/migrations`, but no committed files are detected under that path in the current workspace.
- Files: `packages/db/drizzle.config.ts`, `packages/db/`
- Impact: Environment state depends on the current schema export plus ad hoc `push` behavior instead of a reproducible historical migration chain.
- Fix approach: Establish a baseline migration before high-risk schema work, then require additive, reviewable migrations for every brownfield schema change.

**Avoid direct code copy where semantics already changed:**
- Issue: The ADRs explicitly forbid carrying forward legacy inline side effects, Medusa DSL patterns, and direct SDK usage, while the current repo already has different seams: a notification-recipient event bus in `packages/api/src/lib/event-bus.ts`, direct assistant persistence in `packages/assistant/src/router.ts`, and Better Auth/org middleware as the auth boundary.
- Files: `docs/ADR/001_legacy-extraction.md`, `docs/ADR/002_architecture-patterns.md`, `packages/api/src/lib/event-bus.ts`, `packages/assistant/src/router.ts`, `packages/api/src/context.ts`
- Impact: Bulk copy from `legacy/full-stack-cf-app/` or `cf-boat-api` will reintroduce semantics the target repo has already rejected, especially around auth, events, providers, and orchestration.
- Fix approach: Copy behavior selectively, not files wholesale; re-express each extracted capability in the current repo's auth, event, and transport model.

## Known Bugs

**Affiliate schema semantics drift from the schema plan:**
- Symptoms: `docs/drizzle-schema-plan.md` describes org-scoped referral semantics with nullable org ownership and org-aware uniqueness, while `packages/db/src/schema/affiliate.ts` currently models `affiliateOrganizationId` separately and enforces globally unique referral `code` values.
- Files: `docs/drizzle-schema-plan.md`, `packages/db/src/schema/affiliate.ts`
- Trigger: Reusing the same referral code shape across platform-wide and org-specific affiliate programs, or implementing payout rules from the plan verbatim.
- Workaround: Treat `affiliateReferral.code` as globally unique until the business boundary is locked and verified against real legacy behavior.

**Support-ticket status vocabulary drift from the schema plan:**
- Symptoms: `docs/drizzle-schema-plan.md` describes one ticket lifecycle, but `packages/db/src/schema/support.ts` implements a different enum set (`pending_customer`, `pending_operator`, `escalated`) than the planning document's terminology.
- Files: `docs/drizzle-schema-plan.md`, `packages/db/src/schema/support.ts`
- Trigger: Building APIs, migrations, or admin UI state machines directly from the plan instead of the executable schema.
- Workaround: Derive UI and service logic from `packages/db/src/schema/support.ts` until the plan and schema are reconciled.

**Webhook adapter accepts incomplete authentication states:**
- Symptoms: `CloudPaymentsWebhookAdapter.authenticateWebhook()` accepts any request that merely includes a `Content-HMAC` header, and `processWebhook()` logs data then returns `{ code: 0 }` without domain reconciliation.
- Files: `packages/api/src/payments/webhooks/cloudpayments/adapter.ts`
- Trigger: Sending a webhook with `Content-HMAC` present but not actually verified.
- Workaround: Use Basic Auth in controlled environments; do not treat the current adapter as production-grade verification logic.

## Security Considerations

**Payment webhook authenticity is not fully enforced:**
- Risk: A forged webhook can be accepted if it includes a `Content-HMAC` header because the adapter checks header presence, not signature correctness.
- Files: `packages/api/src/payments/webhooks/cloudpayments/adapter.ts`
- Current mitigation: Basic Auth is supported, and the adapter restricts payload parsing to expected content types.
- Recommendations: Verify HMAC cryptographically, bind the verification flow to `organization_payment_config.webhookEndpointId`, and reject all unverified requests before business logic runs.

**Seed credentials are deterministic and visible in script output:**
- Risk: `packages/db/scripts/seed-local.mjs` creates fixed logins (`admin@admin.com / admin`, `operator@example.com / operator`) and prints them after seeding.
- Files: `packages/db/scripts/seed-local.mjs`
- Current mitigation: The script is explicitly local/dev oriented.
- Recommendations: Keep seed users out of shared environments, avoid reusing seed credentials in staging, and document that seeded auth is disposable-only.

**Legacy references can bypass current security boundaries when copied verbatim:**
- Risk: The target repo uses Better Auth and middleware-driven authorization in `packages/api/src/context.ts`, while the ADRs describe extracting code from legacy services that previously owned more auth and side-effect logic themselves.
- Files: `docs/ADR/001_legacy-extraction.md`, `docs/ADR/002_architecture-patterns.md`, `packages/api/src/context.ts`
- Current mitigation: The current repo already centralizes auth context and organization membership lookup.
- Recommendations: Rebind every extracted operation to the current middleware/context model instead of porting legacy auth checks inline.

## Performance Bottlenecks

**Request context performs per-request membership lookup and queue setup:**
- Problem: `packages/api/src/context.ts` resolves session state, performs organization membership queries, and allocates queue producers for every request.
- Files: `packages/api/src/context.ts`
- Cause: Context creation is the central composition point for both authenticated and non-mutating requests.
- Improvement path: Keep queue creation lazy and cache/memoize org membership where safe; avoid paying the same setup cost on low-value read paths.

**Test/database bootstrap favors convenience over extension realism:**
- Problem: `packages/db/src/test/index.ts` pushes the schema into an in-memory PGlite database before tests, while `packages/db/src/schema/marketplace.ts` omits extension-backed features to stay compatible with that harness.
- Files: `packages/db/src/test/index.ts`, `packages/db/src/schema/marketplace.ts`
- Cause: The current test stack cannot execute the same extension-backed DDL that the schema plan requires.
- Improvement path: Add an extension-aware Postgres test lane for schema-first features instead of stretching PGlite beyond the business model.

**Local seeding scales poorly as brownfield fixture complexity grows:**
- Problem: `packages/db/scripts/seed-local.mjs` clears and upserts rows sequentially and only seeds starter entities.
- Files: `packages/db/scripts/seed-local.mjs`
- Cause: The seeding flow is hand-authored for a small starter baseline rather than replaying realistic marketplace states.
- Improvement path: Introduce domain-specific fixture builders and replayable snapshots for brownfield migration checkpoints.

## Fragile Areas

**The event-bus seam is mid-migration by design:**
- Files: `packages/api/src/lib/event-bus.ts`, `docs/ADR/001_legacy-extraction.md`, `docs/ADR/002_architecture-patterns.md`
- Why fragile: The current event bus only batches notification-recipient events, while the target architecture expects a typed `DomainEvent` registry with multiple subscribers and queues. Any extraction that assumes the target bus already exists will overfit to docs instead of runtime.
- Safe modification: Extract the event foundation before porting payment, booking, calendar, or messaging side effects.
- Test coverage: No `packages/events/**` package exists yet, so target-state event semantics are not covered in isolation.

**Extension-backed schema work is blocked by the current test harness shape:**
- Files: `packages/db/src/schema/marketplace.ts`, `packages/db/src/test/index.ts`, `packages/db/src/triggers.ts`
- Why fragile: The code intentionally withholds parts of the planned schema to keep tests passing in PGlite. Adding pgvector, pg_textsearch, earthdistance, exclusion constraints, or trigger SQL without changing the harness will create a split-brain schema story.
- Safe modification: Introduce migration-backed Postgres verification first, then land extension features in small slices.
- Test coverage: Current tests do not exercise extension-backed DDL or trigger behavior.

**Assistant chat persistence carries historical message-format debt:**
- Files: `packages/assistant/src/router.ts`
- Why fragile: `sanitizeParts()` repairs legacy tool-part shapes at read time, which means stored chat history already spans multiple message semantics.
- Safe modification: Preserve backward-compatible message decoding and add fixture coverage before changing tool-call persistence or AI SDK message formats.
- Test coverage: No brownfield compatibility fixtures are detected for historical assistant message payloads.

**Plan/schema mismatches create hidden modeling traps:**
- Files: `docs/drizzle-schema-plan.md`, `packages/db/src/schema/affiliate.ts`, `packages/db/src/schema/support.ts`
- Why fragile: Affiliate and support models already differ between planning docs and runnable schema. Similar drifts are likely in areas that have not yet been extracted from legacy code.
- Safe modification: Reconcile one domain's vocabulary and invariants end-to-end before using the docs as scaffolding for adjacent domains.
- Test coverage: No legacy-parity tests are detected for affiliate or support business semantics.

## Scaling Limits

**Schema evolution process:**
- Current capacity: The repo has one current schema export in `packages/db/src/schema/index.ts`, local seed scripts in `packages/db/scripts/seed-local.mjs`, and Drizzle configured to emit migrations into `packages/db/src/migrations`.
- Limit: Once multiple environments diverge, the absence of committed migrations and database-state snapshots makes rollback and replay increasingly manual.
- Scaling path: Lock a baseline migration, add deterministic environment replay, and treat every schema change as an auditable migration step.

**Legacy extraction throughput:**
- Current capacity: The repo can absorb one carefully scoped extraction at a time by comparing `docs/ADR/001_legacy-extraction.md` with current executable files.
- Limit: Parallel extraction across booking, pricing, payments, messaging, and calendar will amplify drift because the target domain packages do not exist yet.
- Scaling path: Sequence extraction domain-by-domain behind stable foundation packages and contract tests.

## Dependencies at Risk

**Drizzle beta toolchain:**
- Risk: Both the root workspace and `packages/db/package.json` pin `drizzle-orm` and `drizzle-kit` to `1.0.0-beta.16-2ffd1a5`.
- Impact: Schema, migration, and push behavior can shift under a beta API surface during the heaviest schema-first work.
- Migration plan: Freeze the schema rollout on a known-good version, generate a baseline migration set, and upgrade Drizzle separately from brownfield extraction.

**PGlite-backed schema tests:**
- Risk: `@electric-sql/pglite` is a dev dependency in `packages/db/package.json`, and `packages/db/src/test/index.ts` depends on it for schema tests.
- Impact: The current test strategy cannot represent the extension-heavy Postgres features described in `docs/drizzle-schema-plan.md`.
- Migration plan: Keep PGlite for fast unit/schema sanity checks, but add a real Postgres verification lane for extension, trigger, and migration behavior.

## Missing Critical Features

**Foundational extraction packages are still absent:**
- Problem: The planned packages `packages/events`, `packages/workflows`, `packages/booking`, `packages/pricing`, `packages/calendar`, and `packages/payments` are not present, even though `docs/ADR/001_legacy-extraction.md` and `docs/ADR/002_architecture-patterns.md` make them the primary execution model.
- Blocks: Clean domain extraction, typed event subscribers, workflow-based compensation, and thin handler boundaries.

**Database migration and snapshot baseline is missing:**
- Problem: The repo has local seed scripts and UI snapshot files, but no committed DB migration history under `packages/db/src/migrations/` and no database snapshot/replay artifacts were detected. Snapshot files detected in the workspace are UI-oriented (`packages/e2e-web/e2e/ui-snapshots.spec.ts`, `packages/e2e-web/playwright.snapshots.config.ts`), not data-state baselines.
- Blocks: Safe brownfield initialization, deterministic rollback, and repeatable validation of schema-first changes against representative states.

**Search/geo/vector capabilities from the schema plan are not live in the exported schema:**
- Problem: The plan depends on pgvector, BM25/`pg_textsearch`, and geo/search extensions, while `packages/db/src/schema/marketplace.ts` intentionally omits those runtime fields and indexes.
- Blocks: Real marketplace search, semantic retrieval, and confidence that future search work matches the documented data model.

**Legacy-parity verification harness is missing:**
- Problem: The repo contains the legacy reference tree and ADR mapping, but no dedicated package-level parity tests for extracted booking, pricing, calendar, payment, support, or affiliate behavior are detected.
- Blocks: Safe extraction without semantic regressions and the ability to reject direct code copy when meanings differ.

## Test Coverage Gaps

**Extension-aware database behavior is untested:**
- What's not tested: pgvector, pg_textsearch, earthdistance, exclusion constraints, and trigger-backed invariants from `docs/drizzle-schema-plan.md`.
- Files: `packages/db/src/schema/marketplace.ts`, `packages/db/src/test/index.ts`, `packages/db/src/triggers.ts`
- Risk: Schema-first work can pass local tests while failing in real Postgres.
- Priority: High

**Brownfield marketplace flows do not have executable package tests yet:**
- What's not tested: Extraction-target domains described in `docs/ADR/001_legacy-extraction.md` because the destination packages (`packages/booking`, `packages/pricing`, `packages/calendar`, `packages/payments`, `packages/events`, `packages/workflows`) are not present.
- Files: `docs/ADR/001_legacy-extraction.md`, `docs/ADR/002_architecture-patterns.md`
- Risk: Domain behavior will be recreated from prose and legacy code by hand, which increases semantic drift.
- Priority: High

**Seeds and e2e fixtures do not model brownfield marketplace states:**
- What's not tested: Realistic booking/payment/support/affiliate migration scenarios; current seeds center on auth, notifications, assistant chat, and todos.
- Files: `packages/db/scripts/seed-local.mjs`, `packages/e2e-web/e2e/seed-login.spec.ts`, `packages/e2e-web/e2e/ui-snapshots.spec.ts`, `packages/api/src/handlers/todo.ts`
- Risk: Hidden migration traps stay invisible until domain extraction starts.
- Priority: High

**Historical assistant message compatibility lacks explicit fixture coverage:**
- What's not tested: Legacy tool-part payload variants handled by `sanitizeParts()` in the assistant router.
- Files: `packages/assistant/src/router.ts`
- Risk: AI chat history can silently degrade when message-part semantics change during upgrades or extraction.
- Priority: Medium

## Recommended Sequencing Note

Start initialization with a **brownfield safety baseline**, not with feature extraction: first commit a baseline migration chain for `packages/db`, add one representative database-state replay strategy beyond `packages/db/scripts/seed-local.mjs`, and stand up the missing `packages/events` and `packages/workflows` foundations. After that, extract the lowest-side-effect domains first (pricing/catalog-style read and calculation logic), then move booking orchestration, and only then port payment, calendar, and messaging integrations. Throughout the roadmap, use `legacy/full-stack-cf-app/` and the ADRs as behavioral reference, but avoid direct code copy anywhere the semantics already changed in `packages/api/src/lib/event-bus.ts`, `packages/api/src/context.ts`, `packages/assistant/src/router.ts`, or `packages/db/src/schema/*.ts`.

---

*Concerns audit: 2026-03-09*
