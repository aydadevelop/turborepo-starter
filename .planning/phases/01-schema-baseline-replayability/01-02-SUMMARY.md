# Plan 01-02 Summary

**Phase:** 01-schema-baseline-replayability  
**Plan:** 02 — Marketplace Seed Scenarios & Shared Fixture Builders  
**Status:** Complete  
**Completed:** 2026-03-09

## What Was Built

Added a representative marketplace scenario to both the local seed script (raw SQL / `pg`) and the PGlite test harness (Drizzle ORM), ensuring both development and test environments share the same baseline data story.

## Key Files

### Created
- `packages/db/src/test/fixtures/marketplace.ts` — Drizzle-ORM fixture builder with `seedMarketplaceScenario(db, options)` and the `MARKETPLACE_IDS` constant map. Seeds: org → listing type config → org settings → listing → pricing profile → payment provider config → org payment config → publication → cancellation policy → booking (confirmed, paid, 4h, 1.2M RUB).

### Modified
- `packages/db/scripts/cleanup-tables.mjs` — Added 10 marketplace tables in FK-safe (children-first) order before existing auth tables: `booking_cancellation_request`, `booking`, `listing_publication`, `cancellation_policy`, `listing_pricing_profile`, `listing`, `organization_payment_config`, `organization_settings`, `payment_provider_config`, `listing_type_config`.
- `packages/db/scripts/seed-local.mjs` — Added marketplace seed data to `buildSeedData` (9 table sets) and `writeSeedData` (FK-ordered insert), plus updated console.log to report listing and booking counts.
- `packages/db/src/__tests__/database.test.ts` — Added "Marketplace scenario fixture" describe block with 4 tests: org+listing, booking amounts, listing publication, and cancellation policy.

## Tasks Completed

| Task | Status | Commit |
|------|--------|--------|
| T1: Marketplace fixture builder (marketplace.ts) | ✓ Done | 90b24bd |
| T2: Wire into DB tests (database.test.ts) | ✓ Done | 90b24bd |
| T3: seed-local.mjs + cleanup-tables.mjs updates | ✓ Done | 90b24bd |
| T3: Bootstrap alignment verify | ✓ Done | 90b24bd |

## Deviations

- **[Schema discovery]** `organization` table has no `updatedAt` column (better-auth plugin schema). Fixture builder uses `onConflictDoNothing` to handle pre-seeded auth rows.
- **[Schema discovery]** `cancellationPolicy` uses `freeWindowHours` (not `freeCancellationWindowHours`) and no `isDefault` field — unique index `cancellation_policy_uq_org_scope` enforces one policy per (org, scope).
- **[Schema discovery]** Booking price fields are `basePriceCents`, `discountAmountCents`, `totalPriceCents`, `platformCommissionCents` — not `totalAmountCents` or `depositAmountCents`.
- `organizationSettings.id` in fixture uses `${operatorOrgId}_settings` pattern (= `seed_org_starter_settings`), matching what seed-local.mjs writes.

## Verification

- `bun run test` — 29/29 tests pass (5 migration + 24 database including 4 new marketplace fixture tests) ✓
- `bun run check-types` — no errors ✓
- `node packages/db/scripts/seed-local.mjs` — seeded: 1 listing, 1 booking ✓
- `node packages/db/scripts/bootstrap-local-e2e.mjs` — reset → migrate → seed all pass ✓

## Self-Check: PASSED
