# Roadmap: Travel Commerce Marketplace Platform

## Overview

This roadmap turns the current brownfield starter into a reliable marketplace by sequencing the risky work in the order the repository actually needs: first establish reproducible schema state and replayable data, then stand up typed event/workflow and parity rails, and only after that extract marketplace domains in small, TDD-friendly slices from catalog through booking, payments, and support operations.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Schema Baseline & Replayability** - Lock the database into reproducible migrations, deterministic seeds, snapshots, and real-Postgres verification.
- [x] **Phase 2: Events, Workflows & Parity Foundations** - Establish typed side-effect seams and a declared truth-source/parity harness before domain extraction.
- [x] **Phase 3: Org Access, Catalog & Storefront** - Deliver org-safe operator access plus generic listing creation, publication, browse, and detail flows.
- [x] **Phase 4: Availability & Pricing Core** - Deliver schedulable availability, overlap safety, pricing profiles, and transparent quote generation.
- [x] **Phase 5: Booking Core & Customer Access** - Deliver booking intake, org-safe lifecycle workflows, and customer-visible booking access boundaries.
- [x] **Phase 6: Payments, Notifications & Support Operations** - Deliver payment collection/reconciliation, lifecycle notifications, support threads, and cancellation/refund handling.
- [x] **Phase 7: Review Missing Extractions** - Extract load-bearing booking/pricing/calendar/disputes seams identified by the milestone audit before live-path hardening.
- [x] **Phase 8: Verification & Traceability Backfill** - Restore phase verification evidence and requirements bookkeeping so the milestone can be re-audited against real delivery. (completed 2026-03-10)
- [x] **Phase 9: Operator Catalog & Booking Intake Wiring** - Wire the missing operator publish flow and customer quote-to-booking intake path through the live web and API surfaces. (completed 2026-03-10)
- [x] **Phase 10: Payment Webhook & Cancellation Live Path** - Put live payment reconciliation and cancellation/refund orchestration onto the production request path. (completed 2026-03-10)
- [x] **Phase 11: Events, Notifications, Calendar & Support Integration** - Converge live booking side effects onto typed events and complete the customer-facing support follow-up flow. (completed 2026-03-10)
- [ ] **Phase 12: Operator Booking Notification Fan-out** - Close the remaining milestone blocker by delivering operator-facing booking confirmation and cancellation notifications on the live typed notification path.
- [ ] **Phase 13: Platform Admin Oversight Surface** - Add the cross-org platform-admin workspace for readiness gating, support ticket triage, and moderation actions that should not live inside provider operator flows.

## Phase Details

### Phase 1: Schema Baseline & Replayability
**Goal**: Marketplace data state can be recreated, seeded, replayed, and verified safely across environments before extraction begins.
**Depends on**: Nothing (first phase)
**Requirements**: PLAT-01, PLAT-02, PLAT-03, PLAT-04
**Success Criteria** (what must be TRUE):
  1. Developer can apply committed baseline migrations to a clean database and recreate the marketplace schema without manual repair steps.
  2. Developer can load deterministic org, listing, booking, payment, and support seed scenarios and get the same baseline records on every run.
  3. Developer can restore replayable marketplace state snapshots for debugging, parity checks, and regression work instead of hand-building data.
  4. Team can run a real-Postgres verification lane for extension-backed or invariant-sensitive database behavior before release.
**Plans**: 3 plans

Plans:
- [ ] 01-01: Reconcile executable schema with the baseline migration chain
- [ ] 01-02: Add deterministic seed scenarios and fixture builders for core marketplace states
- [ ] 01-03: Add snapshot restore flow and real-Postgres verification coverage

### Phase 2: Events, Workflows & Parity Foundations
**Goal**: High-side-effect marketplace behavior runs through typed events, workflows, and declared parity checks before domain logic is ported.
**Depends on**: Phase 1
**Requirements**: PLAT-05, OPER-03
**Success Criteria** (what must be TRUE):
  1. Team can run automated parity checks against the declared legacy truth source for each extracted domain and see pass/fail evidence before accepting the port.
  2. Booking, payment, and notification side effects can be triggered from typed domain events instead of being hard-coded inline inside transport handlers.
  3. Multi-step marketplace operations can execute through workflow boundaries that make orchestration and compensation behavior visible in tests and logs.
**Plans**: 3 plans

Plans:
- [ ] 02-01-PLAN.md — Scaffold @my-app/events (DomainEvent<T> bus, registerEventPusher, clearEventPushers) and wire packages/notifications as event pusher
- [ ] 02-02-PLAN.md — Scaffold @my-app/workflows (createStep, createWorkflow, compensation engine) and add workflow execution log schema to packages/db
- [ ] 02-03-PLAN.md — Establish parity test harness (createParityTest, ParityDeclaration) and canary check in packages/db; write parity-guide.md

### Phase 3: Org Access, Catalog & Storefront
**Goal**: Operators can manage generic listings safely inside their organizations, and customers can discover published marketplace inventory.
**Depends on**: Phase 2
**Requirements**: AUTH-01, CATL-01, CATL-02, CATL-03, CATL-04
**Success Criteria** (what must be TRUE):
  1. Operator can sign in, enter an active organization, and see listing-management actions limited by role-based permissions.
  2. Operator can create and update generic listings with type-specific metadata, location, and assets without boat-only assumptions in the core model.
  3. Operator can publish and unpublish listings with explicit publication state changes that control marketplace visibility.
  4. Customer can browse, filter/search, and open published listing detail pages with enough information to decide whether to book.
**Plans**: 3 plans

Plans:
- [x] 03-01-PLAN.md — Add `listing` resource to RBAC statements and extend all org roles with listing permissions
- [x] 03-02-PLAN.md — Scaffold `@my-app/catalog` (listing CRUD + publication services) and wire `listing` oRPC contract + handlers
- [x] 03-03-PLAN.md — TDD storefront service (searchPublishedListings, getPublishedListing) + public API routes + SvelteKit browse and detail pages

### Phase 4: Availability & Pricing Core
**Goal**: Listings expose trustworthy availability and transparent quotes through package-owned pricing and scheduling rules.
**Depends on**: Phase 3
**Requirements**: AVPR-01, AVPR-02, AVPR-03, AVPR-04
**Success Criteria** (what must be TRUE):
  1. Operator can define listing availability rules and one-off blocks without editing transport-layer logic.
  2. System prevents overlapping active bookings for the same listing and returns a clean unavailable outcome when a slot is no longer open.
  3. Customer can request a quote for a candidate slot and receive a transparent pricing breakdown before committing to a booking.
  4. Operator can manage pricing profiles and rules through owning domain code instead of inline handler calculations.
**Plans**: 3 plans

Plans:
- [x] 04-01-PLAN.md — Scaffold `@my-app/availability` (CRUD for rules/blocks/exceptions + slot overlap detection) and add RBAC availability/pricing resources
- [x] 04-02-PLAN.md — TDD `@my-app/pricing` (pricing profiles + rule CRUD + pure `calculateQuote` with transparent breakdown)
- [x] 04-03-PLAN.md — Wire availability and pricing through oRPC contracts and thin handlers in `packages/api`

### Phase 5: Booking Core & Customer Access
**Goal**: Customers can create bookings for available inventory, operators can manage lifecycle state safely, and access boundaries stay org-correct.
**Depends on**: Phase 4
**Requirements**: AUTH-02, AUTH-03, BOOK-01, BOOK-02
**Success Criteria** (what must be TRUE):
  1. Customer can create a booking request for an available slot, and the booking record captures publication, contact, and source context.
  2. Operator can review bookings inside the correct organization and move them through baseline lifecycle states using org-safe domain workflows.
  3. Authenticated customer can view only their own booking history across the organizations they have booked with.
  4. System records the customer-to-organization relationship created by a booking without exposing cross-org data to the wrong actor.
**Plans**: 3 plans

Plans:
- [x] 05-01-PLAN.md — Scaffold `@my-app/booking` (listOrgBookings, getOrgBooking, listCustomerBookings) + add RBAC `booking` resource to all org roles
- [x] 05-02-PLAN.md — TDD `createBooking` (slot check + quote integration) and `updateBookingStatus` (lifecycle state machine)
- [x] 05-03-PLAN.md — Wire booking through oRPC contracts and thin handlers in `packages/api` (operator + customer surfaces)

### Phase 6: Payments, Notifications & Support Operations
**Goal**: Money movement and post-booking operations behave reliably through provider integrations, event-driven notifications, and support flows.
**Depends on**: Phase 5
**Requirements**: OPER-01, BOOK-03, BOOK-04, BOOK-05, OPER-02
**Success Criteria** (what must be TRUE):
  1. Operator can connect and validate one organization-scoped payment provider path for booking collection.
  2. System reconciles payment webhooks idempotently and keeps booking and payment state in sync.
  3. Customer and operator receive booking confirmation or cancellation notifications triggered by booking lifecycle events.
  4. Customer or operator can create and follow a support conversation tied to a booking when operational issues arise.
  5. System can execute a baseline cancellation and refund flow that applies policy, records refund state, and keeps booking and payment history consistent.
**Plans**: 3 plans

Plans:
- [ ] 06-01-PLAN.md — Payment domain package (connectProvider, getOrgConfig, receiveWebhook + idempotent reconciliation)
- [ ] 06-02-PLAN.md — Support ticket service + booking lifecycle notifications (confirmed/cancelled)
- [ ] 06-03-PLAN.md — Cancellation policy enforcement + refund flow (requestCancellation, applyCancellation)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Schema Baseline & Replayability | 3/3 | Complete | 2026-03-09 |
| 2. Events, Workflows & Parity Foundations | 3/3 | Complete | 2026-03-09 |
| 3. Org Access, Catalog & Storefront | 3/3 | Complete | 2026-03-09 |
| 4. Availability & Pricing Core | 3/3 | Complete | 2026-03-10 |
| 5. Booking Core & Customer Access | 3/3 | Complete | 2026-03-10 |
| 6. Payments, Notifications & Support Operations | 3/3 | Complete | 2026-03-10 |
| 7. Review Missing Extractions | 4/4 | Complete | 2026-03-10 |
| 8. Verification & Traceability Backfill | 3/3 | Complete | 2026-03-10 |
| 9. Operator Catalog & Booking Intake Wiring | 3/3 | Complete | 2026-03-10 |
| 10. Payment Webhook & Cancellation Live Path | 4/4 | Complete   | 2026-03-10 |
| 11. Events, Notifications, Calendar & Support Integration | 0/0 | Complete    | 2026-03-10 |
| 12. Operator Booking Notification Fan-out | 0/0 | Not started | - |
| 13. Platform Admin Oversight Surface | 0/0 | Not started | - |

### Phase 7: review missing extractions

**Goal:** Extract the load-bearing P0 domain services missing from packages/booking and packages/pricing, scaffold the packages/calendar adapter package with Google Calendar integration and domain-event-driven sync, and extract the cancellation policy engine plus dispute/refund workflows into packages/disputes.
**Requirements**: EXTR-01, EXTR-02, EXTR-03, EXTR-04
**Depends on:** Phase 6
**Plans:** 4 plans

Plans:
- [x] 07-01-PLAN.md — Extract booking computation services (evaluateActionPolicy, detectOverlap, findFreeGaps, calculateAvailableSlots) + resolveActivePricingProfile to packages/pricing
- [x] 07-02-PLAN.md — Scaffold packages/calendar: clean CalendarAdapter interface (createEvent/updateEvent/deleteEvent/getBusyIntervals), adapter registry, FakeCalendarAdapter
- [x] 07-03-PLAN.md — Implement packages/calendar: GoogleCalendarAdapter (WebCrypto JWT, raw fetch), CalendarService, BookingCalendarSync (outbound domain event pushers)
- [x] 07-04-PLAN.md — Scaffold packages/disputes: evaluateCancellationPolicy (actor-aware), processCancellationWorkflow, processDisputeWorkflow

### Phase 8: Verification & Traceability Backfill

**Goal**: Rebuild the missing verification evidence, summary claims, and requirements traceability needed for the milestone audit to judge delivered work accurately.
**Depends on:** Phase 7
**Requirements**: PLAT-01, PLAT-02, PLAT-03, PLAT-04, CATL-03, CATL-04, AVPR-01, AVPR-02, AVPR-04, BOOK-02
**Gap Closure:** Backfills audit evidence debt from Phases 01 and 03-07 and resets traceability to the phases that now own unresolved work.
**Success Criteria** (what must be TRUE):
  1. Every executed phase that the audit depends on has a corresponding verification report and summary frontmatter that declares completed requirements.
  2. `REQUIREMENTS.md` phase ownership and status match the post-audit remediation plan instead of the pre-audit optimistic state.
  3. Re-running the milestone audit no longer reports bookkeeping-only false negatives for already-delivered platform, catalog, pricing, and booking lifecycle outcomes.
**Plans**: 3 plans

Plans:
- [ ] 08-01-PLAN.md — Backfill Phase 01/03/07 verification evidence and summary traceability
- [ ] 08-02-PLAN.md — Backfill Phase 04/05/06 verification evidence and summary traceability
- [ ] 08-03-PLAN.md — Re-sync requirements status and rerun the milestone audit

### Phase 9: Operator Catalog & Booking Intake Wiring

**Goal**: Finish the missing operator listing-management and customer booking-intake flows so the catalog and booking surfaces work end-to-end through the live app.
**Depends on:** Phase 8
**Requirements**: AUTH-01, AUTH-03, CATL-01, CATL-02, AVPR-03, BOOK-01
**Gap Closure:** Closes the operator publish and quote-to-booking flow gaps, including the missing server-side organization/publication validation.
**Success Criteria** (what must be TRUE):
  1. Operators can create, update, publish, and unpublish listings through `apps/web` using the live typed API surfaces.
  2. Customers can move from slot/quote discovery to booking request in the live app without client-trusted organization or publication context.
  3. Booking creation validates listing publication ownership and organization linkage server-side before persisting records.
**Plans**: 3 plans

Plans:
- [x] 09-01-PLAN.md — Build the operator listing-management UI in the existing `/org` shell
- [x] 09-02-PLAN.md — Harden `booking.create` so publication/org context is resolved server-side from `listingId`
- [x] 09-03-PLAN.md — Add quote-to-booking intake UI to the public listing detail page

### Phase 10: Payment Webhook & Cancellation Live Path

**Goal**: Route payment reconciliation and cancellation/refund orchestration through the production webhook and booking mutation paths instead of scaffold-only seams.
**Depends on:** Phase 9
**Requirements**: OPER-01, BOOK-03, BOOK-05
**Gap Closure:** Closes the live webhook ingress bypass, unfinished refund execution path, and scaffold-only cancellation workflow integration.
**Success Criteria** (what must be TRUE):
  1. Provider webhook ingress reaches `reconcilePaymentWebhook()` on the live path and keeps booking/payment state in sync idempotently.
  2. Cancellation/refund handling executes through the disputes workflow path used by the live API surface.
  3. Integration coverage proves webhook reconciliation and refund state transitions behave on the production wiring path.
**Plans**: 4 plans

Plans:
- [x] 10-01-PLAN.md — Put the production CloudPayments webhook route onto the real reconciliation and config-validation path
- [x] 10-02-PLAN.md — Add the execution-side payment provider registry and CloudPayments refund adapter
- [x] 10-03-PLAN.md — Make the disputes cancellation workflow snapshot-backed and provider-driven
- [x] 10-04-PLAN.md — Wire the live booking cancellation handler to the disputes workflow and prove it at the API layer

### Phase 11: Events, Notifications, Calendar & Support Integration

**Goal**: Converge booking side effects onto typed events/workflows and finish the customer support follow-up path so notifications, calendar sync, and support history all run on the live surface.
**Depends on:** Phase 10
**Requirements**: AUTH-02, BOOK-04, OPER-02, OPER-03
**Gap Closure:** Closes the legacy event-bus split, broken notification delivery, dead calendar lifecycle triggers, and missing customer-facing support/history integration.
**Success Criteria** (what must be TRUE):
  1. Live booking/payment side effects emit through the typed event/workflow boundary instead of the legacy inline API path.
  2. Notification delivery wiring is registered at startup and produces valid recipient payloads for booking lifecycle events.
  3. Calendar sync subscribers receive the booking lifecycle events they need from the live runtime.
  4. Customers can view and follow booking-linked support history through the live API and web surfaces.
**Plans**: 2 plans

Plans:
- [ ] 11-01-PLAN.md — OPER-03 + BOOK-04: Emit typed domain events from booking.updateStatus + notification events-bridge recipient resolution at startup
- [ ] 11-02-PLAN.md — AUTH-02 + OPER-02: listCustomerTickets domain function, customer-scoped API endpoint, /dashboard/bookings web page

### Phase 12: Operator Booking Notification Fan-out

**Goal**: Close the last milestone-blocking notification gap by faning booking confirmation and cancellation events out to operator recipients as well as customers on the live typed notification path.
**Depends on:** Phase 11
**Requirements**: BOOK-04
**Gap Closure:** Closes the refreshed milestone audit requirement gap, integration gap, and broken notification-delivery flow caused by customer-only recipient resolution in the notifications event bridge.
**Success Criteria** (what must be TRUE):
  1. `booking:confirmed` and `booking:cancelled` notifications resolve at least one operator recipient in addition to the customer when an operator-facing org context exists.
  2. Operator recipients receive valid notification payloads through the same typed events → notifications bridge → queue/processor path used for customer delivery.
  3. Automated coverage proves mixed recipient fan-out is idempotent and does not regress existing customer delivery behavior.
  4. Re-running `/gsd-audit-milestone` no longer reports `BOOK-04` as partial.
**Plans**: 0 plans

### Phase 13: Platform Admin Oversight Surface

**Goal**: Give platform admins a dedicated cross-org operations surface for publish gating, support ticket triage, and moderation decisions so marketplace quality controls live in one accountable place instead of being scattered across provider-only flows.
**Depends on:** Phase 12
**Requirements**: PADM-01, PADM-02, PADM-03
**Gap Closure:** Closes the planning gap around platform-admin readiness, moderation, and ticketing responsibilities called out in discovery and ADR documents but not yet represented in the roadmap.
**Success Criteria** (what must be TRUE):
  1. Platform admins can review cross-org readiness and moderation queues with explicit blocker reasons, audit history, and actionable next steps.
  2. Platform admins can triage, assign, or escalate booking-linked support tickets without impersonating a provider organization.
  3. Platform admins can apply publication gating, moderation, or pause decisions through backend-governed actions that keep readiness and moderation surfaces aligned.
  4. The admin oversight surface reflects the same source of truth as operator-facing readiness and support flows rather than maintaining a second contradictory state model.
**Plans**: 0 plans
