# ADR-003: Missing Extractions from `full-stack-cf-app`

**Date:** 2026-03-10
**Status:** Active
**Authors:** Platform Team
**Related:** [ADR-001: Legacy Extraction Plan](./001_legacy-extraction.md) | [ADR-002: Architecture Patterns](./002_architecture-patterns.md)

---

## Table of Contents

1. [Context](#context)
2. [Gap Analysis — Current State vs. ADR-001 Targets](#gap-analysis--current-state-vs-adr-001-targets)
3. [1. Missing Packages (New Packages Required)](#1-missing-packages-new-packages-required)
   - [1.1 packages/calendar](#11-packagescalendar)
   - [1.2 packages/messaging](#12-packagesmessaging)
   - [1.3 packages/disputes](#13-packagesdisputes)
4. [2. Gaps in Existing Packages](#2-gaps-in-existing-packages)
   - [2.1 packages/booking](#21-packagesbooking)
   - [2.2 packages/pricing](#22-packagespricing)
   - [2.3 packages/catalog](#23-packagescatalog)
5. [3. Missing API Layer](#3-missing-api-layer)
   - [3.1 packages/api — Missing Handlers](#31-packagesapi--missing-handlers)
   - [3.2 packages/api — Missing Library Module](#32-packagesapi--missing-library-module)
   - [3.3 packages/api-contract — Missing Route Contracts](#33-packagesapi-contract--missing-route-contracts)
6. [4. Missing App Layer](#4-missing-app-layer)
   - [4.1 apps/server — Missing Routes and Queue Consumers](#41-appsserver--missing-routes-and-queue-consumers)
7. [5. Extraction Priority Table](#5-extraction-priority-table)
8. [Consequences](#consequences)
9. [6. Skill Alignment Notes](#6-skill-alignment-notes)

---

## Context

ADR-001 defined the full extraction inventory from `full-stack-cf-app` into this turborepo. Phases 01–05 have been completed, bringing the foundational packages (`packages/events`, `packages/workflows`, `packages/db`, `packages/auth`, `packages/notifications`), and the first wave of domain packages (`packages/booking`, `packages/pricing`, `packages/catalog`, `packages/availability`, `packages/payment`, `packages/support`) online.

This ADR records the **remaining gap**: modules that exist in `legacy/full-stack-cf-app/packages/api/src/` and `legacy/full-stack-cf-app/apps/server/src/` that have **not yet been extracted** into the turborepo target. It serves as the authoritative checklist for Phase 06 and beyond.

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
| `packages/availability` | ✅ Done |
| `packages/payment` (webhook adapters) | ✅ Done (`packages/api/payments/webhooks/`) |
| `packages/support` | ✅ Done |
| `packages/calendar` | ❌ Missing |
| `packages/messaging` | ❌ Missing |
| `packages/disputes` | ❌ Missing |
| Admin handlers in `packages/api` | ❌ Partial |
| Helpdesk + intake handlers in `packages/api` | ❌ Missing |
| Boat sub-resource handlers | ❌ Missing |
| Calendar + booking lifecycle routes in `apps/server` | ❌ Missing |

---

## 1. Missing Packages (New Packages Required)

### 1.1 `packages/calendar`

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

### 1.2 `packages/messaging`

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

**Design constraints for extraction:**
- The adapter registry is the only import; calling code never imports a concrete adapter directly.
- Telegram delivery must remain queue-backed (`packages/queue` / pg-boss) to respect Telegram's rate limits.
- Inbound normalization (converting raw Telegram/Avito webhook payloads to internal `ChannelMessage`) stays in the adapter, not in the handler.
- `packages/messaging/src/index.ts` must call `registerEventPusher` (from `@my-app/events`) at startup if any outbound dispatch is event-driven. Events it may consume: `booking:created` (send confirmation via customer's preferred channel), `booking:confirmed`, `booking:cancelled`.
- `packages/messaging` depends on `packages/db`, `packages/events`, and `packages/queue`. It must **not** depend on `packages/support`.

**Tests to port:** `__tests__/channel-adapters.test.ts`, `__tests__/channel-dispatch.integration.test.ts`, `__tests__/telegram.integration.test.ts`, `__tests__/ticketing-multichannel.integration.test.ts`

---

### 1.3 `packages/disputes`

**Source:** `packages/api/src/routers/booking/cancellation/` and `packages/api/src/routers/booking/dispute.ts` and `packages/api/src/routers/booking/refund.ts`

ADR-001 designated a `packages/disputes` package for cancellation flows and dispute processing. Currently, only a basic `cancellation-service.ts` and `cancellation-reasons.ts` exist in `packages/booking`. The sophisticated cancellation policy engine, policy templates, and dispute/refund flows have not been extracted.

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

---

## 3. Missing API Layer

### 3.1 `packages/api` — Missing Handlers

The following thin oRPC router files exist in the legacy `packages/api/src/routers/` but have no equivalent in the turborepo `packages/api/src/handlers/`:

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

## 5. Extraction Priority Table

| Priority | Item | Target Package / App | Depends On |
|---|---|---|---|
| **P0** | `action-policy.ts`, `slots.ts`, `overlap.ts` | `packages/booking` | none (pure functions) |
| **P0** | `pricing-profile.ts` | `packages/pricing` | `packages/db` |
| **P0** | `packages/calendar` — all files | `packages/calendar` (new) | `packages/db`, `packages/events` |
| **P1** | `packages/messaging` — all files | `packages/messaging` (new) | `packages/db`, `packages/events`, `packages/queue`, `packages/support` |
| **P1** | `packages/disputes` — cancellation policy + dispute | `packages/disputes` (new) | `packages/booking`, `packages/payment`, `packages/events`, `packages/workflows` |
| **P1** | `expiration.ts`, `checkout-read-model.ts`, `availability-ranking.ts` | `packages/booking` | `packages/pricing`, `packages/queue` |
| **P1** | `discount/resolution.ts`, `affiliate.ts` | `packages/booking` | `packages/db`, `packages/events` |
| **P1** | Catalog sub-resources (amenity, asset, dock, min-duration, access, calendar-lifecycle) | `packages/catalog` | `packages/db`, `packages/calendar` |
| **P2** | Missing booking sub-handlers + discount/affiliate/refund/shift contracts | `packages/api`, `packages/api-contract` | all domain packages above |
| **P2** | Missing boat sub-resource handlers + contracts | `packages/api`, `packages/api-contract` | `packages/catalog`, `packages/calendar` |
| **P2** | Missing admin handlers (boats, bookings, fee-config, support) | `packages/api`, `packages/api-contract` | all domain packages |
| **P2** | Helpdesk + intake handlers + contracts | `packages/api`, `packages/api-contract` | `packages/messaging`, `packages/support` |
| **P2** | `booking-notification-recipients.ts` | `packages/api/src/lib/` | `packages/db` |
| **P3** | Calendar routes + booking lifecycle consumer | `apps/server` | `packages/calendar`, `packages/booking`, `packages/queue` |

---

## Consequences

**Positive:**
- This ADR closes the documentation gap created by phases 01–05 progressing without a recorded inventory of what remains.
- Phases 06+ now have a canonical source for backlog items — no need to diff the legacy repo manually during planning.
- P0 items (action-policy, slots, overlap, pricing-profile, packages/calendar) unblock the booking and availability search flows that are still using the legacy API in production.

**Risks:**
- `packages/calendar` contains the full Google Calendar OAuth flow. The redirect URI and token storage must be validated against the new domain before the extraction is considered done.
- `packages/messaging` has five live channel adapters. Avito and Sputnik channel credentials must be re-provisioned for the new deployment and tested end-to-end before turning off the legacy server.
- `CancellationPolicyService` (519 lines) contains financial logic for refund splits. It must be ported with its full integration test suite (`__tests__/booking-cancellation.integration.test.ts`) before any production use.
- The booking lifecycle queue consumer in `apps/server` must be started after `packages/calendar` is live — starting it earlier will emit calendar events with no registered adapter and silently drop them.

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

