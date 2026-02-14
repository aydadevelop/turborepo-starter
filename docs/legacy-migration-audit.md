# Legacy Migration Audit (`/legacy`)

Date: 2026-02-09

## Scope

- `legacy/cf-boat-api` (Hono + Worker API)
- `legacy/boat-app-main` (SvelteKit web + Telegram Mini App frontend)

## Quick Inventory

- Backend source files (`.ts`): 183
- Backend route files: 12
- Backend service files: 79
- Backend repository files: 15
- Backend tests: 70
- Frontend source files (`.ts` + `.svelte`): 352
- Frontend tests: 6 (includes mocks)

## Migration Progress (Current Monorepo)

- [x] Better Auth organization plugin integrated with canonical roles (`org_owner`, `org_admin`, `manager`, `agent`, `customer`).
- [x] Organization auth schema added (`organization`, `member`, `invitation`) with migration and tests.
- [x] API now resolves active organization membership in request context and exposes reusable org-permission procedures.
- [x] Scratch-first migration policy adopted (no legacy compatibility/backfill path in the new stack).
- [x] Boat management vertical is migrated with org-scoped guards and typed oRPC contracts (core, docks, amenities, assets, availability, calendar links, pricing).
- [x] Booking vertical is migrated with org-scoped guards and typed oRPC contracts (managed create/read/list/cancel, overlap prevention, source tracking, external refs).
- [x] Discount code support is in place (definition, activation, usage constraints, application snapshot per booking).
- [x] Customer/public booking baseline is migrated (`availabilityPublic`, `createPublic`) with overlap and pricing guards.
- [x] Booking lifecycle baseline is migrated (`booking_cancellation_request`, `booking_dispute`, `booking_refund`) with managed review/process endpoints.
- [x] Calendar provider adapter abstraction exists with Google implementation and adapter registry (`google`, `manual`, pluggable provider contract).
- [x] Google calendar sync supports both polling fallback and webhook-driven incremental sync (`events.watch` channel metadata persisted in DB).
- [x] Server routing is reorganized with Hono module boundaries (`health`, `auth`, `calendar-webhook`, `calendar-internal`) and route-level tests.
- [x] Helpdesk baseline is migrated (ticket/message schema + org-scoped oRPC contracts for create/list/assign/status/thread operations).
- [x] Multichannel intake baseline is migrated (canonical inbound envelope, dedupe/idempotency keys, org-scoped processing endpoints).
- [x] Telegram notification/webhook persistence baseline is migrated (notification queue/processing lifecycle + webhook event registry with idempotency).
- [x] Slot engine built as entity-agnostic pure functions (`packages/api/src/booking/slots.ts`): working-window resolution with midnight-crossing, busy-interval merging, free-gap computation, slot extraction at configurable step, minimum-notice filtering, and per-slot pricing enrichment.
- [x] Pricing engine built as entity-agnostic pure functions (`packages/api/src/booking/pricing.ts`): rule matching (duration discount, time window, weekend/holiday surcharge, passenger surcharge, custom), cents-based math, full quote generation (subtotal, service/affiliate/acquiring/tax fees, deposit split, pay-now/pay-later).
- [x] Public boat availability search endpoint (`booking.availabilityPublic`) with amenity key filtering, passenger capacity, boat type, price range, org/dock scoping, sorting (newest/price/capacity), pagination, and amenity facet counts.
- [x] Public booking quote endpoint (`booking.quotePublic`) with per-boat pricing + discount code application + before/after price breakdown.
- [ ] AI orchestration, affiliate, and landing domains are not migrated yet.

## High-Risk Findings

### P0: Secrets are committed in legacy infra config

`legacy/cf-boat-api/wrangler.toml` stores live credentials and tokens in plaintext under `[vars]` and `[env.local.vars]`.

- Evidence: `legacy/cf-boat-api/wrangler.toml:30`
- Impact: token leakage, account takeover, payment/provider abuse.
- Required action before migration starts:
  - Rotate all exposed credentials.
  - Remove secrets from tracked files.
  - Keep only non-secret defaults in config.

### P0: Manual auth and role checks are scattered and inconsistent

- JWT middleware is custom and role checks are boolean helpers (`admin/agent/owner/manager`):
  - `legacy/cf-boat-api/src/middleware/authMiddleware.ts:7`
- Role-based authorization is path-driven (`/manage/:role/...`) and resolved manually:
  - `legacy/cf-boat-api/src/routes/manageRoutes.ts:15`
- Public route bypass list is broad and string-prefix based:
  - `legacy/cf-boat-api/src/app.ts:62`

This is the main reason to migrate to Better Auth first.

### P1: Schema/type drift already exists

- Migration drops `users.role`:
  - `legacy/cf-boat-api/migrations/0009_nifty_ravenous.sql:1`
- Runtime code still queries `users.role`:
  - `legacy/cf-boat-api/src/services/PaymentService/ExternalPaymentProvider.ts:113`
- Types still require `role` on agent model:
  - `legacy/cf-boat-api/src/types/agent.ts:6`

This confirms backend type drift and hidden runtime risk.

### P1: Calendar sync is cron polling per boat, not event-driven

- Scheduled cron triggers calendar sync and cleanup:
  - `legacy/cf-boat-api/wrangler.toml:212`
  - `legacy/cf-boat-api/src/index.ts:13`
- Sync loops through all approved boats with calendars:
  - `legacy/cf-boat-api/src/services/Calendar/CalendarService.ts:90`

Current behavior scales linearly with boats and increases external API pressure.

### P1: Boat-centric domain coupling makes extension difficult

- `boatId` usage is widespread across backend (395 direct references).
- Generic CRUD layer relies on string entities and `any` payloads:
  - `legacy/cf-boat-api/src/repositories/ManageRepository.ts:64`
  - `legacy/cf-boat-api/src/services/ManageService.ts:45`

This blocks easy pivot from “boats only” toward a broader asset model.

### P2: Frontend tightly couples auth/session and role-path APIs

- Access/refresh token cookie handling is manual:
  - `legacy/boat-app-main/src/lib/api/request.ts:22`
- Manage API client embeds role in route path:
  - `legacy/boat-app-main/src/lib/api/client.ts:15`
- Telegram Mini App logic and web shell are intertwined:
  - `legacy/boat-app-main/src/routes/+layout.svelte:51`
  - `legacy/boat-app-main/src/lib/utils/startParam.ts:105`

## Domain Coverage Found in Legacy

The legacy codebase contains all listed business areas:

1. Boat management (roles, documents/media, approvals, availability)
2. Booking (filters, pricing, discounts, cancellation/dispute)
3. Help desk and support tickets
4. Multi-channel intake (Telegram, Avito, email, Sputnik adapter)
5. Telegram notifications + webhook callbacks
6. AI-assisted response scaffolding (partial)
7. Combined rental frontend (web + Telegram Mini App)
8. Management frontend
9. Affiliate-related fields/logic (partial)
10. Landing/content pages

## Parity Matrix (Legacy -> Current)

| Domain | Parity status | Missing focus |
| --- | --- | --- |
| 1) Boat management | Partial | Media pipeline hardening, approval workflows, role-guard depth tests |
| 2) Booking | Substantial | Public single-boat detail endpoint with slots, time-slot generation wired into availability search, available-filter metadata, date+duration input mode, payment-intent lifecycle, refund policy engine |
| 3) Calendar maintenance | Partial | Watch renewal worker, webhook failure recovery, additional providers |
| 4) Helpdesk | Partial | SLA timers, escalation automation, deeper lifecycle regression coverage |
| 5) Incoming requests | Partial | Provider adapters (Telegram/Avito/Sputnik), replay fixtures, routing heuristics |
| 6) Telegram notifications/webhooks | Partial | Callback route hardening, signature validation, operator interaction flows |
| 7) AI auto-response | Not started | Tool-governed orchestration + fallback + eval regression |
| 8) Rental frontend | Not started | UI for browse/availability/checkout (API layer substantially ready), mini-app boundary |
| 9) Management frontend | Not started | Role-aware operations UI + permission matrix UI tests |
| 10) Affiliate + landing pages | Not started | Attribution/commission model + referral tracking + content pipeline |

## Domain-by-Domain Missing Subtasks (Legacy -> Current)

### 1) Boat management (roles, media, availability, calendars)

Legacy evidence:

- `legacy/cf-boat-api/src/routes/manageRoutes.ts`
- `legacy/cf-boat-api/src/db/schema/boats.ts`
- `legacy/cf-boat-api/src/utils/r2Utils.ts`

Current status:

- Core migrated (`boat`, `dock`, amenities, assets metadata, availability rules/blocks, pricing profiles/rules, calendar connections).

Missing subtasks:

- [ ] Add production-grade media upload flow (signed upload URLs, storage constraints, malware/content checks, retention policy).
- [ ] Implement explicit approval/review workflow endpoints for assets/documents (schema exists, workflow API incomplete).
- [ ] Add stricter guard tests for role-sensitive write paths across all boat subresources.
- [x] Add night-shift and cross-midnight availability policy coverage as first-class domain tests (`packages/api/src/__tests__/booking-slots.test.ts`, `packages/api/src/__tests__/booking-availability.integration.test.ts`).

### 2) Booking (schedule, filters, pricing, discounts)

Legacy evidence:

- `legacy/cf-boat-api/src/routes/bookingRoutes.ts`
- `legacy/cf-boat-api/src/routes/filterRoutes.ts`
- `legacy/cf-boat-api/src/services/filterService.ts`
- `legacy/cf-boat-api/src/services/PriceService.ts`

Current status:

- Managed booking CRUD and overlap protection are migrated.
- Discount codes are migrated (with min amount, validity window, usage limits, per-customer limits).
- Public/customer booking baseline is migrated (public availability search + public quote + public create flow).
- Cancellation/dispute/refund lifecycle baseline is migrated (request/review/process APIs + DB lifecycle tables).
- Cancellation service now applies actor/time-based refund policy during cancellation flows (owner/customer), creates processed refund records, updates booking payment/refund state, emits refund notifications, and keeps calendar detach behavior.
--todo ideas - add admin level resolver, add policy per org configuration with defaults and adjustments
- Slot engine is built and tested (`computeBoatDaySlots`, `enrichSlotsWithPricing`, `filterSlotsAfterMinNotice`, midnight-crossing via `resolveWorkingWindow`).
- Pricing engine is built and tested (rule matching, cents math, full quote with fee breakdown, pay-now/pay-later split).
- `availabilityPublic` covers: boat filtering (status/active/approved), amenity key subquery, passenger capacity, boat type, price range, org/dock/search scoping, sorting, pagination, amenity facet counts, `includeUnavailable` flag, optional `withSlots`, and `availableFilters` metadata.
- `availabilityPublic` supports both range mode (`startsAt` + `endsAt`) and date mode (`date` + `durationHours`) for public search.
- `quotePublic` covers: single-boat pricing with discount code, before/after breakdown.
- `checkoutReadModelPublic` baseline is added (line items, payment split, policy summaries, localized labels for web/mini-app checkout UX).

Legacy filter features — parity status:

| Feature | Legacy (`filterService`) | Current | Status |
| --- | --- | --- | --- |
| Boat list with filters (passengers, amenities, dock) | `GET /api/filter` | `booking.availabilityPublic` | Done |
| Amenity filtering (9 legacy booleans) | Boolean columns on `boats` | `boat_amenity` key-value subquery | Done |
| Price range filtering | `minPrice`/`maxPrice` | `minEstimatedTotalCents`/`maxEstimatedTotalCents` | Done |
| Full pricing per boat (hourly, fees, total) | `PriceService.calculatePrice()` | `estimateBookingSubtotalCentsFromProfile` + `buildBookingPricingQuote` | Done |
| Pricing rules (duration, time window, weekend, passenger) | `PricingRules` table | `boatPricingRule` + `applyBoatPricingRulesToSubtotalCents` | Done |
| Night-shift / midnight-crossing | `workingHoursEnd > 24` | `resolveWorkingWindow` with `crossesMidnight` | Done |
| Minimum notice filtering | `minutesBeforeBooking` | `filterSlotsAfterMinNotice` | Done |
| Per-slot pricing enrichment | Computed per slot | `enrichSlotsWithPricing` | Done |
| Booking/block overlap removal | `calculateAvailability` | `mergeBusyIntervals` + `computeFreeGaps` | Done |
| Show unavailable boats | `showBooked` param | `includeUnavailable` param | Done |
| Before/after price display | `priceComponents` | `quotePublic` (before/after discount) | Done |
| Single boat by ID with full details | `GET /api/filter/boats/:id` | `booking.getByIdPublic` (dock, amenities, gallery, pricing, rules, slots; `includeInactive` for legacy direct-link parity) | Done (opt-in parity) |
| Time slots in search results | 30-min slots per boat in list | `availabilityPublic` + `withSlots` + `computeBoatDaySlots` | Done |
| Date+duration input mode | `date` + `duration` params | `availabilityPublic` accepts `date` + `durationHours` | Done |
| Available filter metadata | `generateAvailableFilters` (dates, times, durations, passengers) | `availableFilters` (`availableStartTimes`, `passengerOptions`, `durationOptions`) | Done (baseline) |
| 4-band availability sorting | Deterministic hourly rotation by availability bands | `availabilityPublic.sortBy=availability_bands` (slot-weighted deterministic grouping + hourly rotation) | Done |

Missing subtasks:

- [x] Align `getByIdPublic` direct-link behavior with legacy via `includeInactive` opt-in flag (default keeps active-only public behavior).
- [x] Wire slot generation into `availabilityPublic`: add `date` (ISO string) + `duration` (hours) as input alternatives to `startsAt`/`endsAt`; add `withSlots` flag to return per-boat time slots via `computeBoatDaySlots` + `filterSlotsAfterMinNotice`.
- [x] Add available-filter metadata to `availabilityPublic` output: `availableStartTimes` (union of slot start times), `passengerOptions` (distinct capacities), `durationOptions` (feasible durations from longest gap).
- [x] Add production checkout read model for web + mini app (quote breakdown, fee lines, policy summary, localized display fields).
- [ ] Add payment-intent lifecycle integration (reserve/capture/refund provider orchestration, idempotent retry semantics).
- [ ] Add expiration timer and clearance.
- [ ] Extend refund/dispute policy engine with richer reason taxonomy, explicit actor permission matrix, and evidence attachment workflow.
- [x] Add availability-band sorting strategy as a `sortBy` option (port legacy 4-band algorithm when needed for fairness rotation).

### 3) Calendar maintenance (adapter + webhook + fallback polling)

Legacy evidence:

- `legacy/cf-boat-api/src/services/Calendar/CalendarService.ts`
- `legacy/cf-boat-api/wrangler.toml` (cron schedule)

Current status:

- Google adapter implemented.
- Webhook endpoint implemented.
- Internal polling sync endpoint retained as fallback.
- Connection watch metadata persisted (`watchChannelId`, `watchResourceId`, `watchExpiresAt`, `syncToken`).
- Watch renewal and dead-letter management endpoints are available for operations.

Missing subtasks:

- [x] Add automatic watch renewal scheduler for expiring channels (safe lead-time renew strategy).
- [x] Add dead-letter/error recovery strategy for webhook processing failures.
- [x] Add idempotency guard for duplicate webhook notifications across retries.
- [ ] Add secondary provider adapters (Outlook/iCal) behind the existing adapter contract.

### 4) Help desk / support tickets

Legacy evidence:

- `legacy/cf-boat-api/src/db/schema/supportTickets.ts`
- `legacy/cf-boat-api/src/services/messaging/ticketing/TicketRepository.ts`
- `legacy/cf-boat-api/src/services/messaging/operator/telegram/TelegramSupportService.ts`

Current status:

- Baseline migrated (ticket and message schema + org-scoped lifecycle contracts).

Missing subtasks:

- [x] Define support domain schema and lifecycle states in new DB.
- [x] Implement support router/service contracts baseline (create, assign, status updates, threaded messages).
- [x] Add role-based operator controls aligned with Better Auth org permissions.
- [x] Add SLA timers and escalation automation.
- [ ] Add Hook to AI first line answers/categorizations (context aware, proper guards, faq)
- [x] Add regression tests for ticket threading and closure/escalation edge cases.

### 5) Incoming requests (Avito, Telegram, Sputnik/email)

Legacy evidence:

- `legacy/cf-boat-api/src/services/messaging/channels/AvitoChannelProvider.ts`
- `legacy/cf-boat-api/src/services/messaging/channels/TelegramChannelProvider.ts`
- `legacy/cf-boat-api/src/services/messaging/ingestion/email/adapters/SputnikAdapter.ts`

Current status:

- Baseline migrated (canonical envelope + idempotent dedupe + processing endpoints).

Missing subtasks:

- [x] Define canonical inbound message envelope and identity mapping in new stack.
- [x] Add dedupe/idempotency and replay-safe ingestion baseline.
- [ ] Implement channel adapters incrementally (Telegram first, then Avito, then email/Sputnik).
- [ ] Add integration test fixtures per provider webhook/payload shape.

### 6) Telegram notifications + webhook callbacks

Legacy evidence:

- `legacy/cf-boat-api/src/routes/messagingRoutes.ts`
- `legacy/cf-boat-api/src/services/notification/NotificationService.ts`

Current status:

- Baseline migrated (notification lifecycle + delivery audit fields + webhook event registry).

Missing subtasks:

- [x] Implement Telegram notification queue + processing lifecycle in new API layer.
- [x] Add audit trail for outbound notification delivery and retries.
- [x] Add idempotent webhook event registry for Telegram updates.
- [ ] Implement Telegram bot webhook route set (user and operator callbacks).
- [ ] Add callback signature/auth hardening.

### 7) AI auto-response with tools

Legacy evidence:

- `legacy/cf-boat-api/src/services/AI/orchestrator.ts`
- `legacy/cf-boat-api/src/services/AI/toolRegistry.ts`

Current status:

- Not migrated (intentionally deferred).

Missing subtasks:

- [ ] Rebuild AI orchestration behind explicit tool interfaces and policy guards.
- [ ] Add deterministic fallback path when LLM/tool calls fail.
- [ ] Add eval-style regression suite for high-risk intents (pricing, cancellation, support escalation).

### 8) Rental frontend (web + Telegram mini app)

Legacy evidence:

- `legacy/boat-app-main/src/routes/boats/+page.svelte`
- `legacy/boat-app-main/src/routes/order/+page.svelte`
- `legacy/boat-app-main/src/routes/+layout.svelte`

Current status:

- Not migrated (new `apps/web` exists but does not yet implement rental parity).

Missing subtasks:

- [ ] Implement typed client flows for browse -> availability -> booking -> confirmation.
- [ ] Add Telegram mini-app adapter boundary (init data, launch params, auth bootstrap).
- [ ] Add end-to-end regression suite for booking happy path and overlap rejection.

### 9) Management frontend

Legacy evidence:

- `legacy/boat-app-main/src/routes/admin/+page.svelte`
- `legacy/boat-app-main/src/routes/agent/+page.svelte`
- `legacy/boat-app-main/src/lib/api/client.ts`

Current status:

- Not migrated.

Missing subtasks:

- [ ] Build role-aware management UI on top of typed oRPC procedures (no role-in-path API model).
- [ ] Add operational pages for boat setup, pricing rules, calendar connections, and booking operations.
- [ ] Add permission matrix UI tests against Better Auth roles.

### 10) Affiliate service + static landing pages

Legacy evidence:

- `legacy/cf-boat-api/src/services/PriceService.ts` (commission/affiliate logic)
- `legacy/boat-app-main/src/content/pages/partners.md`
- `legacy/boat-app-main/src/routes/pages/[slug]/+page.ts`

Current status:

- Not migrated.

Missing subtasks:

- [ ] Model affiliate attribution, commission accrual, and payout state machine in dedicated schema.
- [ ] Add referral/partner tracking on booking pipeline.
- [ ] Recreate static/legal/marketing page pipeline in current frontend with content governance.

## Current Priority Order (Updated)

1. Complete booking production parity: filter/read model, payment/refund policy hardening, and edge-case pricing coverage.
2. Finish calendar reliability: watch renewal worker + webhook failure recovery + adapter contract hardening.
3. Deepen helpdesk/intake/telegram baseline into provider-grade workflows (channel adapters, secure webhooks, SLA automation).
4. Add end-to-end regression pack for the core journey:
   - create org
   - assign manager
   - create boat
   - configure pricing
   - connect calendar
   - sync events
   - reject overlap booking
   - complete valid booking path.

## Checkpoint (2026-02-09)

Completed in current stack:

- [x] Public availability + public booking creation endpoints.
- [x] Booking lifecycle tables and API surfaces for cancellation requests, disputes, and refunds.
- [x] Discount code application snapshot and validation in booking flow.
- [x] API/DB automated tests for booking lifecycle baseline.

Still open before production use:

- [ ] Payment-provider settlement/capture/refund orchestration and reconciliation.
- [ ] Booking filter/search parity from legacy.
- [ ] Additional calendar providers and production ops playbooks.
- [ ] End-to-end regression suite over org -> boat -> pricing -> calendar -> booking flow.
- [ ] Channel adapter integration tests and secure Telegram callback flows.

## Migration Strategy (Better Auth First)

## Phase 0: Stabilize and secure

- Rotate and revoke leaked secrets.
- Freeze feature work in legacy auth/role code.
- Establish migration branch and compatibility checklist.

## Phase 1: Identity and permissions foundation (first project)

Goal: replace manual JWT + role booleans with Better Auth + explicit membership/role model.

1. Add org membership model in new stack (`packages/db` + `packages/auth`):
   - `organizations`
   - `organization_memberships`
   - `organization_roles` (or enum-backed role field)
2. Canonical roles for v1:
   - `org_owner`, `org_admin`, `manager`, `agent`, `customer`
3. Add permission matrix in one place (policy map), not in route files.
4. Replace `/manage/:role/...` authorization with session+membership checks from Better Auth context.
5. Keep migration scratch-first: no legacy boolean-role compatibility layer in new APIs.

Exit criteria:

- No route depends on `users.admin/agent/owner/manager` booleans.
- No route takes role from URL for authorization decisions.
- Session identity is sourced only from Better Auth.

## Phase 2: Domain extraction and API contracts

1. Split legacy logic into typed modules in `packages/api`:
   - `boat-management`
   - `booking`
   - `pricing`
   - `messaging`
   - `support`
2. Move from dynamic entity CRUD (`string` + `any`) to explicit oRPC contracts.
3. Generate OpenAPI from oRPC for external integrations.
4. Introduce shared DTO/schema layer to keep frontend/backend types aligned.

## Phase 3: Calendar abstraction and webhook model

1. Create calendar provider adapter interface:
   - `CalendarProvider.syncIncremental()`
   - `CalendarProvider.createWatch()`
   - `CalendarProvider.stopWatch()`
2. Keep polling as fallback; default to push/webhook for Google.
3. Persist channel metadata (`channelId`, `resourceId`, `expiresAt`, `syncToken`).
4. Add renewal job only for expiring watches.

TODO (explicit):

- [ ] Replace per-boat 2-minute polling with Google Calendar webhook channels (`events.watch`) + incremental sync on webhook receipt.
- [ ] Add watch renewal/cleanup worker for channel expiration.
- [ ] Keep emergency cron fallback (lower frequency) behind a feature flag.

## Phase 4: Frontend split and transport cleanup

1. Replace manual cookie token flow with Better Auth client/session.
2. Replace role-path manage client with typed RPC client methods.
3. Split user experiences by app boundary:
   - rental app (web + mini app compatibility)
   - management app
4. Keep Telegram-specific launch/start-param logic as an adapter layer, not core app auth logic.

## Phase 5: Test system reset (TDD + regression + manual)

1. Contract tests for each router (API behavior, auth rules, role policy).
2. Domain tests for pricing/discount/cancellation edge cases.
3. Integration tests for calendar sync and webhook handlers.
4. Playwright regression pack for critical booking/management flows.
5. CI gates: `lint`, `check-types`, `test`, `test:e2e`, plus migration smoke tests.

## Recommended First Sprint (2 weeks)

1. Security hardening: remove secrets from legacy tracked config, rotate credentials.
2. Implement Better Auth org membership schema in current monorepo.
3. Add centralized permission matrix and middleware helpers.
4. Migrate one vertical slice end-to-end:
   - read-only boats list for management
   - scoped by org membership role
   - typed oRPC contract + test coverage.

This gives a safe baseline before migrating booking/pricing complexity.

## Notes on Architecture Direction

- Current Better-T-Stack repo is a good target for migration (`oRPC + Better Auth + Drizzle + Turbo`).
- Keep calendar provider-agnostic from day one (Google first adapter).
- Avoid generic `entity` CRUD for new code; explicit domain APIs are easier to secure and test.
