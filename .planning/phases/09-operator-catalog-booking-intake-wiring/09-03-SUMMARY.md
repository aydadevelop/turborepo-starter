---
phase: 09-operator-catalog-booking-intake-wiring
plan: "03"
subsystem: ui
tags: [svelte, tanstack-query, booking, storefront, availability, pricing]

requires:
  - phase: 09-operator-catalog-booking-intake-wiring
    provides: "server-trusted booking.create contract from 09-02"
  - phase: 03-org-access-catalog-storefront
    provides: "public listing detail page and storefront.get query"
  - phase: 04-availability-pricing-core
    provides: "public quote and slot-check APIs"
provides:
  - "Self-contained public booking request panel for listing detail pages"
  - "Live quote, availability, and protected booking submission in the public web app"
  - "Auth-gated booking submission without reintroducing client-trusted org/publication state"
affects: [web, storefront, booking-intake]

tech-stack:
  added: []
  patterns:
    - "Public listing detail pages can host live quote and availability previews while the final booking mutation remains protected"
    - "Booking request UI stays self-contained, with slot/quote queries and submit mutation colocated in one component"

key-files:
  created:
    - apps/web/src/components/public/BookingRequestPanel.svelte
  modified:
    - apps/web/src/routes/(public)/listings/[id]/+page.svelte

key-decisions:
  - "The booking request panel owns quote, availability, auth gating, and submit state so the public page remains a thin composition layer"
  - "Unauthenticated visitors can preview pricing and availability, but the final booking action redirects them to login with a return URL"
  - "The booking mutation sends listing and booking-intake fields only, relying on the 09-02 server-side context resolution"

patterns-established:
  - "Use `datetime-local` inputs in the UI and convert them to ISO strings before calling typed quote/availability/booking APIs"
  - "Inline success and availability/quote states directly inside the booking panel instead of relying on console-only feedback"

requirements-completed:
  - AVPR-03
  - BOOK-01

duration: "n/a"
completed: 2026-03-10
---

# Phase 09 Plan 03: Public booking intake summary

**Public listing detail pages now support live quote previews, slot checks, and protected booking requests**

## Performance

- **Duration:** n/a
- **Started:** n/a
- **Completed:** 2026-03-10T12:44:17Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `BookingRequestPanel` as a self-contained public intake UI that queries pricing and availability and submits bookings through the hardened `orpc.booking.create` contract.
- Added auth-aware booking submission that redirects unauthenticated visitors to login while preserving public quote and availability previews.
- Updated `/listings/[id]` to a responsive two-column layout that combines listing detail content with the new booking intake experience.

## Task Commits

1. **Task 1: Build a self-contained booking request panel for listing detail pages** — `7cc3b28` (`feat`)
2. **Task 2: Compose the booking-intake panel into the published listing detail page** — `d8d67cb` (`feat`)
3. **Plan metadata:** `pending`

## Files Created/Modified

- `apps/web/src/components/public/BookingRequestPanel.svelte` - Manages slot selection, quote preview, availability checks, auth gating, and booking submission.
- `apps/web/src/routes/(public)/listings/[id]/+page.svelte` - Embeds the booking panel alongside the public listing detail content.

## Decisions Made

- Kept the booking request panel self-contained so slot/quote logic and booking mutation state stay local to the public intake flow.
- Allowed quote and availability checks for anonymous visitors while redirecting only the final booking submission to login.
- Reused the storefront detail route instead of creating a second booking page, keeping the public discovery-to-intake path in one place.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 09 now covers both the operator-side listing management flow and the customer quote-to-booking path through the live app.
- Phase 10 can focus on payment webhook and cancellation live-path hardening with the booking intake surface now in place.

---
*Phase: 09-operator-catalog-booking-intake-wiring*
*Completed: 2026-03-10*
