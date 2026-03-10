# Phase 09: operator-catalog-booking-intake-wiring — Research

**Researched:** 2026-03-10
**Domain:** live operator catalog wiring + public quote-to-booking intake
**Confidence:** HIGH — findings verified against `apps/web`, `packages/api-contract`, `packages/api`, `packages/catalog`, `packages/booking`, Phases 03/04/05/08 summaries, and the milestone audit

## Summary

Phase 09 is a **live-path wiring** phase, not a domain-extraction phase. The underlying domain and transport seams already exist:
- operators already have typed listing CRUD + publish/unpublish contracts in `packages/api-contract/src/routers/listing.ts` and thin handlers in `packages/api/src/handlers/listing.ts`
- customers already have public quote + slot-check endpoints in `packages/api-contract/src/routers/pricing.ts` and `packages/api-contract/src/routers/availability.ts`
- booking creation already exists in `packages/booking/src/booking-service.ts`, but it still trusts `organizationId` and `publicationId` from the client

There is **no `09-CONTEXT.md`**. Planning should therefore follow the roadmap, requirements, existing summaries, and `.planning/v1.0-v1.0-MILESTONE-AUDIT.md` as the source of truth.

**Primary recommendation:**
1. Put the operator listing-management UI under the existing `/org` route group instead of inventing a second dashboard namespace.
2. Reuse the existing `orpc.listing.*` typed surfaces for create/update/publish/unpublish; do **not** add a new listing-management API for this phase.
3. Remove `organizationId` and `publicationId` from the public `booking.create` input and resolve the active marketplace publication server-side from `listingId`.
4. Reuse the existing public `pricing.getQuote` and `availability.checkSlot` endpoints from the listing detail page to power a booking-intake panel.
5. Add no new external dependencies. The repo already has the required auth, query, UI, and API tooling.

---

## Standard Stack

### Existing stack only — no installs needed

| Area | Use | Notes |
|---|---|---|
| Web app | `apps/web` SvelteKit + Svelte 5 | Existing `(app)` and `(public)` route groups already match the required UX split |
| Queries / mutations | `@tanstack/svelte-query@6` via `createTanstackQueryUtils` | Always wrap options in a function; invalidate via `orpc.<resource>.key()` |
| Web auth | `authClient.useSession()` + `OrgGuard` + `orpc.canManageOrganization` | Already used by `/org`, `/dashboard`, and header navigation |
| Operator listing transport | `orpc.listing.create/update/get/list/publish/unpublish` | Existing typed contract/handler pair is already live |
| Public quote lookup | `orpc.pricing.getQuote` | Public endpoint; already backed by `calculateQuote()` |
| Public slot check | `orpc.availability.checkSlot` | Public endpoint; already backed by availability service |
| Booking mutation | `orpc.booking.create` | Must be hardened so it resolves org/publication context server-side |
| UI primitives | `@my-app/ui` button/card/input/label/dialog | Reuse existing components; no new design-system package work |

### Relevant package scripts

| Package | Verification command |
|---|---|
| `apps/web` | `cd /Users/d/Documents/Projects/turborepo-alchemy && bun run check-types --filter=web` |
| `@my-app/booking` | `cd /Users/d/Documents/Projects/turborepo-alchemy && bun run --filter @my-app/booking test` |
| `@my-app/api` + `@my-app/api-contract` | `cd /Users/d/Documents/Projects/turborepo-alchemy && bun run check-types --filter=@my-app/api --filter=@my-app/api-contract` |

---

## Architecture Patterns

### Pattern 1: Extend the existing `/org` management shell

`apps/web/src/routes/(app)/org/+layout.svelte` already:
- requires an authenticated session
- checks `orpc.canManageOrganization`
- renders the tab-style org navigation

That makes `/org/listings` the repo-native home for operator listing management. Do **not** build a separate admin surface for Phase 09.

### Pattern 2: Reuse current listing transport instead of inventing a second catalog API

The operator listing flow can be completed with the current listing contract:
- `create`
- `update`
- `get`
- `list`
- `publish`
- `unpublish`

The current listing output already exposes `status` and `isActive`, which is sufficient for the phase’s platform-marketplace publish/unpublish UX:
- draft listing → `status: "draft", isActive: true`
- published listing → `status: "active", isActive: true`
- unpublished listing → `status: "inactive", isActive: false`

**Recommendation:** Keep the operator UI on top of the current contract. Avoid a new listing-type discovery API unless execution reveals a blocker.

### Pattern 3: Use self-contained Svelte components for row/form actions

The repo’s Svelte guidance favors self-contained components for repeated actions. For Phase 09 that means:
- a reusable `ListingEditorForm.svelte` for create/edit pages
- a self-contained publish/unpublish action component for each listing row/card
- a self-contained `BookingRequestPanel.svelte` on the public listing detail page

This keeps route pages small and keeps mutation logic close to the UI that triggers it.

### Pattern 4: TanStack Query v6 rules matter here

Phase 09 heavily depends on query/mutation correctness. Follow these repo-specific rules:
- `createQuery(() => ({ ... }))` or `createQuery(() => orpc.resource.action.queryOptions({ input }))`
- `createMutation(() => orpc.resource.action.mutationOptions({ onSuccess }))`
- invalidate with `queryClient.invalidateQueries({ queryKey: orpc.resource.key() })`
- do **not** store server data in `$state`
- access results directly as `query.data`, `query.isPending`, etc.

### Pattern 5: Booking context must be resolved server-side from `listingId`

The milestone audit identified the core bug precisely:
- `packages/api-contract/src/routers/booking.ts` accepts `organizationId` and `publicationId` from the client
- `packages/api/src/handlers/booking.ts` forwards those values directly into `createBooking`
- `packages/booking/src/booking-service.ts` inserts the booking without verifying publication ownership or listing-publication-organization consistency

**Recommendation:** Change the public booking input so the client sends only booking-intake data:
- `listingId`
- selected slot
- passengers/contact fields
- optional notes/timezone/currency

Then inside `createBooking()`:
1. load the active `platform_marketplace` publication for the listing
2. ensure the listing is active/published
3. ensure `listing.organizationId === listingPublication.organizationId`
4. derive `organizationId`, `publicationId`, and `merchantOrganizationId` from that query result
5. continue into slot check + quote + insert

This is the cleanest way to satisfy `AUTH-03` and the audit’s “no client-trusted organization/publication context” requirement.

### Pattern 6: Public discovery remains public; booking submission remains protected

The current architecture already supports the desired split:
- `storefront.get`, `pricing.getQuote`, and `availability.checkSlot` are public
- `booking.create` is protected

Phase 09 should preserve that split:
- visitors can inspect listing detail, slot availability, and pricing without a session
- only authenticated users can submit the final booking request
- unauthenticated submit attempts should redirect to `/login?next=...` rather than trying to weaken the booking protection boundary

---

## Validation Architecture

### Plan 09-01 — Operator listing management in `apps/web`

**Primary checks**
- `cd /Users/d/Documents/Projects/turborepo-alchemy && bun run check-types --filter=web`

**What this proves**
- new `/org/listings` routes compile inside the existing auth/org shell
- `orpc.listing.*` query and mutation usage matches the contract
- Svelte 5 / TanStack Query usage remains type-safe

### Plan 09-02 — Booking intake hardening (server-side context resolution)

**Primary checks**
- `cd /Users/d/Documents/Projects/turborepo-alchemy && bun run --filter @my-app/booking test`
- `cd /Users/d/Documents/Projects/turborepo-alchemy && bun run check-types --filter=@my-app/booking --filter=@my-app/api --filter=@my-app/api-contract`

**What this proves**
- `createBooking()` resolves publication/org context from `listingId`
- unpublished or inconsistent publication rows fail deterministically
- the public contract no longer accepts client-trusted org/publication fields

### Plan 09-03 — Public quote-to-booking UI

**Primary checks**
- `cd /Users/d/Documents/Projects/turborepo-alchemy && bun run check-types --filter=web`

**What this proves**
- listing detail UI composes pricing, availability, auth-session, and booking mutation correctly
- the page consumes the hardened booking contract without reintroducing org/publication inputs on the client

---

## Risks and Pitfalls

### Pitfall 1: Reintroducing org/publication trust in the browser

A tempting but wrong path is to expose `organizationId` or `publicationId` from the storefront page and then feed it back into `booking.create`.

**Avoid this.** The booking mutation should accept `listingId` plus booking-intake fields only.

### Pitfall 2: Building Phase 09 under `/dashboard`

`/dashboard` exists, but it is effectively empty. `/org` already has the auth, management guard, and navigation patterns needed for operator work.

**Recommendation:** Add a `Listings` tab under `/org` and keep the route family there.

### Pitfall 3: Adding a new listing-management backend “just for the UI”

The listing CRUD + publish/unpublish surfaces already exist and are typed. Adding a parallel transport layer would create drift for no Phase 09 value.

### Pitfall 4: Using store data patterns that belong to TanStack Query v5, not v6

This repo uses TanStack Query v6 in Svelte 5:
- use function-wrapped options
- read `query.data` directly
- invalidate the cache instead of calling `.refetch()` on one subscriber

### Pitfall 5: Expanding Phase 09 into payment or event-system work

The milestone audit already assigns those gaps to Phases 10 and 11. Phase 09 should stop at:
- operator listing management in the live app
- public quote/slot discovery in the live app
- protected booking request submission with server-trusted context

---

## Recommended Plan Split

### Wave 1 (parallel)

1. **Operator listing management UI**
   - add `/org/listings`
   - add create/edit routes
   - add publish/unpublish UI

2. **Booking intake hardening**
   - change `booking.create` input contract
   - harden `createBooking()` to resolve publication/org context server-side
   - add tests for unpublished / mismatched publication cases

### Wave 2

3. **Quote-to-booking UI on listing detail**
   - add booking request panel to `/listings/[id]`
   - reuse public quote + slot-check queries
   - call the hardened protected booking mutation

This split keeps file ownership clean and lets the UI plans build on stable transport contracts.

---

## Sources

### Primary (HIGH confidence)
- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `.planning/STATE.md`
- `.planning/v1.0-v1.0-MILESTONE-AUDIT.md`
- `.planning/phases/03-org-access-catalog-storefront/03-02-SUMMARY.md`
- `.planning/phases/03-org-access-catalog-storefront/03-03-SUMMARY.md`
- `.planning/phases/04-availability-pricing-core/04-03-SUMMARY.md`
- `.planning/phases/05-booking-core-customer-access/05-02-SUMMARY.md`
- `.planning/phases/05-booking-core-customer-access/05-03-SUMMARY.md`
- `apps/web/src/routes/(app)/org/+layout.svelte`
- `apps/web/src/routes/(public)/listings/+page.svelte`
- `apps/web/src/routes/(public)/listings/[id]/+page.svelte`
- `apps/web/src/lib/orpc.ts`
- `packages/api-contract/src/routers/listing.ts`
- `packages/api-contract/src/routers/booking.ts`
- `packages/api-contract/src/routers/pricing.ts`
- `packages/api-contract/src/routers/availability.ts`
- `packages/api/src/handlers/listing.ts`
- `packages/api/src/handlers/booking.ts`
- `packages/api/src/handlers/pricing.ts`
- `packages/catalog/src/publication-service.ts`
- `packages/booking/src/booking-service.ts`
- `packages/booking/src/__tests__/booking-service.test.ts`

## Metadata

**Confidence breakdown:**
- route placement and UI shell reuse: HIGH
- booking-intake hardening recommendation: HIGH
- need for new dependencies: HIGH confidence that none are required
- phase split into parallel waves: HIGH

**Research date:** 2026-03-10
**Validity:** valid until the listing/booking contract surfaces or org route shell change materially
