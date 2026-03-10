---
phase: 09-operator-catalog-booking-intake-wiring
plan: "01"
subsystem: ui
tags: [svelte, tanstack-query, orpc, catalog, operator-ui]

requires:
  - phase: 03-org-access-catalog-storefront
    provides: "listing contracts, handlers, and published storefront foundations"
provides:
  - "Operator listings index inside the existing /org shell"
  - "Shared create/edit listing form backed by the typed listing API"
  - "Live publish and unpublish controls for organization listings"
affects: [web, catalog, operator-workflows]

tech-stack:
  added: []
  patterns:
    - "Operator management surfaces live under the existing /org shell instead of a separate dashboard namespace"
    - "Shared Svelte forms can keep mutations in route-level owners while JSON metadata validation stays in the reusable form component"

key-files:
  created:
    - apps/web/src/routes/(app)/org/listings/+page.svelte
    - apps/web/src/routes/(app)/org/listings/new/+page.svelte
    - apps/web/src/routes/(app)/org/listings/[id]/+page.svelte
    - apps/web/src/components/org/ListingEditorForm.svelte
    - apps/web/src/components/org/ListingPublicationButton.svelte
  modified:
    - apps/web/src/routes/(app)/org/+layout.svelte

key-decisions:
  - "The listings surface stays inside the authenticated /org shell to reuse the existing organization guard and navigation"
  - "Listing metadata is edited as JSON text with client-side object validation instead of introducing a new schema-driven form layer in this phase"
  - "Edit mode keeps slug and listing type visible but read-only because the current update contract does not accept those fields"

patterns-established:
  - "Invalidate oRPC listing cache keys after organization listing mutations and navigate back to the index on success"
  - "Use plain href strings for freshly added sibling routes when route-generation typing would otherwise block staged task commits"

requirements-completed:
  - AUTH-01
  - CATL-01
  - CATL-02

duration: "n/a"
completed: 2026-03-10
---

# Phase 09 Plan 01: Operator listings UI summary

**Operator `/org/listings` management UI with live create/edit flows and marketplace publish controls**

## Performance

- **Duration:** n/a
- **Started:** n/a
- **Completed:** 2026-03-10T12:44:17Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added a `Listings` tab to the existing authenticated org shell and built `/org/listings` as a live listings index backed by `orpc.listing.list`.
- Added self-contained publish/unpublish controls with inline pending/error UI and listing cache invalidation.
- Added `/org/listings/new` and `/org/listings/[id]` routes with a shared `ListingEditorForm` that validates metadata JSON client-side before calling the typed listing mutations.

## Task Commits

1. **Task 1: Add the org listings index and live publish/unpublish controls** — `b6bd292` (`feat`)
2. **Task 2: Add create/edit listing routes with a shared editor form** — `daab0f8` (`feat`)
3. **Plan metadata:** `c41fd4f`

## Files Created/Modified

- `apps/web/src/routes/(app)/org/+layout.svelte` - Adds the Listings tab to the org navigation.
- `apps/web/src/routes/(app)/org/listings/+page.svelte` - Renders the operator listings index with live API data.
- `apps/web/src/routes/(app)/org/listings/new/+page.svelte` - Hosts the create-listing flow under the org shell.
- `apps/web/src/routes/(app)/org/listings/[id]/+page.svelte` - Hosts the edit-listing flow backed by `orpc.listing.get` and `orpc.listing.update`.
- `apps/web/src/components/org/ListingEditorForm.svelte` - Shared create/edit form with client-side metadata JSON validation.
- `apps/web/src/components/org/ListingPublicationButton.svelte` - Publish/unpublish action component with inline state handling.

## Decisions Made

- Kept all operator catalog work inside the existing `/org` shell so the phase satisfies the live AUTH-01 requirement without creating a second operator namespace.
- Used the current listing contract directly, keeping listing type and slug read-only in edit mode rather than expanding the update API.
- Validated metadata as a JSON object in the shared form to catch malformed payloads before they reach the typed mutation boundary.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- New sibling routes referenced from `/org/listings` were not yet part of generated route typing during Task 1, so the index used plain href strings until Task 2 added those routes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Operators can now manage listings through the live app, which clears the way for the customer-side quote-to-booking flow in `09-03`.
- The publish/unpublish action still assumes the marketplace channel, which matches the phase scope and current contract.

---
*Phase: 09-operator-catalog-booking-intake-wiring*
*Completed: 2026-03-10*
