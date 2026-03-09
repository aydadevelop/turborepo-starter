# Roadmap: Travel Commerce Marketplace Platform

## Overview

This roadmap turns the current brownfield starter into a reliable marketplace by sequencing the risky work in the order the repository actually needs: first establish reproducible schema state and replayable data, then stand up typed event/workflow and parity rails, and only after that extract marketplace domains in small, TDD-friendly slices from catalog through booking, payments, and support operations.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Schema Baseline & Replayability** - Lock the database into reproducible migrations, deterministic seeds, snapshots, and real-Postgres verification.
- [ ] **Phase 2: Events, Workflows & Parity Foundations** - Establish typed side-effect seams and a declared truth-source/parity harness before domain extraction.
- [ ] **Phase 3: Org Access, Catalog & Storefront** - Deliver org-safe operator access plus generic listing creation, publication, browse, and detail flows.
- [ ] **Phase 4: Availability & Pricing Core** - Deliver schedulable availability, overlap safety, pricing profiles, and transparent quote generation.
- [ ] **Phase 5: Booking Core & Customer Access** - Deliver booking intake, org-safe lifecycle workflows, and customer-visible booking access boundaries.
- [ ] **Phase 6: Payments, Notifications & Support Operations** - Deliver payment collection/reconciliation, lifecycle notifications, support threads, and cancellation/refund handling.

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
- [ ] 03-01: Harden org-aware access and RBAC acceptance around marketplace listing surfaces
- [ ] 03-02: Extract generic listing and publication domain behavior behind package-owned boundaries
- [ ] 03-03: Deliver storefront browse, search/filter, and listing-detail slices with TDD coverage

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
- [ ] 04-01: Extract availability ownership, slot evaluation, and overlap protections
- [ ] 04-02: Extract pricing profiles, pricing rules, and quote calculation behavior
- [ ] 04-03: Wire quote and availability flows through thin transport with parity coverage

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
- [ ] 05-01: Extract booking intake and booking-record shaping from brownfield truth sources
- [ ] 05-02: Implement org-safe booking lifecycle workflows and operator review surfaces
- [ ] 05-03: Add customer booking-history access rules and booking-to-org association checks

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
- [ ] 06-01: Deliver payment-provider connection, validation, and webhook reconciliation
- [ ] 06-02: Attach notification subscribers and booking-tied support conversations to stable domain events
- [ ] 06-03: Deliver cancellation-policy, refund, and post-booking operational hard-path coverage

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Schema Baseline & Replayability | 0/3 | Not started | - |
| 2. Events, Workflows & Parity Foundations | 0/3 | Not started | - |
| 3. Org Access, Catalog & Storefront | 0/3 | Not started | - |
| 4. Availability & Pricing Core | 0/3 | Not started | - |
| 5. Booking Core & Customer Access | 0/3 | Not started | - |
| 6. Payments, Notifications & Support Operations | 0/3 | Not started | - |
