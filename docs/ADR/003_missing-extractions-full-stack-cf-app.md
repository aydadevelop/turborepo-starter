# ADR-003: Remaining Capability Gaps from `full-stack-cf-app`

**Date:** 2026-03-10
**Status:** Active
**Authors:** Platform Team
**Related:** [ADR-001: Legacy Extraction Plan](./001_legacy-extraction.md) | [ADR-002: Architecture Patterns](./002_architecture-patterns.md) | [ADR-010: Schema Modernization Constitution](./010_schema_modernization_constitution.md) | [ADR-011: Organization Overlay and Readiness Projection](./011_organization_overlay_and_readiness_projection.md)

---

## Table of Contents

1. [Context](#context)
2. [Gap Analysis — Current State vs. ADR-001 Targets](#gap-analysis--current-state-vs-adr-001-targets)
3. [Alignment With Current Product Goals](#alignment-with-current-product-goals)
4. [1. Capability Gaps](#1-capability-gaps)
   - [1.1 packages/calendar](#11-packagescalendar)
   - [1.2 channel integrations and messaging](#12-channel-integrations-and-messaging)
   - [1.3 disputes and cancellation policy](#13-disputes-and-cancellation-policy)
5. [2. Gaps in Existing Packages](#2-gaps-in-existing-packages)
   - [2.1 packages/booking](#21-packagesbooking)
   - [2.2 packages/pricing](#22-packagespricing)
   - [2.3 packages/catalog](#23-packagescatalog)
6. [3. Missing API Layer](#3-missing-api-layer)
   - [3.1 packages/api — Missing Handlers](#31-packagesapi--missing-handlers)
   - [3.2 packages/api — Missing Library Module](#32-packagesapi--missing-library-module)
   - [3.3 packages/api-contract — Missing Route Contracts](#33-packagesapi-contract--missing-route-contracts)
7. [4. Missing App Layer](#4-missing-app-layer)
   - [4.1 apps/server — Missing Routes and Queue Consumers](#41-appsserver--missing-routes-and-queue-consumers)
8. [5. Priority Reset](#5-priority-reset)
9. [Consequences](#consequences)
10. [6. Skill Alignment Notes](#6-skill-alignment-notes)

---

## Context

ADR-001 defined the full extraction inventory from `full-stack-cf-app` into this turborepo. That extraction-first framing was useful early, but parts of it are now stale.

Current repo truth differs from the original ADR-003 assumptions:

- `packages/calendar` now exists
- `packages/disputes` was intentionally merged into `packages/booking` under ADR-008
- `packages/support` remains a top-level capability
- the repo now has season-focused product documents that change what "important gap" means:
  - [Season 2026 Target State](../season-2026-target-state.md)
  - [Season 2026 Product Builder Brief](../season-2026-product-builder-brief.md)
  - [Boat Rent Model Testing Matrix](../boat-rent-model-testing-matrix.md)

So this ADR should no longer be read as:

> create every originally planned package and achieve full legacy parity.

It should now be read as:

> preserve the useful inventory of missing capability slices, but prioritize them according to the current model: operator OS, minimal customer truth surface, assisted conversion, reliability, service-family extension, and completion of the Medusa-like module/overlay/read-model layer before heavier businessization.

This ADR records the **remaining capability gap**: important behavior from `legacy/full-stack-cf-app` that has not yet been absorbed into the new system in the right place. It serves as the authoritative inventory, but not every listed gap has equal season priority and not every useful legacy behavior should be copied literally.

Source paths below are relative to `legacy/full-stack-cf-app/`.

---

## Gap Analysis — Current State vs. ADR-001 Targets

| ADR-001 Target | Status |
|---|---|
| `packages/events` | ✅ Done |
| `packages/workflows` | ✅ Done |
| `packages/auth` | ✅ Done |
| `packages/notifications` | ✅ Done |
| `packages/db` | ✅ Done |
| `packages/booking` (core) | ✅ Partial — missing sub-services (see §2.1) |
| `packages/pricing` (core) | ✅ Partial — missing pricing-profile (see §2.2) |
| `packages/catalog` (core) | ✅ Partial — missing sub-resources (see §2.3) |
| `packages/availability` | superseded — merged into `packages/booking` |
| `packages/payment` (webhook adapters) | ✅ Done (`packages/payment/src/webhooks`) |
| `packages/support` | ✅ Done |
| `packages/calendar` | ✅ Done |
| `packages/messaging` | ❌ Missing as a generic package; channel capability remains open |
| `packages/disputes` | superseded — merged into `packages/booking` |
| Admin handlers in `packages/api` | ❌ Partial |
| Helpdesk + intake handlers in `packages/api` | ⚠ partial — support exists, seasonal channel intake is incomplete |
| Boat/listing sub-resource handlers | ⚠ partial |
| Calendar + booking lifecycle routes in `apps/server` | ⚠ partial |

## Alignment With Current Product Goals

The season and product-builder documents reset the priority rules.

The highest-value gaps are the ones that support:

1. one org/operator OS that covers the real 90 percent
2. a minimal customer truth surface
3. service-family extension and Medusa-style overlay/read-model completion
4. assisted conversion and lead handling
5. reliability under live-season pressure

For the current season, this should be read with one extra rule:

- `boat_rent` is the near-season wedge and therefore the first family whose operator OS, customer truth surface, and reliability gaps must be closed
- `excursions` should reuse the same completed abstraction layer rather than pulling the repo back toward boat-only shortcuts

This means the repo should **not** optimize for:

- recreating every legacy package boundary
- full parity with old boat-only frontend flows
- generic messaging abstractions before the active channels are known

This ADR therefore re-ranks the inventory into:

- `keep now`
- `keep but narrow`
- `defer`

### Keep now

- module-owned operator and customer read models
- marketplace overlay state: readiness, publication, moderation, distribution
- service-family policy and variant extension surfaces
- booking integrity and checkout/payment lifecycle
- calendar lifecycle reliability and test coverage
- operator-facing listing/boat management subresources
- minimal public/customer read models and pages
- channel intake and delivery only for the channels that matter this season

### Keep but narrow

- support/helpdesk beyond the current ticket/message foundation
- media and approval workflows beyond what is needed for real publication quality
- affiliate and landing concerns beyond the immediate grouped-page and attribution needs

### Defer

- generic `packages/messaging` if the active season channels can be handled in a smaller capability slice first
- secondary calendar providers until real supply requires them
- exact legacy frontend parity and mini-app parity

### Abstraction-first reading rule

The main Medusa-like gap in this repo is no longer primitive infrastructure. The primitives already exist:

- domain packages
- provider registries
- domain events
- workflows
- thin oRPC transport

What is still incomplete is the layer on top of those primitives:

- service-family-aware product models
- marketplace overlay state
- module-owned operator/customer read models
- workflow-owned main business flows
- extension surfaces for future family-specific configuration

So when this ADR says a gap is high priority, read it as:

> finish the model and abstraction shape that lets the business surfaces be composed cleanly later.

not:

> recreate every old endpoint or package boundary first.

## Implemented Since The Priority Reset

The first abstraction wave behind the updated priorities has already shipped.

Implemented:

- `listing_type_config` now has a first-class `serviceFamily` field, which starts the service-family model instead of leaving category behavior implicit
- the first overlay capability now exists as [`packages/organization`](/Users/d/Documents/Projects/turborepo-alchemy/packages/organization)
- onboarding/readiness projection ownership moved out of `packages/api`
- payment, calendar, and listing publication now emit readiness events that feed the overlay projector

This does **not** close the P0 gap set. It means two of the highest-priority abstractions are now started and should be extended from the new seams instead of being reimplemented elsewhere.

---

## 1. Capability Gaps

### 1.1 `packages/calendar`

Status note:

The package now exists. The remaining calendar gap is no longer package creation. The real gap is lifecycle completion, reliability, workflow ownership, and test depth under production-like conditions.

**Source:** `packages/api/src/calendar/` (all directories)

This is a fully developed, self-contained calendar integration layer with a clean adapter/registry pattern, use-case orchestration, and two sync strategies. None of it has been moved to the turborepo yet.

| Legacy File | Size | Target Export |
|---|---|---|
| `calendar/adapters/types.ts` | — | `CalendarAdapterProvider`, `CalendarEventInput`, `CalendarEventPresentation` |
| `calendar/adapters/registry.ts` | — | `CalendarAdapterRegistry`, `registerCalendarAdapter` |
| `calendar/adapters/configure.ts` | — | `configureCalendarAdapters` bootstrap |
| `calendar/adapters/google-calendar-adapter.ts` | 722 lines | `GoogleCalendarAdapter` implements `CalendarAdapter` |
| `calendar/adapters/fake-calendar-adapter.ts` | — | `FakeCalendarAdapter` (test double) |
| `calendar/application/types.ts` | — | Application-level calendar types |
| `calendar/application/calendar-use-cases.ts` | 279 lines | `CalendarUseCases` — connect, disconnect, list events, sync |
| `calendar/sync/booking-lifecycle-sync.ts` | 412 lines | `BookingLifecycleSync` — reacts to booking events → creates/updates/cancels calendar events |
| `calendar/sync/connection-sync.ts` | — | `ConnectionSync` — iCal feed poll, push notification reconcile |

**Design constraints for extraction:**
- `CalendarAdapter` interface lives in `packages/calendar` and is the only import other packages should touch. The canonical interface shape (per the `provider-adapters` skill) is: `createEvent`, `updateEvent`, `deleteEvent`, `listBusySlots`.
- `GoogleCalendarAdapter` is a concrete implementation in the same package — it is the only place the Google Calendar SDK is imported.
- `BookingLifecycleSync` subscribes to `booking:*` domain events via `packages/events` and drives all calendar side effects. It must **not** be wired directly inside `packages/booking`.
- `packages/calendar/src/index.ts` must call `registerEventPusher` (from `@my-app/events`) at module startup to subscribe to: `booking:confirmed` → create/update calendar event, `booking:cancelled` → delete calendar event, `booking:contact-updated` → update event title/description. This is the pattern prescribed by the `domain-events` skill.
- The `calendar:sync-requested` event is already present in `DomainEventMap` (`packages/events/src/types.ts`). The calendar package is its canonical consumer.
- The `FakeCalendarAdapter` lives alongside production code and is exported for use in test utilities.
- Credentials (Google service account key) must be injected via constructor, never read from `process.env` inside a method — per the `provider-adapters` skill §Step 3.

**Tests to port:** `__tests__/calendar-adapter.test.ts`, `__tests__/calendar-use-cases.test.ts`, `__tests__/google-calendar.integration.test.ts`, `__tests__/boat-calendar-lifecycle.test.ts`

---

### 1.2 channel integrations and messaging

**Source:** `packages/api/src/channels/` (all files)

A multi-channel outbound/inbound adapter registry with concrete implementations for Telegram, Avito, Email, Web, and Sputnik channels. Handles both structured outgoing notifications and raw inbound messages from external platforms.

| Legacy File | Size | Target Export |
|---|---|---|
| `channels/types.ts` | — | `OutboundChannelAdapter`, `InboundChannelAdapter`, `ChannelMessage`, `TelegramChannelMeta`, `EmailChannelMeta`, `WebChannelMeta`, `AvitoChannelMeta` |
| `channels/registry.ts` | 46 lines | `ChannelAdapterRegistry`, `registerChannelAdapter` |
| `channels/adapters.ts` | 458 lines | `TelegramAdapter`, `AvitoAdapter`, `EmailAdapter`, `WebAdapter`, `SputnikAdapter` |
| `channels/dispatch.ts` | — | `dispatchChannelMessage` — resolves adapter from registry and sends |
| `channels/defaults.ts` | — | Default channel configuration and fallback chains |
| `channels/telegram-queue-strategy.ts` | — | Telegram-specific queue strategy — uses `packages/queue` for rate-limited delivery |

Current interpretation:

Do not read this as a mandatory order to create a broad `packages/messaging` package immediately.

The real season question is:

> which inbound and outbound channels matter enough now to justify a dedicated capability slice?

For the current model, this should likely start with only the active channel set:

- Telegram
- Avito
- email intake where needed

and stay closely tied to:

- assisted conversion
- support intake
- lead routing
- future assistant flow packs with explicit flow context

**Design constraints for extraction if/when promoted to a package:**
- The adapter registry is the only import; calling code never imports a concrete adapter directly.
- Telegram delivery must remain queue-backed (`packages/queue` / pg-boss) to respect Telegram's rate limits.
- Inbound normalization (converting raw Telegram/Avito webhook payloads to internal `ChannelMessage`) stays in the adapter, not in the handler.
- `packages/messaging/src/index.ts` must call `registerEventPusher` (from `@my-app/events`) at startup if any outbound dispatch is event-driven. Events it may consume: `booking:created` (send confirmation via customer's preferred channel), `booking:confirmed`, `booking:cancelled`.
- `packages/messaging` depends on `packages/db`, `packages/events`, and `packages/queue`. It must **not** depend on `packages/support`.

**Tests to port:** `__tests__/channel-adapters.test.ts`, `__tests__/channel-dispatch.integration.test.ts`, `__tests__/telegram.integration.test.ts`, `__tests__/ticketing-multichannel.integration.test.ts`

---

### 1.3 disputes and cancellation policy

**Source:** `packages/api/src/routers/booking/cancellation/` and `packages/api/src/routers/booking/dispute.ts` and `packages/api/src/routers/booking/refund.ts`

ADR-001 designated a `packages/disputes` package for cancellation flows and dispute processing. ADR-008 later intentionally merged this concern into `packages/booking`.

So the real gap is not a missing package. The real gap is missing depth inside booking-owned cancellation, dispute, and refund flows, plus explicit workflow ownership for exception paths.

| Legacy File | Size | Target Export |
|---|---|---|
| `routers/booking/cancellation/policy.service.ts` | 519 lines | `CancellationPolicyService` — evaluates applicable policy by booking age, entity type, initiator role |
| `routers/booking/cancellation/policy.templates.ts` | — | Pre-defined cancellation policy templates (flexible, moderate, strict) |
| `routers/booking/cancellation/request-payload.ts` | — | `buildCancellationPayload` — computes refund amount and fee split from policy |
| `routers/booking/dispute.ts` (router) | — | Dispute creation, escalation, resolution handlers — thin wiring to service |
| `routers/booking/refund.ts` (router) | — | Manual refund initiation by admin — thin wiring to payment package |

**Design constraints for extraction:**
- `CancellationPolicyService` is pure domain logic — it takes a booking snapshot and returns a policy decision. It must have no DB or HTTP dependencies.
- The basic `cancellation-service.ts` in `packages/booking` can be kept for simple status transitions; `packages/disputes` holds the policy evaluation and workflow orchestration.
- `packages/disputes` depends on `packages/booking`, `packages/payment`, `packages/events`, and `packages/workflows`.
- Refund initiation calls `packages/payment` — it must not call the CloudPayments SDK directly.
- Two workflows must be scaffolded per the `workflows` skill pattern:
  - `processCancellationWorkflow` — steps: `evaluateCancellationPolicyStep`, `applyRefundStep` (with compensate), `updateBookingStatusStep`, emit `booking:cancelled`.
  - `processDisputeWorkflow` — steps: `openDisputeStep`, emit `dispute:opened`; then `resolveDisputeStep`, emit `dispute:resolved`.
- `dispute:opened` and `dispute:resolved` are already defined in `DomainEventMap` (`packages/events/src/types.ts`) — no new event types required.

---

## 2. Gaps in Existing Packages

### 2.1 `packages/booking`

The current package covers the create/confirm/cancel lifecycle. The following services exist in the legacy but have not been ported:

| Legacy File | Size | Missing Export | Notes |
|---|---|---|---|
| `routers/booking/services/action-policy.ts` | 153 lines | `BookingActionPolicy` | State machine: which actions (cancel, shift, pay, confirm) are allowed per status + actor role |
| `routers/booking/services/slots.ts` | 502 lines | `calculateAvailableSlots` | Core slot algorithm — computes free time windows from existing bookings + calendar events |
| `routers/booking/services/overlap.ts` | 87 lines | `detectOverlap`, `assertNoOverlap` | Overlap guard used at booking write time |
| `routers/booking/services/expiration.ts` | — | `scheduleBookingExpiration`, `cancelExpiredBookings` | pg-boss job that expires unpaid bookings after TTL |
| `routers/booking/services/checkout-read-model.ts` | 176 lines | `buildCheckoutReadModel` | Aggregate read projection for checkout page — joins booking, pricing, entity, participants |
| `routers/booking/services/checkout-read-model.templates.ts` | — | Rendering helpers for checkout model |  |
| `routers/booking/services/availability-ranking.ts` | — | `rankListingsByAvailability` | Scores listings by slot density, used in search result ordering |
| `routers/booking/services/calendar-link.ts` | — | `generateCalendarLink` | Generates .ics download link / Google Calendar "Add event" URL for a confirmed booking |
| `routers/booking/services/calendar-sync.ts` | — | `syncBookingToCalendar` | Per-booking calendar event write — delegates to `packages/calendar` |
| `routers/booking/services/affiliate.ts` | 235 lines | `AffiliateService` | Tracks referral source, stores affiliate code on booking, calculates commission |
| `routers/booking/discount/resolution.ts` | 190 lines | `resolveDiscount` | Validates and applies discount codes + promotional pricing |
| `routers/booking/affiliate.ts` (router) | — | `bookingAffiliateRouter` | Thin oRPC wiring for affiliate code lookup/apply |
| `routers/booking/discount/router.ts` (router) | — | `bookingDiscountRouter` | Thin oRPC wiring for discount resolution |
| `routers/booking/shift.ts` (router) | — | `bookingShiftRouter` | Reschedule — date shift with overlap check + calendar re-sync |
| `routers/booking/storefront.ts` (router) | — | `bookingStorefrontRouter` | Public-facing booking search for a listing's available slots |

**Priority note:** `action-policy.ts`, `slots.ts`, and `overlap.ts` are load-bearing — they are called by the booking create/shift/cancel handlers. Port these first before the derive services.

---

### 2.2 `packages/pricing`

| Legacy File | Size | Missing Export | Notes |
|---|---|---|---|
| `routers/booking/services/pricing-profile.ts` | — | `PricingProfile`, `resolvePricingProfile` | Per-entity pricing configuration: season windows, currency, component coefficients, commission rate |

The current `packages/pricing` implements generic rule resolution. `pricing-profile.ts` bridges the gap between an entity's stored configuration and the engine — it is a domain type, not a UI concern.

---

### 2.3 `packages/catalog`

The current package covers listing CRUD, publication, and storefront browsing. The following boat sub-resource managers exist in the legacy but are missing:

| Legacy Source | Target Module | Responsibility |
|---|---|---|
| `routers/boat/amenity.ts` | `amenity-service.ts` | Manage amenities attached to a listing (add, remove, reorder) |
| `routers/boat/asset.ts` | `asset-service.ts` | Listing media assets (photo upload, ordering, cover selection) |
| `routers/boat/dock.ts` | `dock-service.ts` | Home dock / departure point management |
| `routers/boat/min-duration.ts` | `min-duration-service.ts` | Per-listing minimum booking duration rules |
| `routers/boat/access.ts` | `listing-access-service.ts` | Org member access grants per listing |
| `routers/boat/services/calendar-lifecycle.ts` | `calendar-lifecycle.ts` | On listing create/archive → create/cancel placeholder calendar entries |

All six modules belong in `packages/catalog` because they are pure listing-management concerns with no booking logic.

These subresources should also be read as the first concrete operator-workspace slices, not just CRUD gaps:

- merchandising
- availability and minimum-duration controls
- location/departure management
- media and trust-building inputs

---

## 3. Missing API Layer

### 3.1 `packages/api` — Missing Handlers

The following thin oRPC router files exist in the legacy `packages/api/src/routers/` but have no equivalent in the turborepo `packages/api/src/handlers/`.

These should not be interpreted as "add thin handlers first and figure out the model later". The preferred order is:

1. finish the owning domain service or read model
2. add the contract
3. add the thin handler as the final transport adapter

**Booking sub-handlers:**

| Legacy | Target Handler | Contract Needed |
|---|---|---|
| `routers/booking/affiliate.ts` | `handlers/booking/affiliate.ts` | `routers/booking/affiliate.ts` |
| `routers/booking/discount/router.ts` | `handlers/booking/discount.ts` | `routers/booking/discount.ts` |
| `routers/booking/shift.ts` | `handlers/booking/shift.ts` | `routers/booking/shift.ts` (extend existing booking contract) |
| `routers/booking/refund.ts` | `handlers/booking/refund.ts` | `routers/booking/refund.ts` |

**Boat sub-resource handlers:**

| Legacy | Target Handler | Contract Needed |
|---|---|---|
| `routers/boat/amenity.ts` | `handlers/boat/amenity.ts` | `routers/boat/amenity.ts` |
| `routers/boat/asset.ts` | `handlers/boat/asset.ts` | `routers/boat/asset.ts` |
| `routers/boat/dock.ts` | `handlers/boat/dock.ts` | `routers/boat/dock.ts` |
| `routers/boat/min-duration.ts` | `handlers/boat/min-duration.ts` | `routers/boat/min-duration.ts` |
| `routers/boat/access.ts` | `handlers/boat/access.ts` | `routers/boat/access.ts` |
| `routers/boat/calendar.ts` | `handlers/boat/calendar.ts` | `routers/boat/calendar.ts` |

**Messaging and support handlers:**

| Legacy | Target Handler | Contract Needed |
|---|---|---|
| `routers/helpdesk.ts` | `handlers/helpdesk.ts` | `routers/helpdesk.ts` |
| `routers/intake.ts` | `handlers/intake.ts` | `routers/intake.ts` |

**Admin handlers:**

| Legacy | Target Handler | Notes |
|---|---|---|
| `routers/admin/boats.ts` | `handlers/admin/boats.ts` | Listing admin: approve, archive, feature |
| `routers/admin/bookings.ts` | `handlers/admin/bookings.ts` | Booking admin: force-confirm, override |
| `routers/admin/fee-config.ts` | `handlers/admin/fee-config.ts` | Platform fee config per org or global |
| `routers/admin/support.ts` | `handlers/admin/support.ts` | Support ticket admin: assign, escalate |

---

### 3.2 `packages/api` — Missing Library Module

| Legacy File | Size | Target Path | Notes |
|---|---|---|---|
| `lib/booking-notification-recipients.ts` | 48 lines | `packages/api/src/lib/booking-notification-recipients.ts` | Resolves the set of notification recipients (owner, customer, agent) for a given booking event |

This is a pure resolution function with no side effects. It is referenced by booking handlers and the notification bridge.

---

### 3.3 `packages/api-contract` — Missing Route Contracts

The following oRPC contract route files need to be added to `packages/api-contract/src/routers/`:

**Booking sub-routes:**
- `booking/affiliate.ts` — affiliate code apply/lookup
- `booking/discount.ts` — discount code validation and application
- `booking/refund.ts` — manual refund initiation (admin-gated)

**Boat sub-routes:**
- `boat/amenity.ts`, `boat/asset.ts`, `boat/dock.ts`, `boat/min-duration.ts`, `boat/access.ts`, `boat/calendar.ts`

**Support and messaging:**
- `helpdesk.ts` — support ticket CRUD, status transitions
- `intake.ts` — inbound channel message ingestion endpoint

**Admin:**
- `admin/boats.ts`, `admin/bookings.ts`, `admin/fee-config.ts`, `admin/support.ts`

---

## 4. Missing App Layer

### 4.1 `apps/server` — Missing Routes and Queue Consumers

| Legacy File | Target in `apps/server/src/` | Purpose |
|---|---|---|
| `apps/server/src/queues/booking-lifecycle-consumer.ts` | `queues/booking-lifecycle-consumer.ts` | pg-boss worker: processes `booking:*` domain events from the queue, drives calendar sync and expiration |
| `apps/server/src/routes/calendar-internal.ts` | `routes/calendar-internal.ts` | Internal Hono route: handles adapter callbacks from calendar operations (e.g. Google OAuth callback) |
| `apps/server/src/routes/calendar-webhook.ts` | `routes/calendar-webhook.ts` | External Hono route: receives Google Calendar push notification webhooks, triggers connection-sync |

The turborepo `apps/server` already has `routes/payment-webhook.ts` and `queues/recurring-task-consumer.ts` as structural precedents. The calendar routes follow the same mount pattern.

---

## 5. Priority Reset

| Priority | Item | Why it matters now | Target Package / App |
|---|---|---|---|
| **P0** | service-family model, category variants, and backend-owned editor/read state | started: `serviceFamily` now exists on `listing_type_config`; category variants and service-family-aware editor/read models still need to be completed | `packages/catalog`, `packages/api-contract`, `packages/api`, `apps/web` |
| **P0** | marketplace overlay state: readiness, publication, moderation, distribution, manual override | started: `packages/organization` now owns onboarding/readiness; the rest of the overlay state still needs to move there | `packages/organization`, `packages/api-contract`, `apps/web` |
| **P0** | operator OS subresources: assets, amenities, docks/locations, min-duration, calendar controls, pricing surfaces | org panel must cover the real 90 percent | `packages/catalog`, `packages/booking`, `packages/pricing`, `packages/api`, `apps/web` |
| **P0** | minimal customer truth surface | admin config must be testable from the traveler side | `packages/api-contract`, `packages/api`, `apps/web` |
| **P1** | payment-intent lifecycle, reserve/capture/refund semantics, expiration/clearance | live booking trust and operator confidence | `packages/payment`, `packages/booking`, `packages/api` |
| **P1** | calendar lifecycle e2e: watch -> push -> sync -> conflict detection | boat-rent wedge depends on reliable calendar truth | `packages/calendar`, `apps/server`, `packages/booking` |
| **P1** | booking-owned cancellation/dispute/refund policy depth | real exception handling, not package purity | `packages/booking`, `packages/payment`, `packages/workflows` |
| **P1** | channel intake/delivery for active season channels only | assisted conversion and lead routing | `packages/api`, `packages/support`, optional future `packages/messaging` |
| **P2** | media/upload hardening and publication-quality review flow | trust and publishability | `packages/catalog`, `packages/storage`, `apps/web` |
| **P2** | assistant flow context and curated tool surfaces | tools can be generated later, but flows need stable context and explicit boundaries | `packages/assistant`, `packages/api-contract`, `packages/api` |
| **P2** | admin override and manual intervention surfaces | handle the real 10 percent without code churn | `packages/api-contract`, `packages/api`, `apps/web`, `packages/support` |
| **P3** | affiliate/landing attribution beyond immediate grouped pages | useful, but not core before the operator OS is real | `packages/api`, `apps/web` |
| **P3** | secondary providers and broader channel abstraction | extension work after the near-season core is stable | future capability slices |

---

## Consequences

**Positive:**
- This ADR keeps the useful extraction inventory, but no longer confuses package parity with season priority.
- It aligns the remaining work with the current model: operator OS, minimal customer truth surface, service-family extension, assisted conversion, and marketplace overlay completion.
- It supports the Medusa-style direction already accepted in ADR-002, ADR-008, and ADR-011: finish overlay/read-model/module shape before heavier businessization.

**Risks:**
- If read only as an extraction checklist, teams may still chase stale package boundaries instead of the actual product bottlenecks.
- If the repo keeps the abstractions but does not finish operator/customer read models, it will remain technically clean but commercially generic.

---

## 6. Skill Alignment Notes

This section records how the four active skills (`workflows`, `domain-events`, `domain-packages`, `provider-adapters`) apply to the extractions listed in this ADR, and flags any discrepancies.

### Stale status notes in skills

The `domain-events` skill says `packages/events` "does not exist yet". The `workflows` skill says `packages/workflows` is "a new package (Wave 0)". The `domain-packages` skill says `@my-app/events` and `@my-app/workflows` "may not exist yet". **All three packages are fully implemented and live.** These notes are stale and safe to ignore during extraction work.

### `DomainEvent` shape: production vs. skill

The `domain-events` skill documents the minimal `{ type, data }` union. The actual `packages/events/src/types.ts` is richer:

```typescript
interface DomainEvent<T extends DomainEventType> {
  type: T
  data: DomainEventMap[T]
  organizationId: string   // ← added for multi-tenant routing
  actorUserId?: string     // ← added for audit trail
  idempotencyKey: string   // ← added for safe retry
}
```

Pushers already flowing through `packages/notifications` depend on these fields. All new pusher registrations in `packages/calendar` and `packages/messaging` must handle the full `DomainEvent<T>` shape, not the simplified skill version.

### Package naming: `packages/payment` vs. `packages/payments`

The `provider-adapters` skill consistently references `packages/payments` (plural) and `@my-app/payments`. **The actual repo uses `packages/payment` (singular) and `@my-app/payment`.** All extraction targets in this ADR use the correct singular form. The skills use the plural — treat the skills as directionally correct pattern references; always use the singular name when writing code.

### `packages/payment` is missing the full `PaymentProvider` interface

The `provider-adapters` skill defines a `PaymentProvider` interface with `charge()`, `refund()`, `capture()`, `cancel()` methods. The current `packages/payment` only handles webhook reconciliation and org config — it does **not implement** this charging interface. This is a gap not listed in §2. The full `PaymentProvider` (charge/refund/capture/cancel) + `CloudPaymentsProvider` concrete implementation must be extracted as part of P1 work, co-located with or immediately after `packages/disputes` since disputes initiate refunds.

| Item | Priority | Depends On |
|---|---|---|
| `PaymentProvider` interface + `CloudPaymentsProvider` adapter | **P1** | `packages/payment`, `packages/env` |

### `workflow_execution` DB table

The `workflows` skill prescribes a `workflow_execution` table for observability and idempotency. **It is already present** — added in migration `2026030919003_oval_adam_warlock`. No action needed here; referencing the table in `createWorkflow` logs is ready to implement.

### `registerEventPusher` must be wired in each new package

The `domain-events` skill requires each domain module to register its event pusher in its own `index.ts` at startup. Currently only `packages/notifications` does this. When extracted, these packages must each call `registerEventPusher`:

| Package | Subscribes to | Side effect |
|---|---|---|
| `packages/calendar` | `booking:confirmed`, `booking:cancelled`, `booking:contact-updated`, `calendar:sync-requested` | Create/update/delete Google Calendar entry |
| `packages/messaging` | `booking:created`, `booking:confirmed`, `booking:cancelled` | Dispatch via preferred channel adapter |

`packages/disputes` **does not** register a pusher — it emits (`dispute:opened`, `dispute:resolved`) and lets `packages/notifications` and `packages/messaging` react to those.

### Provider adapter startup registration

The `provider-adapters` skill §Step 5 says concrete providers are registered in `apps/server/src/index.ts`. When `packages/calendar` is extracted:

```typescript
// apps/server/src/index.ts — to be added
import { registerCalendarProvider } from "@my-app/calendar"
import { createGoogleCalendarProvider } from "@my-app/calendar/adapters/google"
import { env } from "@my-app/env"

registerCalendarProvider(createGoogleCalendarProvider({
  serviceAccountKey: env.GOOGLE_SERVICE_ACCOUNT_KEY,
}))
```

This must happen **before** any calendar event pusher fires — i.e., before the event bus receives its first `booking:confirmed`.
