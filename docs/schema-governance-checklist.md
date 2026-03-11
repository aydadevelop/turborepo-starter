# Schema Governance Checklist

Use this checklist for every `@my-app/db` schema or migration change. It operationalizes
[ADR-010](./ADR/010_schema_modernization_constitution.md) on top of the baseline conventions in
[ADR-006](./ADR/006_postgres_drizzle_beta16_best_practices.md).

## IDs

- New non-auth app-owned tables use PostgreSQL `uuid` PKs and FKs.
- Better Auth-owned tables are the only default exemption.
- No new `serial`.
- No new app-assigned text PKs unless the table is explicitly whitelisted.

## Foreign Keys And Indexes

- Every FK has a supporting index, or an explicit documented whitelist entry.
- Hot-path lookup columns and idempotency keys have selective or unique indexes where needed.

## JSONB And Arrays

- `jsonb` is used only for opaque metadata or provider payloads.
- Homogeneous scalar lists use native Postgres arrays, not JSONB arrays.
- Repeatedly queried config is moved into typed columns or child tables.

## Invariants

- Money and count fields are non-negative.
- Basis points are constrained to `0..10000`.
- Ratings, latitude, longitude, and quiet-hours fields have DB checks.
- Windowed records encode `starts_at < ends_at` where the rule is unambiguous.
- Lifecycle states requiring timestamps or actor columns are enforced in DDL where practical.

## Mutation Style

- Uniqueness and idempotency are enforced by constraints first.
- Write paths use `onConflict`, unique indexes, or transactional arbitration instead of pre-read duplicate checks where possible.

## Test Lanes

- `bun run test` in `packages/db` stays green.
- DDL-sensitive changes are replayed against PG18, not only PGlite.
- New invariants or indexes get focused tests that prove invalid rows are rejected.

## Meta Guards

- The change does not reintroduce unindexed FKs.
- The change does not reintroduce `serial`.
- The change does not add new non-auth text PKs.
- The change does not add JSONB scalar arrays.
