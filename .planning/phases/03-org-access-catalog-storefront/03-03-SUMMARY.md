# 03-03 Summary: Storefront Service (TDD) + Public API + SvelteKit Pages

## Status: Complete

## TDD Cycle

**RED:** `storefront-service.test.ts` written first — 8 tests all failed (module not found). Committed: `9f74dba`.

**GREEN:** `storefront-service.ts` implemented — all 8 tests pass. Committed: `7ef14a8`.

## What Was Built

### packages/catalog (extended)

**`src/storefront-service.ts`** — public listing browse:
- `searchPublishedListings(input, db)` — Drizzle `innerJoin` on `listingPublication` (isActive=true, channelType='platform_marketplace') + `leftJoin` on `listingAsset` (isPrimary=true, kind='image'). Filters by `type` (eq on `listingTypeSlug`) and `q` (ilike on `name`). Returns `{ items, total }`.
- `getPublishedListing(id, db)` — same join, throws `Error("NOT_FOUND")` if not published.

8 tests in `storefront-service.test.ts`:
- searchPublishedListings: 5 tests (returns published only, primary image key, type filter, keyword filter, excludes unpublished)
- getPublishedListing: 3 tests (returns detail, NOT_FOUND for unpublished, NOT_FOUND for nonexistent)

### packages/api-contract/src/routers/storefront.ts (new)
2 procedures: `storefront.list`, `storefront.get` — tagged `["Storefront"]`, no auth required

### packages/api-contract/src/routers/index.ts (modified)
Added `storefront: storefrontContract`

### packages/api/src/handlers/storefront.ts (new)
Uses `publicProcedure` (unauthenticated). `get` translates `Error("NOT_FOUND")` to `ORPCError("NOT_FOUND")`.

### packages/api/src/handlers/index.ts (modified)
Added `storefront: storefrontRouter`

### apps/web/src/routes/(public)/ (new route group)
- `+layout.svelte` — minimal layout, no auth check
- `listings/+page.svelte` — browse with type + keyword filters, `orpc.storefront.list.queryOptions({ input: {...} })`, grid layout
- `listings/[id]/+page.svelte` — detail with `orpc.storefront.get.queryOptions({ input: { id } })`, full listing info

## Key Decisions

- Storefront is fully public — `publicProcedure`, no auth required
- Domain error pattern: service throws `Error("NOT_FOUND")`, handler translates to `ORPCError("NOT_FOUND")`
- `primaryImageKey` maps to `listingAsset.storageKey` — actual image serving is not in Phase 3 scope
- `queryOptions` API uses `{ input: {...} }` wrapper (not flat spread)

## All Tests

- `@my-app/auth`: 27 tests pass (17 RBAC + 10 auth)
- `@my-app/catalog`: 18 tests pass (10 listing-service + 8 storefront-service)
- `web`: 0 svelte-check errors
- All packages: 0 TypeScript errors

## Commits

- `9f74dba` — test(03-03): add failing storefront-service tests [RED]
- `7ef14a8` — feat(03-03): implement storefront service [GREEN]
- `8a5c4c9` — feat(03-03): storefront oRPC routes and SvelteKit listings pages
