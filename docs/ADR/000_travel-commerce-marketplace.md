# ADR-000: Travel Commerce Marketplace — Architecture Knowledge Base

> **Status:** Living document  
> **Created:** 2026-03-09  
> **Domain:** Multi-org marketplace for time-slot rentals (boats, cars, apartments, equipment, tours)  
> **Scope:** Schema design, access control, payment flows, assistant AI, storefront, and integration patterns

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [System Architecture](#2-system-architecture)
3. [Actor Model & Access Control](#3-actor-model--access-control)
4. [Multi-Tenancy Model](#4-multi-tenancy-model)
5. [Schema Design Decisions](#5-schema-design-decisions)
6. [Implemented Schema Inventory](#6-implemented-schema-inventory)
7. [Booking Lifecycle](#7-booking-lifecycle)
8. [Pricing & Fee Architecture](#8-pricing--fee-architecture)
9. [Payment Integration](#9-payment-integration)
10. [Publication & Storefront](#10-publication--storefront)
11. [Availability & Calendar Sync](#11-availability--calendar-sync)
12. [Cancellation & Shift Requests](#12-cancellation--shift-requests)
13. [Affiliate & Attribution](#13-affiliate--attribution)
14. [Support & Inbound Messaging](#14-support--inbound-messaging)
15. [Reviews & Trust](#15-reviews--trust)
16. [AI Assistant Architecture](#16-ai-assistant-architecture)
17. [Search Infrastructure](#17-search-infrastructure)
18. [Notification Pipeline](#18-notification-pipeline)
19. [Event-Driven Architecture](#19-event-driven-architecture)
20. [Conventions & Patterns](#20-conventions--patterns)
21. [Deferred Features & TODOs](#21-deferred-features--todos)

---

## 1. Product Vision

A **multi-organization marketplace platform** where organizations list time-slot-based services (boat rentals, car rentals, apartment stays, equipment hire, guided tours) and customers book them through multiple distribution channels.

**Key properties:**
- **Multi-org:** Each organization manages its own listings, bookings, staff, and payment config. Complete data isolation between orgs.
- **Multi-channel:** A single listing can be published to the platform marketplace, the org's own website, a partner widget, or a white-label storefront — each channel with its own pricing, fees, and payment routing.
- **Listing-type agnostic:** The platform doesn't hard-code "boat" or "car." A `listingTypeConfig` registry defines types with JSON Schema metadata validation. Orgs pick which types they support.
- **Contract-first APIs:** oRPC contracts define the entire API surface. Client, server, and assistant all share typed contracts.
- **AI-assisted:** An AI assistant helps both customers (search, booking) and operators (content generation, operations management) and inbound sources.

---

## 2. System Architecture

### Monorepo Structure

```
apps/web          → SvelteKit (Svelte 5) + shadcn-svelte, customer & operator UI
apps/server       → Hono + oRPC, main API entrypoint
apps/assistant    → Hono AI service, separate process on port 3001
apps/notifications→ Queue consumer (pg-boss), email/push dispatch

packages/api          → oRPC router implementations, thin transport handlers, middleware
packages/api-contract → Shared contract types (Zod schemas, route shapes)
packages/assistant    → AI router, tools, transport, system prompt
packages/auth         → Better Auth + organization plugin
packages/db           → Drizzle schema, migrations, DB connection
packages/env          → Typed env vars (t3-env)
packages/queue        → pg-boss wrapper
packages/ui           → Shared shadcn-svelte components
packages/ai-chat      → AI chat UI components
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun |
| Monorepo | Turborepo |
| Frontend | SvelteKit (Svelte 5 runes), shadcn-svelte, TanStack Query v6 |
| API | Hono + oRPC (contract-first) |
| Auth | Better Auth + organization plugin |
| Database | PostgreSQL + Drizzle ORM |
| Search | pgvector (semantic), pg_textsearch/BM25 (keyword), tsvector/GIN (basic) |
| Queue | pg-boss (PostgreSQL-backed) |
| AI | Vercel AI SDK v6 + OpenRouter |
| Deployment | Dokku on VPS, Docker images via GHCR, Pulumi IaC |
| Testing | Vitest (unit), Playwright (e2e), PGlite (in-memory DB tests) |

### Middleware Chain (Request Pipeline)

```
publicProcedure                              → anyone (health, ping, storefront)
  └→ sessionProcedure (requireSession)       → logged in (anonymous OK)
      └→ protectedProcedure (requireAuth)    → logged in (non-anonymous)
          └→ organizationProcedure           → has active org membership
              └→ organizationPermissionProc  → has specific permission in role
```

**Key context in handlers:**
- `context.session.user.id` — acting user
- `context.activeMembership.organizationId` — tenant boundary
- `context.activeMembership.role` — RBAC role string
- `context.eventBus` — domain events → notification pipeline
- `context.notificationQueue` — pg-boss producer

---

## 3. Actor Model & Access Control

### Actor Types

| Actor | Auth Mechanism | Org Membership | Role |
|-------|---------------|----------------|------|
| **Platform Admin** | `user.role = "admin"` | Any or none | N/A (platform-level) |
| **Org Owner** | Registered user | `member.role = "org_owner"` | Full control |
| **Org Admin** | Registered user | `member.role = "org_admin"` | Same as owner minus deletion |
| **Manager** | Registered user | `member.role = "manager"` | Day-to-day ops |
| **Agent** | Registered user | `member.role = "agent"` | Frontline support |
| **Member** | Registered user | `member.role = "member"` | Read-only |
| **Customer** | Registered user | `member.role = "customer"` | Own bookings/tickets |
| **Anonymous** | `is_anonymous = true` or no session | None | Browse storefront |
| **External Service** | API key | Linked via `assistant_api_key` | Widget/bot integration |

### RBAC Model

- Roles are stored on `member.role` (per org-user pair)
- One user can hold **different roles in different orgs** (e.g., owner of Org A, customer of Org B)
- `session.activeOrganizationId` determines which org context is active
- Platform admin checked via `user.role = "admin"` (separate from org roles)
- Permissions are hierarchical: org_owner > org_admin > manager > agent > member > customer

### Isolation Rules

| Rule | Enforcement Layer |
|------|------------------|
| Org A cannot see Org B data | `WHERE organizationId = ctx.activeMembership.organizationId` |
| Customer sees only own bookings | `WHERE customerUserId = ctx.session.user.id` |
| Payment credentials never in SELECT | Domain query projection |
| Storefront crosses org boundaries | Only via `listing_publication` join (intentional) |
| Platform admin bypasses org scope | Separate `requirePlatformAdmin` middleware |

---

## 4. Multi-Tenancy Model

### Customer Boundary (Decision: Hybrid Auto-Membership)

**Problem:** Customer books from Org X but isn't an org member. How does org-scoped middleware work?

**Decision (Option C — Hybrid):** Customer auto-enrolled as `member(role: "customer")` when they book. A cross-org "My Bookings" view uses `protectedProcedure` (not org-scoped).

**Implementation rules:**
1. `createBooking()` checks for existing membership; inserts `member(role: "customer")` if absent
2. Org management UI filters `WHERE role != 'customer'` by default; "Customers" tab shown separately
3. `activeOrganizationId` not auto-switched when browsing storefront
4. Cross-org "my bookings": `protectedProcedure` → query all bookings where `customerUserId = session.user.id`

### Storefront Identity (Decision: Shopify Model — Option A)

**Problem:** Should customers have separate profiles per storefront?

**Decision:** Shared `user` auth across all storefronts. Query-level isolation via `publicationId`/`channelId` filtering. No `storefrontCustomerProfile` table — avoids duplicating auth/profile functionality.

**Rationale:** A `storefrontCustomerProfile` would duplicate user fields and create sync headaches. The Shopify model (one account, see orders from all shops) is simpler and proven.

**Future option:** A `storefront` config table (domain, brand, theme) can be added later for multi-domain routing without touching auth.

### Data Residency Categories

Every table belongs to exactly one ownership scope:

| Category | organizationId | userId | Access Pattern |
|----------|---------------|--------|----------------|
| **Platform** | NULL | NULL | Platform admin only |
| **Org-owned** | NOT NULL | NULL | `organizationProcedure` |
| **Org+User** | NOT NULL | NOT NULL | Both FKs required |
| **User-owned** | NULL | NOT NULL | `protectedProcedure` |

### Denormalization Rule (Decision D8)

Every org-scoped table includes its own `organizationId` FK, even if derivable via JOINs. Reasons:
- Direct index scan without JOINs for tenant queries
- Notification events need `organizationId` at every level
- Consistent with all existing tables
- PostgreSQL storage cost is negligible

---

## 5. Schema Design Decisions

### D1: Customer Auto-Enrollment → Option C (Hybrid)
See [Multi-Tenancy Model §Customer Boundary](#customer-boundary-decision-hybrid-auto-membership).

### D2: Listing Metadata Validation → Validate on Publish, Warn on Save
- Drafts can have partial/invalid `metadata` (jsonb)
- Full JSON Schema validation (via `listingTypeConfig.metadataJsonSchema` + ajv) runs on status → `active`
- Draft saves return `{ warnings: [...] }` — don't block
- Cache `listingTypeConfig` rows in-memory (rarely change)

### D3: Storefront Cross-Org Queries → Publication as Opt-In Gate
- Storefront uses `publicProcedure` with queries through `listing_publication`
- The publication table is the ONLY intentional cross-org boundary
- Index: `(channel_type, is_active, visibility)` WHERE `channel_type = 'platform_marketplace'`

### D4: Calendar Sync Tokens → Plain Text, No Encryption
- Sync tokens and watch channel IDs are session tokens, not secrets
- They expire and rotate; calendar event content is NOT stored
- No encryption overhead needed

### D5: Payment Config Mid-Booking → Snapshot at Creation
- `booking.merchantPaymentConfigId` frozen at creation time
- Even if org changes providers, existing bookings use original config
- Payment configs are soft-deleted (`isActive = false`), never hard-deleted

### D6: Index Strategy → Lean Start, Monitor with pg_stat
1. Always index: `organizationId`, FKs used in JOINs
2. Index for frequent WHERE: `status`, `paymentStatus`, `customerUserId`, `startsAt`
3. Composite for range scans: `(listingId, startsAt, endsAt)`
4. Skip low-cardinality solo indexes
5. Monitor: `SELECT * FROM pg_stat_user_indexes WHERE idx_scan = 0`

### D7: Event Bus → Multi-Pusher Pattern
- `ctx.eventBus.emit({ type: "booking:confirmed", data: { bookingId, ownerId } })` fans out to registered pushers (in-process, synchronous):
  - `notificationsPusher` (registered by `packages/notifications`) → notification pipeline
  - `trackingPusher` → CAPI conversion events
  - `calendarSyncPusher` (registered by `packages/calendar`) → Google Calendar sync
- Pushers self-register in their own package's `index.ts` via `registerEventPusher`. See [ADR-002](./002_architecture-patterns.md).
- NO generic event sourcing. Each pusher is explicit.
- In-process only: the event bus is NOT a queue. Pusher callbacks run synchronously in the emitting process.

### D9: Listing Approval → Skip for MVP, Column Ready
- `listing.approvedAt` exists (nullable) but unused in MVP
- Future: `listingModeration` table with reviewer comments
- Enforcement in domain layer, not DB constraint (allows grandfathering)

### D10: Booking Time Overlap → PostgreSQL Exclusion Constraint
```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE booking ADD CONSTRAINT booking_no_time_overlap
  EXCLUDE USING gist (
    listing_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status NOT IN ('cancelled', 'rejected', 'no_show'));
```
- `[)` (closed-open): booking ending at 15:00 doesn't conflict with one starting at 15:00
- Application layer checks first (clean error message); constraint is the safety net

### D8: Denormalize organizationId → Yes, Always
Every org-scoped table includes its own `organizationId` FK, even if derivable via JOINs. See [Multi-Tenancy Model §Denormalization Rule](#denormalization-rule-decision-d8).

### Basis Points Convention
All percentage fields use **integer basis points** (not floating-point percentages):
- `250` = 2.50%, `10000` = 100%
- Consistent with cents pattern for money (integer-only arithmetic)
- Allows sub-percentage precision without floating-point errors
- All 17 fee/percentage fields renamed from `*Percentage` → `*Bps`

### Features Explicitly Not Needed
- **Recurring bookings** (recurrence templates) — confirmed not needed
- **Waitlist** (queue for fully-booked slots) — confirmed not needed

---

## 6. Implemented Schema Inventory

**57 tables, 46 enums, 55 relation blocks** across 9 schema domains.

### By Domain

| Domain | File | Tables | Enums |
|--------|------|--------|-------|
| Auth | `schema/auth.ts` | 8 (user, session, account, passkey, verification, organization, member, invitation) | 0 |
| Marketplace | `schema/marketplace.ts` | 27 | 25 |
| Availability | `schema/availability.ts` | 7 | 4 |
| Affiliate | `schema/affiliate.ts` | 3 | 3 |
| Support | `schema/support.ts` | 3 | 6 |
| Notification | `schema/notification.ts` | 5 | 5 |
| Assistant | `schema/assistant.ts` | 2 | 2 |
| Consent | `schema/consent.ts` | 1 | 1 |
| Todo (demo) | `schema/todo.ts` | 1 | 0 |

### Marketplace Tables (27)

**Org Config:** `organizationSettings`  
**Listing Types:** `listingTypeConfig` (platform), `organizationListingType`  
**Listings:** `listing`, `listingLocation`, `listingAmenity`, `listingAsset`  
**Pricing:** `listingPricingProfile`, `listingPricingRule`, `platformFeeConfig` (platform), `paymentProviderConfig` (platform)  
**Payment:** `organizationPaymentConfig`, `paymentWebhookEvent`  
**Publication:** `listingPublication`  
**Booking Core:** `booking`, `bookingDiscountCode`, `bookingDiscountApplication`, `bookingPaymentAttempt`  
**Booking Workflows:** `bookingShiftRequest`, `bookingCancellationRequest`, `bookingDispute`, `bookingRefund`  
**Reviews:** `listingReview`, `listingReviewResponse`  
**Staff:** `listingStaffAssignment`, `bookingStaffAssignment`  
**Cancellation:** `cancellationPolicy`

### Availability Tables (7)

`listingAvailabilityRule`, `listingAvailabilityException`, `listingAvailabilityBlock`, `listingMinimumDurationRule`, `listingCalendarConnection`, `calendarWebhookEvent`, `bookingCalendarLink`

### Affiliate Tables (3)

`affiliateReferral`, `bookingAffiliateAttribution`, `bookingAffiliatePayout`

### Support Tables (3)

`supportTicket`, `supportTicketMessage`, `inboundMessage`

---

## 7. Booking Lifecycle

### Status State Machine

```
                                  ┌─────────────┐
                         ┌───────→│  rejected    │
                         │        └─────────────┘
┌─────────┐   ┌─────────┴──────┐   ┌───────────┐   ┌───────────────┐   ┌───────────┐
│ pending  ├──→│awaiting_payment├──→│ confirmed │──→│ in_progress   │──→│ completed │
└────┬────┘   └───────┬────────┘   └─────┬─────┘   └───────┬───────┘   └─────┬─────┘
     │                │                   │                 │                 │
     └──→ cancelled   └──→ cancelled      └──→ no_show      └──→ cancelled    └──→ disputed
```

### Status Definitions

| Status | Meaning | Entry Condition |
|--------|---------|----------------|
| `pending` | Created, awaiting confirmation | Booking just created |
| `awaiting_payment` | Confirmed intent, payment widget shown | Auto or manual confirm |
| `confirmed` | Payment received or manually confirmed | Payment captured / manual |
| `in_progress` | Booking time has started | Cron: `startsAt <= now()` |
| `completed` | Service delivered | Cron: `endsAt <= now()` |
| `cancelled` | Cancelled by customer or org | Cancellation approved |
| `rejected` | Rejected by org (never confirmed) | Org rejects pending booking |
| `no_show` | Customer didn't show | Org marks no-show |
| `disputed` | Payment dispute/chargeback | Chargeback received from provider |

### Time-Based Transitions (pg-boss cron)

Two transitions are **automated via `booking-lifecycle-tick` job** (every 5 minutes):
1. `confirmed → in_progress`: when `startsAt <= now()`
2. `in_progress → completed`: when `endsAt <= now()`

Both emit domain events: `booking.started` / `booking.completed` → trigger review prompts, affiliate eligibility, calendar cleanup.

### Payment Status (separate track)

`unpaid` → `pending` → `partially_paid` → `paid` → `refunded` (or `failed`)

### Booking Sources

`manual` | `web` | `telegram` | `partner` | `api` | `calendar_sync`

---

## 8. Pricing & Fee Architecture

### Three-Layer Fee Model

There are **org-level fees** (what the org charges the customer) and **platform fees** (what the platform takes from the org).

#### Org Fees (on `listingPricingProfile`)
- `serviceFeeBps` — org's surcharge on top of base price
- `affiliateFeeBps` — affiliate commission
- `taxBps` — tax rate
- `depositBps` — upfront collection percentage
- `acquiringFeeBps` — payment processing fee passthrough

#### Platform Fee Resolution (most specific wins)
```
1. listingPublication.platformFeeBps          ← per-publication override
2. organizationPaymentConfig.platformServiceFeeBps  ← per-org override
3. platformFeeConfig.platformFeeBps           ← global default
```

All fees are **snapshotted into `booking.platformCommissionCents`** at creation time — historical bookings unaffected by config changes.

### Pricing Profiles

Each listing can have multiple named profiles (e.g., "Summer 2026", "Winter Off-Peak", "Weekend Special"):
- `baseHourlyPriceCents` + `minimumHours`
- `validFrom` / `validTo` for seasonal pricing
- `isDefault` flag for fallback
- A `listingPublication` can override the profile (different pricing per channel)

### Dynamic Pricing Rules

`listingPricingRule` entries apply adjustments on top of the profile:
- Types: `duration_discount`, `time_window`, `weekend_surcharge`, `holiday_surcharge`, `passenger_surcharge`, `custom`
- Adjustment: `percentage` or `fixed_cents`
- Priority ordering for conflict resolution

### Discount Codes

`bookingDiscountCode` with atomic `usageCount` increment:
```sql
UPDATE booking_discount_code
SET "usageCount" = "usageCount" + 1
WHERE id = $1 AND "isActive" = true
  AND ("usageLimit" IS NULL OR "usageCount" < "usageLimit")
RETURNING *;
```
Prevents TOCTOU race conditions. Per-customer limits checked via `bookingDiscountApplication` count.

---

## 9. Payment Integration

### Provider Abstraction

- `paymentProviderConfig` — platform-level provider registry (CloudPayments, Stripe, etc.)
- `organizationPaymentConfig` — org's configured provider with encrypted credentials
- `paymentWebhookEvent` — raw webhook log per org/endpoint

### Booking Payment Flow

1. Booking created → `merchantPaymentConfigId` snapshotted
2. `bookingPaymentAttempt` created with idempotency key
3. Payment provider processes → webhook → update attempt status
4. On capture: booking.paymentStatus → `paid`, booking.status → `confirmed`

### Payment Attempt Statuses

`initiated` → `requires_action` (3DS) → `authorized` → `captured` → `refunded` (or `failed`/`cancelled`)

### Security

- `encryptedCredentials` — never in SELECT projections
- `credentialKeyVersion` — supports key rotation
- `webhookEndpointId` — routes incoming webhooks to correct org
- Idempotency enforced via `UNIQUE(bookingId, idempotencyKey)` and `UNIQUE(provider, providerIntentId)`

---

## 10. Publication & Storefront

### Multi-Channel Distribution

A listing can be published to multiple channels simultaneously:

```
Listing "Catamaran Serenity" (org: Marina Deluxe)
├── Platform Marketplace  → platform collects, takes 15%, settles to org
├── Own Website           → org collects directly, 0% platform fee
└── Partner Widget        → platform collects, takes 20%, splits with partner
```

### Channel Types

`own_site` | `platform_marketplace` | `partner_site` | `widget`

### Per-Publication Overrides

Each publication can independently set:
- `merchantType` (owner | platform) — who collects money
- `merchantPaymentConfigId` — which payment config to use
- `platformFeeBps` — override platform commission
- `pricingProfileId` — override pricing
- `visibility` (public | unlisted | private)
- `displayConfig` (jsonb) — featured flag, sort boost, custom description

### Storefront Query Pattern

The storefront is the ONLY intentional cross-org boundary:
```sql
SELECT l.*, lp.* FROM listing l
JOIN listing_publication lp ON lp.listing_id = l.id
WHERE lp.channel_type = 'platform_marketplace'
  AND lp.is_active = true AND lp.visibility = 'public'
  AND l.status = 'active'
```

---

## 11. Availability & Calendar Sync

### Availability Model

Three layers stack to determine if a time slot is bookable:

1. **Recurring rules** (`listingAvailabilityRule`): Day-of-week + start/end minutes. e.g., "Mon-Fri 9:00-21:00"
2. **Exceptions** (`listingAvailabilityException`): Date-level overrides. "Dec 25 — unavailable" or "Dec 31 — 10:00-15:00 only"
3. **Blocks** (`listingAvailabilityBlock`): Time-range blocks from manual entry, calendar sync, or maintenance

### Minimum Duration Rules

`listingMinimumDurationRule` — time-window-based overrides. e.g., "Evenings 17:00-21:00 require minimum 2 hours"

### Calendar Sync

- `listingCalendarConnection` — external provider link (Google, Outlook, iCal)
  - Tracks sync token, watch channel, push notification verification
  - Sync status: `idle` | `syncing` | `error` | `disabled`
- `calendarWebhookEvent` — raw inbound webhook processing log
- `bookingCalendarLink` — maps booking ↔ external calendar event for bi-directional sync

### Calendar Sync Isolation (Decision D4)

Sync tokens stored as plain text (not secrets). They're session tokens that expire and rotate. Calendar event content is NOT stored in our DB.

---

## 12. Cancellation & Shift Requests

### Dual-Approval Pattern

Both `bookingShiftRequest` (reschedule) and `bookingCancellationRequest` (cancel) use the same dual-approval workflow:

```
Request created (initiatedByRole: customer | manager)
    ├── customerDecision: pending → approved | rejected
    └── managerDecision:  pending → approved | rejected
    
Both approved → status: approved → applied (booking updated)
Either rejected → status: rejected
```

### Cancellation Request

- Separate from inline `booking.cancelledByUserId` (which is for simple cancellations)
- Tracks financial impact: `bookingTotalPriceCents`, `penaltyAmountCents`, `refundAmountCents`
- Refund tracking: `refundStatus`, `refundReference`
- One active request per booking (unique constraint)

### Shift Request (Reschedule)

- Snapshots current vs proposed: dates, passengers, all price breakdowns
- Tracks price delta and payment adjustment
- Payment adjustment status: `none` | `pending` | `captured` | `refunded` | `failed`

### Cancellation Policy

- `cancellationPolicy` — per-org or per-listing rules
  - `scope`: `organization` | `listing`
  - `freeWindowHours` — free cancellation window before booking start
  - `penaltyBps` — standard penalty
  - `latePenaltyBps` + `latePenaltyWindowHours` — higher penalty for very late cancellation
  - `noShowFullCharge` — charge full amount on no-show

---

## 13. Affiliate & Attribution

### Model

Affiliates are **not a separate organization type**. They're individual users with referral codes. An affiliate can be:
- An org member with tracking permissions (partner/agent)
- An external user with a referral link
- Platform-level (no org FK) or org-specific

### Tables

1. **`affiliateReferral`** — referral code + attribution window (default 30 days)
   - Status: `active` | `paused` | `archived`
   - `affiliateOrganizationId` nullable — platform-wide if null
2. **`bookingAffiliateAttribution`** — booking ↔ affiliate link
   - Source: `cookie` | `query` | `manual`
   - `referralCode` denormalized for fast lookup
3. **`bookingAffiliatePayout`** — commission tracking
   - Status: `pending` → `eligible` (after booking completes) → `paid` (or `voided`)
   - `eligibleAt` — set when booking.status = completed
   - Voiding: disputes or cancellations void the payout

### Payout Lifecycle

```
booking:confirmed → attribution created (pending)
booking:completed → payout becomes eligible
booking:disputed  → payout voided
payout batch run  → eligible → paid (with externalPayoutRef)
```

---

## 14. Support & Inbound Messaging

### Ticket Model

- `supportTicket` — org-scoped, linked to booking (optional), assigned to staff member
  - Status: `open` → `pending_customer` → `pending_operator` → `escalated` → `resolved` → `closed`
  - Priority: `low` | `normal` | `high` | `urgent`
  - Source: `manual` | `web` | `telegram` | `avito` | `email` | `sputnik`

### Message Threading

- `supportTicketMessage` — conversation entries with channel tracking
  - `channel`: which channel the message came through
  - `isInternal`: staff-only notes not visible to customer
  - `attachments`: jsonb array
  - Links to `inboundMessage` for external-origin messages

### Inbound Message Ingestion

- `inboundMessage` — raw external messages (Telegram, email, Avito, etc.)
  - `dedupeKey` for idempotent processing
  - `externalThreadId` for conversation correlation
  - `normalizedText` for uniform processing
  - Status: `received` → `processed` (or `failed`)

### Legacy Simplification

Legacy had separate `telegramNotification` and `telegramWebhookEvent` tables — both replaced by the notification pipeline (`notificationEvent` → `notificationIntent` → `notificationDelivery`) and `inboundMessage`.

---

## 15. Reviews & Trust

### Model

- One review per completed booking (`UNIQUE(bookingId)`, `bookingId NOT NULL`)
- Only customers who completed a booking can review (domain check: `booking.status = 'completed'`)
- Rating: 1-5 integer (CHECK constraint)
- Status: `pending` → `published` | `hidden` | `flagged`
- One response per review by org owner/admin

### Future

- Average rating computed at query time (or cached via trigger/cron)
- Auto-publish after configurable delay in MVP

---

## 16. AI Assistant Architecture

### Current State

A separate Hono service (`apps/assistant`, port 3001) with contract-first oRPC + Vercel AI SDK v6 + OpenRouter.

**Database:** `assistantChat` (user-scoped, no org FK yet) + `assistantMessage` (parts-based, jsonb[])

**5 Built-in Tools:**
1. `whoami` — identity/workspace context
2. `listTodos` — get all todos
3. `createTodo` — create todo (mutation, needs approval)
4. `scheduleRecurringReminder` — enqueue recurring notification
5. `createMockChargeNotification` — emit mock payment event

**Tool execution:** Assistant service creates an `AppContractClient` (RPC link to main server) per request. Tools call the main API through this client, forwarding auth cookies for permission checks.

### Architecture Strengths (Already In Place)

- **Pluggable tool system** — adding a new tool = one file + register in `tools.ts`
- **oRPC mutation tools** have `needsApproval: true` — UI prompts user before executing
- **Contract-first client** — tools call typed server endpoints, not raw HTTP
- **Parts-based messages** — supports text + tool invocations + tool results in a single message

### Gaps (To Address)

- No `organizationId` on `assistantChat` — can't scope assistant to org context
- No `channelId` — can't track which channel (web, widget, Telegram) the chat came from
- System prompt is static — doesn't incorporate org settings, listing types, or user role
- No role-based tool gating — customer and org_owner see the same tools
- No marketplace tools — can't search listings, check availability, or draft bookings

### Evolution Plan (4 Phases)

**Phase 1 — Org-Scoped Assistant (Schema + Context)**
- Add `organizationId` + `channelId` to `assistantChat`
- Pass org into `AssistantContext` for tool scoping
- Dynamic system prompt from org settings (name, timezone, listing types, business hours)
- Role-based tool filtering in `createAssistantTools()`

**Phase 2 — Marketplace Tools (Customer-Facing)**
- `searchListings` — text/semantic search across published listings
- `checkAvailability` — real-time slot availability
- `getListingDetails` — full listing info with pricing
- `createBookingDraft` — initiate booking flow

**Phase 3 — Operator Tools (Staff-Facing)**
- `generateListingDescription` — vision-based content generation
- `listBookings` — filtered booking queries
- `manageAvailability` — block/unblock time slots

**Phase 4 — Channel Attribution + Support Escalation**
- Track inbound channel on chat (`channelId`)
- `escalateToSupport` tool → creates `supportTicket` linked to `assistantChat`
- `inboundMessage` → assistant processing bridge

---

## 17. Search Infrastructure

### Three Search Modalities

All PostgreSQL-native — no external search engine at MVP scale.

1. **BM25 Keyword Search** (pg_textsearch extension)
   - Superior ranking over native `ts_rank` (IDF weighting, term frequency saturation, length normalization)
   - `<@>` operator with Block-Max WAND for fast top-k
   - BM25 index: `CREATE INDEX ... USING bm25(name) WITH (text_config='russian')`

2. **Native Full-Text Search** (tsvector + GIN, built-in)
   - Fallback/simple search
   - Weighted multi-column: `setweight(to_tsvector('russian', name), 'A') || setweight(to_tsvector(...description), 'B')`
   - Language support: Russian + English

3. **Vector Similarity Search** (pgvector)
   - Semantic queries ("romantic sunset cruise")
   - HNSW indexes for approximate nearest neighbor
   - Image similarity search (future)

### Hybrid Search

Combine BM25 + vector via Reciprocal Rank Fusion (RRF) for best-of-both-worlds retrieval.

---

## 18. Notification Pipeline

### Existing (Fully Built)

```
EventBus.emit(event)
  → NotificationEvent (idempotent, with dedupeKey)
    → NotificationIntent (per channel: email, in_app, push, telegram)
      → NotificationDelivery (per attempt, with provider tracking)
```

### Preference Resolution (4-level)

```
1. org + specific event type    (most specific)
2. org + wildcard event
3. global + specific event type
4. global + wildcard            (least specific)
```

### Channels

`email` | `in_app` | `push` | `telegram` | `sms`

### In-App Notifications

`notificationInApp` — persisted with `deliveredAt`, `viewedAt`, severity, CTA URL.

---

## 19. Event-Driven Architecture

### Multi-Pusher Pattern (Decision D7)

```
ctx.eventBus.emit({ type: "booking:confirmed", data: { bookingId, ownerId } })
    └── registered pushers (in-process, synchronous)
        ├── notificationsPusher  → notification pipeline
        ├── trackingPusher       → CAPI conversion events
        └── calendarSyncPusher   → Google Calendar sync
```

Pushers self-register in their own package's `index.ts` via `registerEventPusher`. The event bus is in-process and synchronous — it is NOT a queue. See [ADR-002 §Event-Driven Architecture](./002_architecture-patterns.md).

### Event → Pusher Routing

| Domain Event | Notifications | Tracking | Calendar |
|---|---|---|---|
| `booking:created` | ✅ org members | - | - |
| `booking:payment_confirmed` | ✅ customer + org | ✅ "Purchase" | - |
| `booking:confirmed` | ✅ customer | - | ✅ create |
| `booking:cancelled` | ✅ customer + org | ✅ "Refund" | ✅ delete |
| `booking:shift_approved` | ✅ customer | - | ✅ update |
| `booking:completed` | ✅ (review prompt) | - | - |
| `support:ticket_created` | ✅ assigned agent | - | - |

### Queue Contracts

All queue messages validated with Zod `safeParse` before processing:
- `NOTIFICATION_QUEUE` — notification event processing
- `TRACKING_QUEUE` — `tracking.conversion.v1` events
- `CALENDAR_SYNC_QUEUE` — `calendar.booking.{created|updated|cancelled}.v1`
- `RECURRING_TASK_QUEUE` — recurring reminders/tasks

---

## 20. Conventions & Patterns

### Schema Conventions

| Convention | Pattern |
|-----------|---------|
| Primary keys | `text("id").primaryKey()` — text UUIDs |
| Timestamps | `...timestamps` spread (createdAt, updatedAt with timezone) |
| Foreign keys | Inline `.references(() => table.column, { onDelete: "cascade"\|"set null" })` |
| Enums | `pgEnum` with `Values as const` export for Zod reuse |
| Money | Integer cents (`*Cents` suffix) |
| Percentages | Integer basis points (`*Bps` suffix, 250 = 2.50%) |
| Flexible data | `jsonb` for extensible fields |
| Index naming | `tableName_columnName_idx` |
| Unique naming | `tableName_col1_col2_unique` |
| Relations | Centralized in `relations.ts` via `defineRelations` |

### Development Commands (packages/db)

```bash
bun run test            # vitest (PGlite in-memory)
bun run check-types     # tsc --noEmit
bun biome check --config-path ../../biome.json .  # lint + format
```

### PostgreSQL Extensions Required

- `btree_gist` — booking time-slot exclusion constraints
- `pgcrypto` — UUID generation
- `pgvector` — vector similarity search
- `pg_textsearch` — BM25 ranked search (requires `shared_preload_libraries`)
- `cube` + `earthdistance` — geospatial distance queries (optional)

---

## 21. Deferred Features & TODOs

### Technical Debt

- [ ] **listing.metadata validation** — Currently jsonb with no enforcement. Add JSON Schema validation via ajv in domain layer (validate-on-publish, warn-on-save per D2)
- [ ] **Booking lifecycle audit log** — No event trail for state transitions. Consider `bookingAuditLog` table: actor, timestamp, old/new status, notes
- [ ] **docs/drizzle-schema-plan.md** — ~20 stale `*Percentage` references need updating to `*Bps`

### Assistant Evolution

- [ ] **Phase 1** — Add `organizationId` + `channelId` to `assistantChat`, dynamic system prompt, role-based tool gating
- [ ] **Phase 2** — Marketplace tools (searchListings, checkAvailability, getListingDetails, createBookingDraft)
- [ ] **Phase 3** — Operator tools (generateListingDescription, listBookings, manageAvailability)
- [ ] **Phase 4** — Channel attribution + support escalation (escalateToSupport tool)

### Deferred Features

- [ ] **Wishlist** — `userWishlistItem` (userId, listingId, notes, notifyOnChange), possibly `userWishlistItemAlert` for price/availability notifications
- [ ] **Tracking/Analytics** — `trackingPixelConfig`, `trackingConversionEvent` tables for CAPI/ad pixel integration
- [ ] **Assistant API Keys** — `assistantApiKey`, `assistantScopeConfig` for external widget/bot integrations
- [ ] **Listing Moderation** — Formal review workflow when `listing.approvedAt` enforcement is needed
- [ ] **Storefront Config** — `storefront` table (domain, brand, theme) for multi-domain routing
