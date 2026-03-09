# 03-02 Summary: Catalog Package + Listing oRPC Contract

## Status: Complete

## What Was Built

Scaffolded `packages/catalog` as `@my-app/catalog` domain package with listing CRUD and publication services, defined the `listing` oRPC contract in `packages/api-contract`, and wired thin handlers in `packages/api`.

## Packages Created / Modified

### packages/catalog (new)
- `src/types.ts` — `Db`, `ListingRow`, `ListingPublicationRow`, `CreateListingInput`, `UpdateListingInput`, `ListListingsInput`, `PublishListingInput`
- `src/listing-service.ts` — `createListing`, `updateListing`, `listListings`, `getListing` (all take `db` as parameter for testability)
- `src/publication-service.ts` — `publishListing` (upsert pattern), `unpublishListing`
- `src/index.ts` — barrel export
- `src/__tests__/listing-service.test.ts` — 10 tests using PGlite/bootstrapTestDatabase

### packages/api-contract/src/routers/listing.ts (new)
6 procedures: `create`, `update`, `get`, `list`, `publish`, `unpublish`

### packages/api-contract/src/routers/index.ts (modified)
Added `listing: listingContract`

### packages/api/src/handlers/listing.ts (new)
Thin handlers using `organizationPermissionProcedure({ listing: [...] })`, delegates to catalog services, formats timestamps as ISO strings

### packages/api/src/handlers/index.ts (modified)
Added `listing: listingRouter`

### packages/api/package.json (modified)
Added `@my-app/catalog: workspace:*` dependency

## Key Decisions

- Service functions accept `db` as parameter (not module singleton) for testability; tests cast with `as unknown as Db`
- `publishListing` is idempotent: checks for existing publication before inserting, updates `isActive=true` if found
- `organizationId` always from `context.activeMembership` in handlers, never from client input
- `listListings` returns pagination-ready (limit/offset) but `total` is `items.length` (not a full COUNT query) — sufficient for Phase 3

## Tests

10 tests in `listing-service.test.ts`:
- createListing: 2 tests (draft status, description/metadata)
- updateListing: 2 tests (updates name/desc, throws NOT_FOUND for wrong org)
- listListings: 1 test (returns org listings)
- getListing: 2 tests (found, NOT_FOUND)
- publishListing: 2 tests (sets active + creates publication, idempotency)
- unpublishListing: 1 test (sets inactive)

All 10 pass.

## Commits

`6094b9d` — feat(03-02): scaffold catalog package and wire listing oRPC contract
