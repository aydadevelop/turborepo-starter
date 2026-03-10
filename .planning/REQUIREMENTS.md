# Requirements: Travel Commerce Marketplace Platform

**Defined:** 2026-03-09
**Core Value:** Operators can publish and manage flexible bookable listings, and customers can reliably discover, quote, book, pay for, and coordinate those listings through a generic marketplace flow that is testable, extensible, and safe to evolve.

## v1 Requirements

### Platform Foundations

- [ ] **PLAT-01**: Developer can apply committed baseline migrations to recreate the marketplace schema in a clean database environment
- [ ] **PLAT-02**: Developer can load deterministic seed data covering representative org, listing, booking, payment, and support scenarios
- [ ] **PLAT-03**: Developer can restore replayable marketplace state snapshots for parity checks, debugging, and regression testing
- [ ] **PLAT-04**: Team can verify extension-backed or invariant-sensitive database behavior in a real-Postgres test lane before release
- [ ] **PLAT-05**: Team can run automated parity checks against the declared legacy truth source for each extracted domain

### Organization and Access

- [ ] **AUTH-01**: Operator can sign in and work inside an active organization with role-based permissions enforced by the current auth middleware
- [ ] **AUTH-02**: Customer can authenticate and view only their own bookings and support history across the organizations they have booked with
- [ ] **AUTH-03**: System can associate a customer with the booked organization without exposing cross-org data to the wrong actor

### Catalog and Storefront

- [ ] **CATL-01**: Operator can create and update a generic listing with type-specific metadata, location, and assets without boat-only assumptions in the core model
- [ ] **CATL-02**: Operator can publish or unpublish a listing to the marketplace channel with explicit publication state
- [ ] **CATL-03**: Customer can browse published listings and open a listing detail page with the information needed to decide whether to book
- [ ] **CATL-04**: Customer can filter or search published listings using a pragmatic Postgres-backed discovery flow suitable for v1

### Availability and Pricing

- [ ] **AVPR-01**: Operator can define availability rules and one-off blocks for a listing
- [ ] **AVPR-02**: System prevents overlapping active bookings for the same listing and surfaces a clean failure when a slot is unavailable
- [ ] **AVPR-03**: Customer can request a quote for a candidate slot and receive a transparent pricing breakdown before booking
- [ ] **AVPR-04**: Operator can manage pricing profiles and rules without inline pricing logic living in transport handlers

### Booking and Payments

- [ ] **BOOK-01**: Customer can create a booking request for an available slot with publication, contact, and source context captured in the booking record
- [ ] **BOOK-02**: Operator can review and move a booking through the agreed lifecycle states using org-safe domain workflows
- [ ] **BOOK-03**: System can reconcile payment webhooks idempotently and update booking/payment state consistently
- [ ] **BOOK-04**: Customer and operator receive booking confirmation or cancellation notifications triggered by booking lifecycle events
- [ ] **BOOK-05**: System can execute a baseline cancellation and refund flow that applies policy, records refund state, and keeps booking/payment state in sync

### Operations and Support

- [ ] **OPER-01**: Operator can connect and validate one org-scoped payment provider path for booking collection
- [ ] **OPER-02**: Customer or operator can create and follow a support conversation tied to a booking when operational issues arise
- [ ] **OPER-03**: System can trigger side effects through typed events and workflows so booking, payment, and notification behavior does not depend on inline handler logic

## v2 Requirements

### Extraction Completeness (Phase 7)

- [ ] **EXTR-01**: Booking action policy evaluator (BookingActionPolicy, evaluateBookingActionWindow) and slot computation (calculateAvailableSlots, detectOverlap, assertNoOverlap) are available as tested domain functions in packages/booking
- [ ] **EXTR-02**: Pricing engine can resolve the active pricing profile for a listing at a given date range (resolveActivePricingProfile in packages/pricing) without transport-layer lookup logic
- [ ] **EXTR-03**: CalendarAdapter interface with GoogleCalendarAdapter implementation and BookingLifecycleSync subscriber reacts to booking domain events to create, update, and delete external calendar entries via packages/calendar
- [ ] **EXTR-04**: Cancellation policy evaluation (CancellationPolicyService) and dispute/refund orchestration (processCancellationWorkflow, processDisputeWorkflow) are encapsulated in packages/disputes, separate from basic booking status transitions in packages/booking

### Discovery and AI

- **DISC-01**: Customer can use advanced semantic, BM25-ranked, or image-based search to discover listings
- **DISC-02**: Customer can use an AI assistant to narrow options, ask questions, and prepare a booking flow
- **DISC-03**: Operator can use an AI assistant for marketplace operations and content workflows

### Integrations and Distribution

- **INTG-01**: Operator can sync bookings with external calendars through richer provider coverage and bidirectional workflows
- **INTG-02**: Operator can publish inventory to partner, widget, or white-label storefront channels beyond the marketplace baseline
- **INTG-03**: Operator can manage advanced messaging-channel integrations beyond transactional notifications

### Trust and Monetization

- **TRST-01**: Completed customers can leave reviews and operators can respond or moderate them
- **TRST-02**: Marketplace can attribute affiliate referrals and automate payout handling
- **TRST-03**: Team can automate advanced dispute and chargeback management workflows
- **TRST-04**: Operator and customer can use advanced reschedule / dual-approval shift workflows

## Out of Scope

| Feature | Reason |
|---------|--------|
| Direct wholesale copying of legacy services into active packages | Violates the target architecture and increases semantic drift risk |
| Boat-only abstractions in the active runtime | The target system must stay generic across listing types |
| Native mobile applications in the initial milestone | Web + API reliability come first |
| Recurring bookings / recurrence templates | Explicitly deferred in the domain docs and not required for v1 |
| Waitlists for fully booked inventory | Adds complexity before core availability and booking safety are proven |
| Full white-label site-builder / theming studio | Too broad for the current core marketplace milestone |
| Multi-provider payment breadth at launch | One robust provider path is more valuable than shallow breadth |
| Full CRM / marketing automation suite | Not necessary to validate core supply → discovery → booking → payment flows |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PLAT-01 | Phase 8 | Satisfied |
| PLAT-02 | Phase 8 | Satisfied |
| PLAT-03 | Phase 8 | Satisfied |
| PLAT-04 | Phase 8 | Satisfied |
| PLAT-05 | Phase 2 | Satisfied |
| AUTH-01 | Phase 9 | Pending |
| AUTH-02 | Phase 11 | Pending |
| AUTH-03 | Phase 9 | Pending |
| CATL-01 | Phase 9 | Pending |
| CATL-02 | Phase 9 | Pending |
| CATL-03 | Phase 8 | Satisfied |
| CATL-04 | Phase 8 | Satisfied |
| AVPR-01 | Phase 8 | Satisfied |
| AVPR-02 | Phase 8 | Satisfied |
| AVPR-03 | Phase 9 | Pending |
| AVPR-04 | Phase 8 | Satisfied |
| BOOK-01 | Phase 9 | Pending |
| BOOK-02 | Phase 8 | Satisfied |
| BOOK-03 | Phase 10 | Pending |
| BOOK-04 | Phase 11 | Pending |
| BOOK-05 | Phase 10 | Pending |
| OPER-01 | Phase 10 | Pending |
| OPER-02 | Phase 11 | Pending |
| OPER-03 | Phase 11 | Pending |

**Coverage:**
- v1 requirements: 24 total
- Mapped to phases: 24 ✓
- Unmapped: 0

---
*Requirements defined: 2026-03-09*
*Last updated: 2026-03-10 after Phase 8 verification and traceability backfill*