# Drizzle Schema Plan — Real Platform Analysis

> **Purpose:** Analyse how every table, boundary, and event flow would work on a real multi-org marketplace platform before writing a single line of schema code. This document is meant to be reviewed, challenged, and improved.

---

## Table of Contents

1. [Existing Foundation — What We Already Have](#1-existing-foundation)
2. [Actor Model — Who Does What](#2-actor-model)
3. [Ownership & Isolation Boundaries](#3-ownership--isolation-boundaries)
4. [Schema Map — All Tables by Domain](#4-schema-map)
5. [Table-by-Table Analysis](#5-table-by-table-analysis)
6. [Cross-Cutting Concerns](#6-cross-cutting-concerns)
7. [Event-Driven Flows — Real Scenarios](#7-event-driven-flows)
8. [Access Control Matrix](#8-access-control-matrix)
9. [Resolved Design Decisions (D1–D10)](#9-resolved-design-decisions)
10. [New Tables — Gaps Resolved](#10-new-tables--gaps-resolved)
11. [Search Infrastructure](#11-search-infrastructure)
12. [PostgreSQL Extensions Required](#12-postgresql-extensions-required)
13. [SQLite → PostgreSQL Type Migration Reference](#13-sqlite--postgresql-type-migration-reference)
14. [Asset Storage Strategy](#14-asset-storage-strategy)

---

## 1. Existing Foundation

What is already built and working in production:

| Domain | Tables | Owner | Notes |
|--------|--------|-------|-------|
| **Auth** | `user`, `session`, `account`, `passkey`, `verification` | Better Auth | Managed by plugin — schema regenerated from `@better-auth/cli generate` with customizations (telegram fields, `withTimezone: true` on all timestamps, `...timestamps` spread). `passkey.counter` is `integer` (WebAuthn spec). text PKs, `session.activeOrganizationId` bridges to org context. |
| **Organization** | `organization`, `member`, `invitation` | Better Auth org plugin | `member.role` is the RBAC pivot. Roles: `org_owner`, `org_admin`, `manager`, `agent`, `member`, `customer`. |
| **Notification** | `notification_event`, `notification_intent`, `notification_delivery`, `notification_preference`, `notification_in_app` | Custom | Full event→intent→delivery pipeline. Scoped by `organizationId`. Preferences have 4-level resolution (org+event → org+wildcard → global+event → global+wildcard). |
| **Consent** | `user_consent` | Custom | User-scoped (no org). Tracks consent versions. |
| **Assistant** | `assistant_chat`, `assistant_message` | Custom | Currently user-scoped only (no org FK yet). |
| **Todo** | `todo` | Demo | No org/user FK. Serial PK. Prototype only — will be replaced. |

**Existing patterns we must follow:**
- `pgTable` from `drizzle-orm/pg-core` — PostgreSQL-native table definitions
- `text("id").primaryKey()` — all non-demo tables use text UUIDs
- `...timestamps` spread (`createdAt`, `updatedAt` with timezone)
- Foreign keys use inline `.references(() => table.column, { onDelete: "cascade"|"set null" })`
- Enums use `pgEnum` from `drizzle-orm/pg-core` — native PostgreSQL `CREATE TYPE ... AS ENUM`. Value arrays kept as `as const` exports for Zod schema reuse (e.g. `z.enum(notificationChannelValues)`)
- `jsonb` for flexible/extensible fields (PostgreSQL-native), `text` for serialized JSON (notifications use `text` for payload)
- Index naming: `tableName_columnName_idx`
- Unique constraint naming: `tableName_col1_col2_unique`
- Relations defined centrally in `packages/db/src/relations.ts` using `defineRelations`

**Existing middleware chain (determines data access):**
```
publicProcedure                              → anyone (health, ping, storefront)
  └→ sessionProcedure (requireSession)       → logged in (anonymous OK)
      └→ protectedProcedure (requireAuth)    → logged in (non-anonymous)
          └→ organizationProcedure           → has active org membership
              └→ organizationPermissionProc  → has specific permission in role
```

**Key context available in handlers:**
- `context.session.user.id` — the acting user
- `context.activeMembership.organizationId` — the scoped org
- `context.activeMembership.role` — RBAC role string
- `context.eventBus` — emit domain events → notification pipeline
- `context.notificationQueue` — pg-boss producer

---

## 2. Actor Model — Who Does What

### 2.1 Actor Types

| Actor | Auth | Org Membership | Typical Role | Description |
|-------|------|----------------|--------------|-------------|
| **Platform Admin** | `user.role = "admin"` | Any or none | N/A (platform-level) | Manages listing types, global fees, suspends orgs, reviews payment configs. Checked via `requirePlatformAdmin` middleware (reads `user.role` from DB). |
| **Org Owner** | Registered user | `member.role = "org_owner"` | `org_owner` | Created the org. Full control: listings, bookings, payment config, team, billing. |
| **Org Admin** | Registered user | `member.role = "org_admin"` | `org_admin` | Delegated admin. Same as owner minus org deletion and AC management. |
| **Manager** | Registered user | `member.role = "manager"` | `manager` | Day-to-day operations: manage bookings, moderate listings, handle support tickets. |
| **Agent** | Registered user | `member.role = "agent"` | `agent` | Frontline support: create/respond to tickets, create tasks, read payments. |
| **Member** | Registered user | `member.role = "member"` | `member` | Read-only view of org resources. Can create tasks for self. |
| **Customer** | Registered user | `member.role = "customer"` | `customer` | End consumer. Can view their own bookings and support tickets. Minimal org visibility. |
| **Anonymous Visitor** | `is_anonymous = true` or no session | None | N/A | Browses storefront, views listings. No bookings, no dashboard. |
| **Ad Agency** | Registered user | `member.role = "agent"` + tracking permissions | `agent` (or new `agency` role) | Read-only access to tracking/conversion data for their org. |
| **External Service** | API key (no session) | Linked to org via `assistant_api_key` | N/A | Widget, Telegram bot, partner integration calling the assistant API. |

### 2.2 Critical Boundary: User vs Organization

**A user can be a member of MULTIPLE organizations with DIFFERENT roles.**

```
User "Alice" (user.id = "u1")
├── member of Org "Marina Deluxe" (role: org_owner)    ← she owns this
├── member of Org "Boat Rentals Inc" (role: agent)     ← she works support here
└── member of Org "City Tours" (role: customer)        ← she booked a tour here
```

**The `session.activeOrganizationId` determines which org context is active.** All org-scoped queries MUST filter by this value. The middleware chain guarantees:
1. `organizationProcedure` checks `context.activeMembership` exists (user is member of active org)
2. `organizationPermissionProcedure` checks the role has the required permission
3. Every handler receives `context.activeMembership.organizationId` — this is the **tenant boundary**

**Consequence for schema design: Every org-scoped table MUST have `organizationId` FK.**

### 2.3 The Customer Boundary Problem

**Question: When a customer books a listing, what org are they in?**

In a marketplace, the customer is browsing the **platform** but booking from an **org** (the listing owner). Three approaches:

**Option A: Customer becomes org member (current Better Auth model)**
- When a customer books from Org "Marina Deluxe", they're added as `member(role: "customer")` of that org.
- PRO: Natural data scoping — booking is in org context, notification preferences per org work.
- CON: A customer who books from 3 different orgs appears in 3 `member` rows. Org owner sees them in their member list.
- CON: Switching between "I'm browsing all my bookings" and "I'm managing my marina" requires switching `activeOrganizationId`.

**Option B: Bookings reference org but customer isn't a member**
- Customer stays outside the org. Booking has `organizationId` + `customerUserId`.
- PRO: Clean — customer doesn't pollute org member lists.
- CON: The middleware chain requires org membership for org-scoped data. Customer can't use `organizationProcedure` to view their booking.
- CON: Notification preferences don't apply (they're org-scoped).

**Option C: Hybrid — auto-membership + separate "my bookings" view**
- Customer auto-enrolled as `member(role: "customer")` when they book (like Option A).
- A dedicated "My Bookings" view queries across all orgs where `member.role = "customer"`.
- This aligns with how the system already works (session.activeOrganizationId auto-selects single org).

**→ Recommended: Option C (Hybrid).** It leverages the existing auth model. The `customer` role already exists with minimal permissions. We add a cross-org "my bookings" endpoint using `protectedProcedure` (not org-scoped) that queries bookings for `customerUserId = session.user.id`.

---

## 3. Ownership & Isolation Boundaries

### 3.1 Boundary Map

```
┌──────────────────────────────────────────────────────────────────────┐
│ PLATFORM SCOPE (platform admin only)                                │
│ ┌──────────────────────────┐  ┌──────────────────────────────────┐  │
│ │ listing_type_config      │  │ platform_fee_config              │  │
│ │ (global type registry)   │  │ (global fee defaults)            │  │
│ └──────────────────────────┘  └──────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────┤
│ USER SCOPE (per user, cross-org)                                    │
│ ┌──────────────────┐  ┌──────────────────┐  ┌───────────────────┐  │
│ │ user              │  │ user_consent     │  │ session           │  │
│ └──────────────────┘  └──────────────────┘  └───────────────────┘  │
│ ┌──────────────────┐  ┌──────────────────────────────────────────┐  │
│ │ account, passkey  │  │ "my bookings" (cross-org customer view) │  │
│ └──────────────────┘  └──────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────┤
│ ORGANIZATION SCOPE (org members only, filtered by organizationId)   │
│ ┌────────────────────────────────────────────────────────────────┐  │
│ │ organization_settings    │ organization_listing_type           │  │
│ ├────────────────────────────────────────────────────────────────┤  │
│ │ organization_payment_config │ payment_webhook_event            │  │
│ ├────────────────────────────────────────────────────────────────┤  │
│ │ listing + sub-tables      │ listing_publication                │  │
│ ├────────────────────────────────────────────────────────────────┤  │
│ │ booking + sub-tables      │ booking_payment_attempt            │  │
│ ├────────────────────────────────────────────────────────────────┤  │
│ │ listing_review + response  │ booking_affiliate_attribution     │  │
│ ├────────────────────────────────────────────────────────────────┤  │
│ │ support_ticket + messages  │ affiliate_referral                │  │
│ ├────────────────────────────────────────────────────────────────┤  │
│ │ tracking_pixel_config      │ tracking_conversion_event         │  │
│ ├────────────────────────────────────────────────────────────────┤  │
│ │ notification_event/intent/delivery (already org-scoped)        │  │
│ ├────────────────────────────────────────────────────────────────┤  │
│ │ assistant_scope_config     │ assistant_api_key                 │  │
│ └────────────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────┤
│ ORGANIZATION + USER SCOPE (intersection)                            │
│ ┌────────────────────────────────────────────────────────────────┐  │
│ │ member (org × user)        │ invitation                       │  │
│ │ notification_preference    │ notification_in_app               │  │
│ │ assistant_chat (org × user for multi-tenant)                   │  │
│ └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.2 Isolation Rules

| Rule | Enforcement | Layer |
|------|-------------|-------|
| Org A cannot see Org B's listings | `WHERE organizationId = ctx.activeMembership.organizationId` | Domain queries |
| Customer can only see their own bookings | `WHERE customerUserId = ctx.session.user.id` | Handler + domain |
| Agent cannot delete bookings | `organizationPermissionProcedure({ booking: ["delete"] })` | Middleware |
| Payment credentials never exposed | `encryptedCredentials` excluded from all SELECT projections | Domain queries |
| Webhooks routed to correct org | `webhookEndpointId` lookup → org context | Webhook route handler |
| Cross-org "my bookings" uses user scope | `protectedProcedure` (not `organizationProcedure`) | Middleware chain choice |
| Platform admin bypasses org scope | `requirePlatformAdmin` middleware checks `user.role = "admin"` | Separate middleware |
| Storefront is public | `publicProcedure` — no auth required | Middleware chain choice |

### 3.3 Data Residency per Table

Every new table falls into exactly ONE ownership category:

| Category | organizationId | userId | Access Pattern |
|----------|---------------|--------|----------------|
| **Platform** | NULL | NULL | Platform admin only. Global config. |
| **Org-owned** | NOT NULL | NULL (or createdByUserId audit) | Org members via `organizationProcedure` |
| **Org+User** | NOT NULL | NOT NULL | User within org context. Both FKs required. |
| **User-owned** | NULL | NOT NULL | User regardless of org. `protectedProcedure`. |

---

## 4. Schema Map — All Tables by Domain

### 4.1 Complete Table Inventory

```
EXISTING (keep as-is):
  auth:          user, session, account, passkey, verification
  org:           organization, member, invitation
  notification:  notification_event, notification_intent, notification_delivery,
                 notification_preference, notification_in_app
  consent:       user_consent
  assistant:     assistant_chat (modify), assistant_message
  demo:          todo (remove or keep as example)

NEW — Phase 0 (Extensions):
  extensions:    btree_gist, cube, earthdistance, pgcrypto

NEW — Phase 1 (Core):
  org-config:    organization_settings
  listing-type:  listing_type_config, organization_listing_type
  listing:       listing, listing_location, listing_amenity, listing_asset,
                 listing_calendar_connection, calendar_webhook_event,
                 listing_availability_rule, listing_availability_block,
                 listing_minimum_duration_rule
  pricing:       listing_pricing_profile, listing_pricing_rule, platform_fee_config
  publication:   listing_publication
  booking:       booking, booking_calendar_link, booking_discount_code,
                 booking_discount_application, booking_payment_attempt,
                 booking_cancellation_request, booking_shift_request,
                 booking_dispute, booking_refund

NEW — Phase 2 (Payment):
  payment:       organization_payment_config, payment_webhook_event

NEW — Phase 3 (Tracking):
  tracking:      tracking_pixel_config, tracking_conversion_event,
                 tracking_click_attribution

NEW — Phase 4 (Assistant extension):
  assistant:     assistant_scope_config, assistant_api_key

NEW — Phase 5 (Support):
  support:       support_ticket, support_ticket_message, inbound_message

NEW — Phase 6 (Affiliate):
  affiliate:     affiliate_referral, booking_affiliate_attribution,
                 booking_affiliate_payout

NEW — Phase 7 (Reviews):
  reviews:       listing_review, listing_review_response

TOTAL: ~50 tables (22 existing + ~28 new)
```

---

## 5. Table-by-Table Analysis

### 5.1 Listing Type Registry

#### `listing_type_config` — Platform scope

**Purpose:** Define what kinds of things can be listed (boats, cars, apartments, equipment). Platform admin manages. Orgs choose which types they support.

**Real-world scenario:**
1. Platform admin creates type "boat" with JSON Schema: `{ passengerCapacity: number, boatType: enum["catamaran","yacht","speedboat"] }`
2. Marina org enables "boat" type via `organization_listing_type`
3. Org creates a listing with `listingTypeSlug: "boat"` and `metadata: { passengerCapacity: 12, boatType: "catamaran" }`
4. Validation: on listing create/update, the domain layer loads `listing_type_config.metadataJsonSchema` and validates `listing.metadata` against it

**Boundary:** Platform-scoped. No `organizationId`. Only platform admins can create/update.

**Concern: JSON Schema validation on every write.** Need to cache `listing_type_config` rows (they change rarely). Validate in domain layer before the DB insert. If schema is invalid, reject with 400.

```
listing_type_config
├── id: text PK (uuid)
├── slug: text UNIQUE NOT NULL         // "boat", "car", "apartment"
├── label: text NOT NULL               // "Boat", "Car", "Apartment"
├── icon: text                         // icon key or URL
├── metadataJsonSchema: jsonb NOT NULL // JSON Schema for listing.metadata
├── defaultAmenityKeys: jsonb          // ["wifi","parking","shower"]
├── requiredFields: jsonb              // ["passengerCapacity","boatType"]
├── supportedPricingModels: jsonb      // ["hourly","daily"]
├── isActive: boolean DEFAULT true
├── sortOrder: integer DEFAULT 0
├── ...timestamps
```

#### `organization_listing_type` — Org scope

**Purpose:** Which listing types this org uses. An org that rents boats and cars would have two rows.

**Boundary:** Org-scoped. Managed by org_owner/admin. Used to filter listing creation options and assistant context.

```
organization_listing_type
├── id: text PK
├── organizationId: text FK → organization (cascade)
├── listingTypeSlug: text FK → listing_type_config.slug
├── isDefault: boolean DEFAULT false    // which type is pre-selected in UI
├── config: jsonb                       // org-specific overrides (e.g. custom amenity labels)
├── ...timestamps
├── UNIQUE(organizationId, listingTypeSlug)
```

### 5.2 Listing Entity

#### `listing` — Org scope

**Purpose:** The core rentable/bookable entity. Replaces the legacy `boat` table.

**Real-world scenario:**
1. Org owner creates listing "Catamaran Serenity" (type: boat).
2. Sets availability rules (Mon-Fri 9-21), pricing profiles (summer/winter rates).
3. Publishes to platform marketplace AND their own website (two `listing_publication` rows).
4. Customer browsing the marketplace sees the listing → books → booking created.

**Boundary:** Org-scoped. All queries MUST filter `organizationId`.

**Open design question — listing.slug uniqueness:**
- Current: `UNIQUE(organizationId, slug)` — slug unique within org.
- But for storefront URLs: `/listings/catamaran-serenity` — needs to be unique per publication channel, not per org.
- **Decision:** Keep `UNIQUE(organizationId, slug)`. Storefront URLs resolve by `(org context + slug)` from the publication channel config (each channel knows its org).

```
listing
├── id: text PK
├── organizationId: text FK → organization (cascade)
├── listingTypeSlug: text NOT NULL     // FK → listing_type_config.slug
├── locationId: text FK → listing_location (set null)
├── name: text NOT NULL
├── slug: text NOT NULL
├── description: text
├── metadata: jsonb                    // type-specific, validated by JSON Schema
├── minimumDurationMinutes: integer DEFAULT 60
├── minimumNoticeMinutes: integer DEFAULT 0
├── allowShiftRequests: boolean DEFAULT true
├── workingHoursStart: integer DEFAULT 9
├── workingHoursEnd: integer DEFAULT 21
├── timezone: text DEFAULT "UTC"
├── status: pgEnum DEFAULT "draft"      // listingStatusEnum: draft|active|maintenance|inactive
├── isActive: boolean DEFAULT true
├── approvedAt: timestamp              // platform admin approval (if required)
├── archivedAt: timestamp
├── ...timestamps
├── UNIQUE(organizationId, slug)
├── INDEX(organizationId), INDEX(status), INDEX(listingTypeSlug)
```

**Sub-tables (all org-scoped via `listingId → listing.organizationId`):**

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `listing_location` | Where things are (docks, garages, addresses) | `organizationId`, name, lat/lng, address |
| `listing_amenity` | Feature flags per listing | `listingId`, key, label, isEnabled, value |
| `listing_asset` | Photos, documents | `listingId`, storageKey, mimeType, isPrimary, reviewStatus |
| `listing_calendar_connection` | External calendar sync (Google, iCal) | `listingId`, provider, externalCalendarId, syncToken |
| `calendar_webhook_event` | Raw webhook logs from calendar providers | calendarConnectionId, payload |
| `listing_availability_rule` | Recurring availability (day-of-week + time) | `listingId`, dayOfWeek, startMinute, endMinute |
| `listing_availability_block` | One-off blocks (maintenance, external booking) | `listingId`, startsAt, endsAt, source, reason |
| `listing_minimum_duration_rule` | Time-based minimum duration overrides | `listingId`, startHour/endHour, daysOfWeek, minimumDurationMinutes |

### 5.3 Pricing

#### `listing_pricing_profile` — Org scope (via `listingId → listing`)

**Purpose:** Named pricing configurations per listing. A listing can have "Summer 2026", "Winter 2026", "Weekend Special" profiles.

**How it works:**
1. Create profile "Summer 2026" for listing, set `baseHourlyPriceCents: 5000` (50 EUR/hr), `isDefault: true`.
2. Create another "Winter Off-Peak" with `baseHourlyPriceCents: 3000`, `validFrom: 2026-11-01`, `validTo: 2027-03-31`.
3. At booking time, the pricing engine selects the profile by: `isDefault` if no date match, otherwise `validFrom/validTo` for seasonal pricing.
4. **Publication-level pricing**: `listing_publication.pricingProfileId` can override — e.g., marketplace uses default pricing, own website uses a different profile with no platform commission baked in.

**Fee fields on the profile are the org-owner's choices:**
- `serviceFeePercentage` — what the org charges the customer on top of base price
- `affiliateFeePercentage` — affiliate commission
- `taxPercentage` — tax rate
- `depositPercentage` — how much is collected upfront

These are **NOT** platform fees. Platform fees come from `platform_fee_config` or `organization_payment_config.platformServiceFeePercentage` or `listing_publication.platformFeePercentage`.

```
listing_pricing_profile
├── id, listingId FK, name, currency
├── baseHourlyPriceCents, minimumHours
├── depositPercentage, serviceFeePercentage
├── affiliateFeePercentage, taxPercentage, acquiringFeePercentage
├── validFrom, validTo, isDefault
├── createdByUserId FK, archivedAt, ...timestamps
```

#### `listing_pricing_rule` — Org scope

**Purpose:** Dynamic pricing adjustments. "Weekend surcharge +20%", "Early bird -10%", "Peak hour 17:00-20:00 +30%".

```
listing_pricing_rule
├── id, listingId FK, pricingProfileId FK
├── name, ruleType, conditionJson, adjustmentType, adjustmentValue
├── priority, isActive, ...timestamps
```

#### `platform_fee_config` — Platform scope

**Purpose:** Global default platform fees. Used when no org-level or publication-level override exists.

```
platform_fee_config
├── id, currency
├── affiliateFeePercentage, taxPercentage, acquiringFeePercentage
├── isActive, createdByUserId FK, ...timestamps
```

**Fee precedence — `resolveEffectiveFees()` algorithm:**

Four layers can set platform fee percentages. Resolution order (most specific wins):

```
1. listing_publication.platformFeePercentage          ← per-publication override (most specific)
2. organization_payment_config.platformServiceFeePercentage  ← per-org override
3. platform_fee_config (WHERE isActive AND currency = ?)     ← global default (least specific)
```

At booking creation time:
```typescript
function resolveEffectivePlatformFee(publication, orgPaymentConfig, globalFeeConfig): number {
  // 1. Publication-level override (per-channel fee)
  if (publication.platformFeePercentage != null) return publication.platformFeePercentage;
  // 2. Org-level override (negotiated rate)
  if (orgPaymentConfig?.platformServiceFeePercentage != null) return orgPaymentConfig.platformServiceFeePercentage;
  // 3. Global default
  return globalFeeConfig.platformFeePercentage ?? 0;
}
```

The resolved fee is snapshot into `booking.platformCommissionCents` at creation time so historical bookings are unaffected by later config changes. Org-level fees (`listing_pricing_profile.serviceFeePercentage`, `taxPercentage`, etc.) are separate — they represent the org's own charges to the customer, not the platform's cut.

### 5.4 Publication

#### `listing_publication` — Org scope

**Purpose:** A listing can be published to multiple distribution channels. Each channel can have different pricing, commission, and payment routing.

**Real-world scenario:**
```
Listing "Catamaran Serenity" (org: Marina Deluxe)
├── Publication 1: Platform Marketplace
│   channelType: platform_marketplace, merchantType: platform
│   platformFeePercentage: 15
│   → Platform collects money, takes 15%, settles to Marina Deluxe
│
├── Publication 2: Marina Deluxe's Own Website
│   channelType: own_site, merchantType: owner
│   merchantPaymentConfigId: marina_deluxe_cloudpayments_config
│   platformFeePercentage: 0
│   → Marina Deluxe collects money directly. No platform cut.
│
├── Publication 3: Partner "Travel Blog" Embeddable Widget
│   channelType: widget, channelId: "travel-blog-widget-123"
│   merchantType: platform, platformFeePercentage: 20
│   → Platform collects, gives 20% to Travel Blog, rest to Marina Deluxe
```

**Boundary:** Org-scoped. The org owner manages their publications. Platform admin can deactivate.

**Key constraint:** `UNIQUE(listingId, channelType, channelId)` — one publication per (listing, channel, channel-specific-id).

```
listing_publication
├── id: text PK
├── listingId: text FK → listing (cascade)
├── organizationId: text FK → organization
├── channelType: pgEnum NOT NULL         // publicationChannelTypeEnum: own_site|platform_marketplace|partner_site|widget
├── channelId: text                     // partner slug, widget ID, etc. nullable.
├── isActive: boolean DEFAULT true
├── visibility: pgEnum DEFAULT "public"  // publicationVisibilityEnum: public|unlisted|private
├── merchantType: pgEnum NOT NULL DEFAULT "platform"  // merchantTypeEnum: owner|platform
├── merchantPaymentConfigId: text FK → organization_payment_config  // nullable
├── platformFeePercentage: integer       // platform's cut (e.g. 15 = 15%). NULL = inherit from org or global default
├── pricingProfileId: text FK → listing_pricing_profile  // nullable
├── displayConfig: jsonb                // { featured, sortBoost, customDescription }
├── ...timestamps
├── UNIQUE(listingId, channelType, channelId)
```

### 5.5 Booking

#### `booking` — Org scope + customer user scope

**Purpose:** The core transaction. A customer books a listing for a time slot.

**Who creates it:**
- Customer via storefront (public booking intake)
- Org member via dashboard (manual booking)
- External system via API (calendar sync import)

**Who can see it:**
- Org members (via `organizationProcedure`) — see all bookings for their org
- The customer (via cross-org "my bookings" endpoint using `protectedProcedure`)
- Platform admin (via admin routes)

**Booking lifecycle (state machine):**
```
                                  ┌─────────────┐
                        ┌────────→│  cancelled   │
                        │         └─────────────┘
┌─────────┐   ┌────────────────┐   ┌───────────┐   ┌───────────────┐   ┌───────────┐
│ pending  ├──→│awaiting_payment├──→│ confirmed │──→│ in_progress   │──→│ completed │
└────┬────┘   └───────┬────────┘   └─────┬─────┘   └───────┬───────┘   └─────┬─────┘
     │                │                   │                 │                 │
     └──→ rejected    └──→ cancelled      └──→ no_show      └──→ cancelled    └──→ disputed → refunded
```

**States:**
- `pending` — just created, awaiting manual confirmation or auto-confirm
- `awaiting_payment` — confirmed intent, payment widget shown to customer
- `confirmed` — payment received OR manually confirmed by org
- `in_progress` — booking time has started
- `completed` — service delivered, booking time ended
- `cancelled` — cancelled (can happen from awaiting_payment, confirmed, or in_progress)
- `rejected` — explicitly rejected by org (never confirmed)
- `no_show` — customer didn't show up (set from confirmed or in_progress)
- `disputed` — payment dispute / chargeback received

**Real-world flow (event-driven):**
1. Customer submits booking request → `booking` created with `status: "pending"`, `paymentStatus: "awaiting"`
2. Domain emits event: `booking.created` → notification to org members
3. Payment widget collects card → `booking_payment_attempt` with `status: "pending"`
4. Payment webhook arrives → `booking_payment_attempt.status` → `"captured"`
5. Domain service checks all attempts → updates `booking.paymentStatus` → `"paid"`
6. Domain emits event: `booking.payment_confirmed` → notification to customer + org
7. Booking auto-confirmed (or manual confirm by org) → `booking.status` → `"confirmed"`
8. Domain emits event: `booking.confirmed` → calendar sync, tracking conversion, notification
9. If customer requests cancellation → `booking_cancellation_request` created
10. Org reviews → approves → `booking.status` → `"cancelled"`, refund initiated

**Payment routing at booking time:**
```
function createBooking(listingId, publicationId, ...):
  publication = getListingPublication(publicationId)
  paymentConfig = resolvePaymentConfig(publication)
  // paymentConfig tells us: which org collects money, which credentials to use

  booking = insert({
    ...bookingData,
    publicationId: publication.id,
    merchantOrganizationId: paymentConfig.merchantOrgId,
    merchantPaymentConfigId: paymentConfig.configId,
    platformCommissionCents: calculatePlatformCommission(price, publication),
  })
```

```
booking
├── id: text PK
├── organizationId: text FK → organization (cascade)               // listing owner — the org that owns the listing being booked (tenant boundary for data access)
├── listingId: text FK → listing
├── publicationId: text FK → listing_publication  // which channel originated this
├── merchantOrganizationId: text FK → organization // payment collector — the org whose payment credentials are charged (may differ from organizationId when platform collects)
├── merchantPaymentConfigId: text FK → organization_payment_config  // which credentials
├── customerUserId: text FK → user (set null)
├── createdByUserId: text FK → user (set null)
├── source: pgEnum NOT NULL                         // bookingSourceEnum: manual|web|telegram|partner|api|calendar_sync
├── status: pgEnum DEFAULT "pending"                // bookingStatusEnum: pending|awaiting_payment|confirmed|in_progress|completed|cancelled|rejected|no_show|disputed
├── paymentStatus: pgEnum DEFAULT "unpaid"          // bookingPaymentStatusEnum: unpaid|pending|partially_paid|paid|refunded|failed
├── calendarSyncStatus: pgEnum DEFAULT "pending"    // calendarSyncStatusEnum: pending|linked|sync_error|detached|not_applicable
├── startsAt: timestamp NOT NULL
├── endsAt: timestamp NOT NULL
├── passengers: integer
├── contactName: text, contactPhone: text, contactEmail: text
├── timezone: text
├── basePriceCents: integer NOT NULL
├── discountAmountCents: integer DEFAULT 0
├── totalPriceCents: integer NOT NULL
├── platformCommissionCents: integer DEFAULT 0     // platform's cut
├── currency: text NOT NULL
├── notes: text, specialRequests: text
├── externalRef: text                              // external system ref (calendar import)
├── cancelledAt: timestamp, cancelledByUserId FK, cancellationReason: text
├── refundAmountCents: integer DEFAULT 0
├── metadata: jsonb
├── ...timestamps
├── UNIQUE(organizationId, source, externalRef)    // prevent duplicate imports
├── INDEX(organizationId), INDEX(listingId), INDEX(customerUserId)
├── INDEX(status), INDEX(paymentStatus), INDEX(startsAt)
```

**Booking sub-tables:**

| Table | Purpose | Key Boundary | Key Fields (beyond plan) |
|-------|---------|-------------|--------------------------|
| `booking_calendar_link` | Links booking ↔ external calendar event | Org-scoped via booking | iCalUid, externalEventVersion, syncError |
| `booking_discount_code` | Discount codes (per listing or org-wide) | Org-scoped. `appliesToListingId` nullable. | maxDiscountCents, minimumSubtotalCents, usageLimit, usageCount, perCustomerLimit |
| `booking_discount_application` | Records which discount was applied to booking | Links booking ↔ discount_code | appliedAmountCents, code (denormalized) |
| `booking_payment_attempt` | Each payment try (card charge, refund) | Booking-scoped. | idempotencyKey (UNIQUE), providerIntentId (UNIQUE), requires_action status for 3DS |
| `booking_cancellation_request` | Customer-initiated cancellation request | Booking-scoped (1:1). | requestedByUserId, reviewedByUserId, reviewNote |
| `booking_shift_request` | Reschedule request with dual-approval | Booking-scoped (1:1). | Full dual-approval (customer + manager decisions), price delta snapshot, payment adjustment tracking |
| `booking_dispute` | Payment dispute / chargeback | Booking-scoped. | reasonCode (provider code), resolution, resolvedByUserId |
| `booking_refund` | Refund records | Booking-scoped. | 3-actor chain (requested/approved/processed by), externalRefundId UNIQUE per provider |

> **See Section 10.4 for complete field definitions of all sub-tables.**

### 5.6 Payment Config

#### `organization_payment_config` — Org scope

**Purpose:** Per-org payment provider credentials. Each org can have their own CloudPayments (or Stripe, etc.) account.

**Real-world scenario:**
1. Platform admin creates payment config for "Marina Deluxe" with their CloudPayments credentials.
2. System generates unique `webhookEndpointId` (UUID) for the config.
3. Admin gives Marina Deluxe the webhook URL: `https://api.example.com/api/payments/webhook/{endpointId}/{type}`
4. Marina Deluxe configures this URL in their CloudPayments dashboard.
5. When a payment is made via Marina Deluxe's own website (merchantType=owner), the webhook hits this endpoint.
6. System looks up `organization_payment_config` by `webhookEndpointId`, loads credentials, verifies HMAC, processes payment.

**Security boundaries:**
- `encryptedCredentials` — encrypted at rest, NEVER returned in API responses
- `webhookEndpointId` — UUID-based, non-guessable, rotatable
- `publicKey` — safe to expose (used in frontend payment widget)
- Platform admin manages, org owner can only view `publicKey` + `validationStatus`

```
organization_payment_config
├── id: text PK
├── organizationId: text FK → organization (cascade)
├── provider: pgEnum NOT NULL                // paymentProviderEnum: cloudpayments|stripe|etc
├── isActive: boolean DEFAULT false
├── publicKey: text                         // safe to expose to frontend
├── encryptedCredentials: text NOT NULL     // encrypted JSON blob
├── webhookEndpointId: text UNIQUE          // unique slug for webhook routing
├── validatedAt: timestamp
├── validationStatus: pgEnum                 // validationStatusEnum: pending|validated|failed|suspended
├── platformServiceFeePercentage: integer   // org-level platform fee override. NULL = use global default
├── payoutConfig: jsonb                     // settlement details
├── metadata: jsonb
├── ...timestamps
├── UNIQUE(organizationId, provider)
├── UNIQUE(webhookEndpointId)
```

#### `payment_webhook_event` — Org scope

**Purpose:** Audit trail for every webhook received. Critical for debugging payment issues.

```
payment_webhook_event
├── id: text PK
├── organizationId: text FK → organization
├── endpointId: text                        // denormalized for fast lookup
├── provider: text NOT NULL
├── webhookType: pgEnum NOT NULL             // webhookTypeEnum: check|pay|fail|confirm|refund|cancel
├── status: pgEnum                           // webhookEventStatusEnum: received|authenticated|processed|failed|rejected
├── requestSignature: text                  // for replay detection
├── payload: jsonb                          // sanitized — NO card numbers
├── responseCode: integer
├── errorMessage: text
├── processingDurationMs: integer
├── ...timestamps
├── INDEX(organizationId, createdAt), INDEX(endpointId)
```

### 5.7 Tracking

#### `tracking_pixel_config` — Org scope (optionally scoped to publication)

**Purpose:** Facebook Pixel, Google Ads, Yandex Metrika etc. config per org. Optionally scoped to a specific publication channel.

**Real-world scenario:**
- Marina Deluxe has Facebook Pixel "111222333" for their own website.
- They also have a separate Google Ads tracking for the platform marketplace.
- When a booking is confirmed via marketplace → fire Google Ads conversion.
- When a booking is confirmed via own website → fire Facebook CAPI conversion.

**Scoping logic:**
```
function getActivePixels(organizationId, publicationId):
  // Get pixels scoped to this specific publication
  channelPixels = SELECT ... WHERE organizationId AND publicationId = :pub
  // Get org-wide pixels (publicationId IS NULL) 
  orgPixels = SELECT ... WHERE organizationId AND publicationId IS NULL
  // Merge: channel-specific pixels take priority, then org-wide
  return deduplicate(channelPixels, orgPixels)
```

```
tracking_pixel_config
├── id: text PK
├── organizationId: text FK → organization (cascade)
├── publicationId: text FK → listing_publication  // nullable (null = org-wide)
├── provider: pgEnum NOT NULL            // trackingProviderEnum: facebook|google_ads|yandex_metrika|vk_ads|tiktok|custom
├── pixelId: text NOT NULL              // the pixel/measurement ID
├── accessToken: text                   // encrypted — for server-side CAPI
├── isActive: boolean DEFAULT true
├── config: jsonb                       // provider-specific config
├── createdByUserId: text FK → user
├── ...timestamps
├── UNIQUE(organizationId, provider, pixelId, publicationId)
```

#### `tracking_conversion_event` — Org scope

```
tracking_conversion_event
├── id, organizationId FK, pixelConfigId FK
├── eventName, bookingId FK, listingId FK
├── eventValue (cents), currency
├── externalEventId (dedup), clientMetadata (jsonb), serverResponse (jsonb)
├── status pgEnum (trackingEventStatusEnum: pending|sent|failed|skipped), sentAt, failureReason
├── ...timestamps
```

#### `tracking_click_attribution` — Org scope

```
tracking_click_attribution
├── id, organizationId FK
├── sessionId, source, clickId (fbclid/gclid/etc.)
├── landingUrl, referrer, userAgent, ipHash
├── bookingId FK (set when conversion happens)
├── capturedAt, ...timestamps
```

### 5.8 Assistant Extension

#### `assistant_chat` — modify existing

**Current:** User-scoped only (userId FK).
**New:** Add org + service scoping for multi-tenant assistant.

```diff
 assistant_chat
   id, title, userId FK, visibility
+  organizationId: text FK → organization (nullable)
+  serviceKey: pgEnum DEFAULT "web"  // assistantServiceKeyEnum
+  scopeConfigId: text FK → assistant_scope_config (nullable)
   ...timestamps
+  INDEX(organizationId)
```

**Why nullable organizationId?** Platform-level chats (no specific org context) should still work. The assistant can operate without org scoping for general questions.

#### `assistant_scope_config` — Org scope (nullable org for platform defaults)

```
assistant_scope_config
├── id: text PK
├── organizationId: text FK → organization (nullable)  // null = platform default
├── serviceKey: pgEnum NOT NULL                          // assistantServiceKeyEnum: web|widget|telegram|api
├── systemPromptTemplate: text
├── enabledToolSlugs: jsonb                             // ["search-listings","get-quote"]
├── disabledToolSlugs: jsonb                            // ["delete-booking"]
├── maxStepsPerMessage: integer DEFAULT 10
├── aiModel: text
├── knowledgeContext: jsonb                              // business hours, FAQ, policies
├── responseLanguage: text                              // "ru", "en"
├── isActive: boolean DEFAULT true
├── ...timestamps
├── UNIQUE(organizationId, serviceKey)
```

#### `assistant_api_key` — Org scope

```
assistant_api_key
├── id, organizationId FK, serviceKey
├── keyHash (bcrypt), keyPrefix (display)
├── name, permissions (jsonb), rateLimit (jsonb)
├── lastUsedAt, expiresAt, isActive
├── ...timestamps
├── INDEX(keyHash), INDEX(organizationId)
```

### 5.9 Support

Port from legacy. All org-scoped.

#### `support_ticket` — Org + User scope

```
support_ticket
├── id: text PK
├── organizationId: text FK → organization (cascade)
├── createdByUserId: text FK → user
├── assignedToUserId: text FK → user (nullable)
├── bookingId: text FK → booking (nullable)     // ticket about a specific booking
├── subject: text NOT NULL
├── status: pgEnum DEFAULT "open"                 // ticketStatusEnum: open|in_progress|waiting_customer|resolved|closed
├── priority: pgEnum DEFAULT "normal"             // ticketPriorityEnum: low|normal|high|urgent
├── category: pgEnum                              // ticketCategoryEnum: billing|booking|technical|general
├── closedAt: timestamp, closedByUserId FK
├── metadata: jsonb
├── ...timestamps
├── INDEX(organizationId), INDEX(status), INDEX(assignedToUserId)
```

#### `support_ticket_message` — Ticket-scoped

```
support_ticket_message
├── id, ticketId FK → support_ticket (cascade)
├── authorUserId FK → user
├── body: text NOT NULL
├── isInternal: boolean DEFAULT false           // internal notes not visible to customer
├── ...timestamps
```

**Boundary for `isInternal`:** When a customer views their ticket messages, `WHERE isInternal = false` is added. Org members see all.

#### `inbound_message` — Org scope

Raw inbound messages from external channels (Telegram, email, etc.) before they're matched to a ticket.

```
inbound_message
├── id, organizationId FK
├── channel, externalMessageId, senderIdentifier
├── body, metadata (jsonb)
├── matchedTicketId FK (set after routing)
├── processedAt, ...timestamps
```

### 5.10 Affiliate

Port from legacy. All org-scoped.

#### `affiliate_referral` — Org scope

```
affiliate_referral
├── id, organizationId FK                      // nullable — NULL = platform-wide affiliate
├── affiliateUserId FK → user
├── referralCode: text NOT NULL
├── commissionPercentage: integer
├── isActive: boolean DEFAULT true
├── ...timestamps
├── UNIQUE(organizationId, referralCode)       // for org-scoped affiliates
├── PARTIAL UNIQUE INDEX ON (referralCode) WHERE organizationId IS NULL  // for platform-wide affiliates (SQL NULL ≠ NULL defeats standard UNIQUE)
```

#### `booking_affiliate_attribution` — Booking-scoped

```
booking_affiliate_attribution
├── id, bookingId FK → booking
├── referralId FK → affiliate_referral
├── commissionCents: integer
├── status: pgEnum                             // affiliateAttributionStatusEnum: pending|approved|paid|rejected
├── ...timestamps
```

#### `booking_affiliate_payout` — Referral-scoped

```
booking_affiliate_payout
├── id, attributionId FK
├── amount, currency, method
├── transactionRef, paidAt, status
├── ...timestamps
```

---

## 6. Cross-Cutting Concerns

### 6.1 Soft Delete vs Hard Delete

| Table | Delete Strategy | Reason |
|-------|----------------|--------|
| Listing | Soft (`archivedAt` timestamp) | Bookings reference it, historical data needed |
| Booking | Never delete | Financial records, audit trail |
| Payment webhook event | Never delete | Audit trail |
| Support ticket | Soft (status: closed) | Historical reference |
| Listing assets | Hard delete ok | Storage cleanup needed |
| Discount codes | Soft (`isActive` false) | Applied bookings reference them |
| Tracking events | Never delete | Attribution reporting |
| Affiliate payouts | Never delete | Financial records |
| Listing reviews | Soft (status: hidden) | Moderation transparency |
| Organization settings | Never delete | 1:1 with org, cascade on org delete |

### 6.2 Multi-Tenancy Data Leak Prevention

**The #1 risk: an org-scoped query that forgets the org filter.**

**Prevention strategy:**
1. **Domain layer pattern:** All domain query functions take `organizationId` as a required first parameter.
```typescript
// packages/api/src/domain/listing/queries.ts
export async function findListingById(organizationId: string, listingId: string) {
  return db.select().from(listing)
    .where(and(
      eq(listing.organizationId, organizationId),  // ALWAYS first
      eq(listing.id, listingId),
    ))
    .limit(1);
}
```
2. **Handler layer:** Always destructure `organizationId` from context, pass to domain.
3. **Test pattern:** Unit tests should verify that passing a wrong `organizationId` returns empty results.
4. **No cross-org JOINs in org-scoped queries.** If you need data from another org, use a platform-admin route.

### 6.3 ID Generation Strategy

All new tables use `text("id").primaryKey()` with UUID v4 generated at insert time (`crypto.randomUUID()`).

**Exception:** `webhookEndpointId` in `organization_payment_config` — also UUID but serves as a routing parameter. Must be unique, non-guessable, NOT the same as the row `id` (allows rotation without changing the PK).

### 6.4 Currency Handling

- All monetary values in **cents** (integer). No floating point.
- `currency` column is TEXT, ISO 4217 code ("RUB", "USD", "EUR").
- Platform supports multiple currencies. A listing's pricing profile defines its currency.
- Cross-currency bookings are not allowed (booking currency must match pricing profile currency).

### 6.5 Timestamp Strategy

- All timestamps: `timestamp("col", { withTimezone: true, mode: "date" })`
- `...timestamps` spread for `createdAt`/`updatedAt` (auto-managed)
- Domain-specific timestamps (e.g., `startsAt`, `endsAt`, `cancelledAt`) are explicit columns, not managed by spread.

---

## 7. Event-Driven Flows — Real Scenarios

### 7.1 Booking Creation (Happy Path)

```
Customer → Storefront → [publicProcedure] booking.create

1. VALIDATE
   ├── Check listing exists + is active + org owns it
   ├── Check availability (no conflicts in listing_availability_block, existing bookings)
   ├── Resolve pricing (profile + rules → final price)
   ├── Resolve payment config (from publication.merchantType)
   └── Validate contact info, time range

2. AUTO-ENROLL CUSTOMER (D1: hybrid auto-membership)
   ├── Check if member row exists for (org, user)
   ├── If not: INSERT member (role: "customer", organizationId, userId)
   └── Customer now has org membership for notifications to work

3. INSERT
   ├── booking (status: pending, paymentStatus: unpaid)
   └── booking_discount_application (if discount code provided + validated)

4. EMIT EVENT (via eventBus)
   ├── "booking.created"
   │   ├── recipients: org members with booking:read permission
   │   ├── channels: [in_app, telegram]
   │   └── payload: { bookingId, listingName, customerName, amount, dates }
   │
   └── eventBus.flush(queues)
       └── notificationsPusher → pg-boss queue

5. RETURN to customer
   └── { bookingId, paymentWidget: { publicKey, merchantType, amount } }

--- async (notification worker) ---

6. pg-boss delivers "notification.event.v1"
   ├── NotificationProcessorService.processEventById(eventId)
   ├── For each recipient × channel:
   │   ├── Check preferences (enabled?)
   │   ├── Create intent
   │   ├── Send via provider (in_app / telegram / email)
   │   └── Record delivery
```

### 7.2 Payment Webhook Processing

```
CloudPayments → POST /api/payments/webhook/:endpointId/pay

1. ROUTE
   ├── Look up organization_payment_config WHERE webhookEndpointId = :endpointId
   ├── NOT FOUND → 404 (logged)
   ├── SUSPENDED → 503

2. AUTHENTICATE
   ├── Load decrypted credentials
   ├── adapter.authenticateWebhook(request, credentials)
   ├── FAIL → 401 (logged in payment_webhook_event)

3. PARSE + PROCESS
   ├── adapter.parseWebhookBody(request)
   ├── Extract transactionId, invoiceId (= bookingId), amount, status
   ├── Upsert booking_payment_attempt
   ├── Sync booking.paymentStatus

4. EMIT EVENTS (if payment confirmed — multi-pusher pattern, D7)
   ├── "booking.payment_confirmed"
   │   ├── notificationsPusher → customer + org members [in_app, email]
   │   └── trackingPusher → fire CAPI "Purchase" conversion for active pixels
   └── eventBus.flush(queues) dispatches to separate pg-boss queues

5. LOG
   ├── Insert payment_webhook_event (success)
   └── Return { code: 0 } to CloudPayments

--- async (workers process separate queues) ---

6. Notification worker (NOTIFICATION_QUEUE) → processes intents → delivers
7. Tracking worker (TRACKING_QUEUE) → loads tracking_pixel_config → fires CAPI events → logs tracking_conversion_event
8. Calendar sync worker (CALENDAR_SYNC_QUEUE) → creates Google Calendar event via listing_calendar_connection
```

### 7.3 Booking Cancellation

```
Customer → Dashboard → [protectedProcedure] booking.requestCancellation

1. VALIDATE
   ├── Booking belongs to customer (customerUserId check)
   ├── Booking is in cancellable state (pending or confirmed)
   └── Check cancellation policy (time before start, penalties)

2. INSERT
   ├── booking_cancellation_request (status: pending, requestedRefundCents)

3. EMIT EVENT
   ├── "booking.cancellation_requested"
   │   └── recipients: org members with booking:cancel permission

--- Org manager reviews ---

4. [organizationProcedure] booking.approveCancellation

5. UPDATE
   ├── booking_cancellation_request.status → "approved"
   ├── booking.status → "cancelled"
   ├── booking.cancelledAt, cancelledByUserId

6. INITIATE REFUND (if applicable)
   ├── Insert booking_refund (status: pending)
   ├── Call payment provider refund API using merchantPaymentConfigId credentials
   ├── Update booking_refund.status → "processed"
   ├── Update booking.paymentStatus → "refunded"
   ├── Update booking.refundAmountCents

7. EMIT EVENTS
   ├── "booking.cancelled" → customer notification
   ├── "booking.refund_initiated" → customer + org finance
   └── Reverse tracking: may fire "Refund" conversion event for CAPI
```

### 7.4 Listing Publication + Storefront

```
Org Owner → Dashboard → [organizationProcedure] listing.publish

1. CREATE listing_publication
   ├── channelType: "platform_marketplace"
   ├── merchantType: "platform" (default)
   ├── platformFeePercentage: 15

--- Customer browses storefront ---

2. [publicProcedure] storefront.search
   ├── Query: listing + listing_publication WHERE channelType = "platform_marketplace" AND isActive AND visibility = "public"
   ├── JOIN listing_pricing_profile for display price
   ├── Return: name, photos, base price, location, amenities

3. [publicProcedure] storefront.getAvailability
   ├── Load listing_availability_rule + listing_availability_block + existing bookings
   ├── Calculate available time slots for requested date range
   └── Return: available slots with pricing

4. [publicProcedure] storefront.getQuote
   ├── Resolve pricing profile (publication-level or default)
   ├── Apply pricing rules (weekend surcharge, etc.)
   ├── Calculate: basePrice + serviceFee + tax - discount
   └── Return: { breakdown, totalCents, currency, depositCents }
```

### 7.5 Assistant Multi-Tenant Chat

```
External Widget → POST /api/assistant/chat (API key auth)

1. AUTH
   ├── Extract API key from header
   ├── Look up assistant_api_key WHERE keyHash = hash(key)
   ├── Resolve: organizationId, serviceKey

2. RESOLVE SCOPE
   ├── Load assistant_scope_config for (orgId, serviceKey)
   ├── Fallback: (orgId, "default") → (null, serviceKey) → (null, "default")
   ├── Load organization_listing_type for available types

3. BUILD CONTEXT
   ├── System prompt: template with {{orgName}}, {{listingTypes}}, {{knowledgeContext}}
   ├── Tool set: filtered by enabledToolSlugs, permission-gated
   └── Create scoped API client (injects orgId into all calls)

4. STREAM RESPONSE
   ├── AI model processes message with scoped tools
   ├── Tool calls go through the regular oRPC pipeline (org-scoped)
   └── Save messages to assistant_chat (with organizationId)
```

---

## 8. Access Control Matrix

### 8.1 Existing Permission Categories

From `organization-access.ts`:
```typescript
organizationStatements = {
  ...defaultStatements,   // organization, member, invitation, team, ac
  task: ["create", "read", "update", "delete"],
  payment: ["create", "read", "update", "delete"],
  support: ["create", "read", "update", "delete"],
  intake: ["create", "read", "update", "delete"],
  notification: ["create", "read", "update", "delete"],
}
```

### 8.2 New Permission Categories Needed

```typescript
organizationStatements = {
  ...existing,
  listing: ["create", "read", "update", "delete"],    // NEW
  booking: ["create", "read", "update", "delete"],     // NEW
  tracking: ["create", "read", "update", "delete"],    // NEW
  affiliate: ["create", "read", "update", "delete"],   // NEW
  review: ["create", "read", "update", "delete"],      // NEW — moderate reviews
}
```

### 8.3 Full Role × Permission Matrix

| Permission | org_owner | org_admin | manager | agent | member | customer |
|-----------|-----------|-----------|---------|-------|--------|----------|
| **listing:create** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **listing:read** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **listing:update** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **listing:delete** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **booking:create** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **booking:read** | ✅ | ✅ | ✅ | ✅ | ✅ | own only |
| **booking:update** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **booking:delete** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **payment:create** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **payment:read** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **payment:update** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **tracking:read** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **tracking:create** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **support:create** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **support:read** | ✅ | ✅ | ✅ | ✅ | own | own |
| **support:update** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **affiliate:read** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **affiliate:create** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **review:create** | ✅ | ✅ | ✅ | ❌ | ❌ | own booking |
| **review:read** | ✅ | ✅ | ✅ | ✅ | ✅ | own |
| **review:update** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **review:delete** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

**"own only"** = customer can see their own bookings/tickets but not others'. Implemented in domain layer, not middleware.
**"own booking"** = customer can create a review only for their own completed booking.

### 8.4 Storefront Endpoints (No Auth Required)

These use `publicProcedure` and have NO org membership check:

| Endpoint | What it exposes | Rate limiting needed? |
|----------|----------------|----------------------|
| `storefront.searchListings` | Public listings + primary photo + base price + avg rating | Yes — prevent scraping |
| `storefront.getListingDetails` | Single listing full details + published reviews | Yes |
| `storefront.getAvailability` | Available time slots | Yes — expensive compute |
| `storefront.getQuote` | Price calculation | Yes |
| `storefront.createBooking` | Booking intake (requires captcha or similar) | Yes — abuse prevention |
| `storefront.getListingReviews` | Published reviews for a listing | Light rate limit |
| `tracking.getPixelConfig` | Pixel IDs for storefront rendering | Light rate limit |

---

## 9. Resolved Design Decisions

All previously open questions are now resolved. Each decision follows marketplace platform best practices with event-driven architecture in mind.

---

### D1: Customer Auto-Enrollment → **Option C (Hybrid Auto-Membership)**

**Decision:** When a customer creates a booking from Org X, they are auto-enrolled as `member(role: "customer")` of that org.

**Rationale:**
- Leverages the existing Better Auth organization plugin — no new auth primitives
- Org-scoped notifications work out of the box (notification_event.organizationId matches)
- The `customer` role already exists in RBAC with minimal permissions (support:read, ac:read)
- A dedicated "My Bookings" cross-org view uses `protectedProcedure` (not org-scoped) querying all orgs where `member.role = "customer"` for the current user

**Implementation rules:**
1. `createBooking()` domain service checks if `member` row exists for (org, user). If not, inserts one with `role: "customer"`.
2. Org management UI filters `WHERE role != 'customer'` by default. A "Customers" tab shows customer members separately.
3. `activeOrganizationId` is NOT auto-switched when browsing storefront. Only set when customer enters org dashboard context.
4. Cross-org "my bookings" endpoint: `protectedProcedure` → `SELECT b.* FROM booking b JOIN member m ON m.organization_id = b.organization_id AND m.user_id = :userId WHERE m.role = 'customer'`

---

### D2: Listing Metadata Validation → **Validate on Publish, Warn on Save**

**Decision:** Drafts can have partial/invalid metadata. Full JSON Schema validation runs when status changes to `active` (publish). On draft save, soft validate and return warnings (not errors).

**Implementation:**
- Domain service `validateListingMetadata(typeSlug, metadata)` loads cached `listing_type_config.metadataJsonSchema` and runs `ajv.validate()`
- On draft create/update: call validate → return `{ warnings: [...] }` in response, don't block save
- On `listing.status` → `active` or `listing_publication.isActive` → `true`: call validate → reject with 400 if invalid
- Cache `listing_type_config` rows in-memory (they change rarely). Invalidate cache on type update via event.

---

### D3: Storefront Cross-Org Queries → **Publication Table as Opt-In Gate**

**Decision:** Storefront uses `publicProcedure` with queries that cross org boundaries via the publication table.

**Query pattern:**
```sql
SELECT l.*, lp.* FROM listing l
JOIN listing_publication lp ON lp.listing_id = l.id
WHERE lp.channel_type = 'platform_marketplace'
  AND lp.is_active = true
  AND lp.visibility = 'public'
  AND l.status = 'active'
```

**Indexes required:**
```sql
CREATE INDEX listing_publication_storefront_idx
  ON listing_publication (channel_type, is_active, visibility)
  WHERE channel_type = 'platform_marketplace';
```

This is the ONLY intentional cross-org boundary in the system.

---

### D4: Calendar Sync Isolation → **Plain Text, No Encryption**

**Decision:** Calendar sync tokens and watch channel IDs are stored as plain text. They are not secrets — they're session tokens for push notification verification that expire and rotate.

The actual calendar event content is NOT stored — only sync metadata. If an attacker accesses the DB, calendar tokens alone don't expose end-user data.

---

### D5: Payment Config Mid-Booking → **Snapshot at Creation**

**Decision:** `booking.merchantPaymentConfigId` is set at booking creation time and never changed. This snapshots which payment config was active. Even if the org changes providers, existing bookings use their original config for webhook matching, refunds, and reconciliation.

**Soft-delete payment configs:** When an org deactivates a payment config, it remains in DB (soft-delete via `isActive = false`). Active bookings referencing it can still process refunds.

---

### D6: Index Strategy → **Lean Start, Monitor with pg_stat**

**Decision:** Apply indexes conservatively following these rules:
1. **Always index:** `organizationId` (tenant boundary), FKs used in JOINs
2. **Index for frequent WHERE:** `status`, `paymentStatus`, `customerUserId`, `startsAt`
3. **Composite for range scans:** `(listingId, startsAt, endsAt)` for availability checks
4. **Skip low-cardinality solo:** `source` (4 values), `calendarSyncStatus` — only useful in composites
5. **Monitor post-deploy:** `SELECT * FROM pg_stat_user_indexes WHERE idx_scan = 0` to find unused indexes

---

### D7: Event Bus Architecture → **Multi-Pusher Pattern**

**Decision:** Keep the current `notificationsPusher` pattern but extend it with additional pushers. Each event type can trigger multiple pushers independently. NO generic event sourcing.

**Architecture:**
```
EventBus.emit("booking.confirmed", payload)
    │
    └─ EventBus.flush(queues)
        ├── notificationsPusher(event, notificationQueue)    // → notification pipeline
        ├── trackingPusher(event, trackingQueue)              // → CAPI conversion events
        └── calendarSyncPusher(event, calendarSyncQueue)     // → Google Calendar sync
```

**Queue contracts (new):**

```typescript
// packages/notifications/src/contracts.ts — EXTEND with:

// Tracking queue
export const TRACKING_QUEUE = "tracking-events" as const;
export const trackingQueueMessageSchema = z.object({
  type: z.literal("tracking.conversion.v1"),
  payload: z.object({
    organizationId: z.string(),
    eventName: z.string(),  // "Purchase", "Lead", etc.
    bookingId: z.string().optional(),
    listingId: z.string().optional(),
    publicationId: z.string().optional(),
    valueCents: z.number().optional(),
    currency: z.string().optional(),
    customerUserId: z.string().optional(),
  }),
});

// Calendar sync queue
export const CALENDAR_SYNC_QUEUE = "calendar-sync" as const;
export const calendarSyncQueueMessageSchema = z.object({
  type: z.enum([
    "calendar.booking.created.v1",
    "calendar.booking.updated.v1",
    "calendar.booking.cancelled.v1",
  ]),
  payload: z.object({
    bookingId: z.string(),
    listingId: z.string(),
    organizationId: z.string(),
  }),
});
```

**Event → Pusher routing table:**

| Domain Event | notificationsPusher | trackingPusher | calendarSyncPusher |
|---|---|---|---|
| `booking.created` | ✅ org members | ❌ | ❌ |
| `booking.payment_confirmed` | ✅ customer + org | ✅ "Purchase" conversion | ❌ |
| `booking.confirmed` | ✅ customer | ❌ | ✅ create calendar event |
| `booking.cancelled` | ✅ customer + org | ✅ "Refund" (if applicable) | ✅ delete calendar event |
| `booking.shift_approved` | ✅ customer | ❌ | ✅ update calendar event |
| `listing.published` | ❌ | ❌ | ❌ |
| `support.ticket_created` | ✅ assigned agent | ❌ | ❌ |

---

### D8: Denormalize `organizationId` → **Yes, Always**

**Decision:** Every org-scoped table includes its own `organizationId` FK, even if derivable via JOINs.

**Reasons:**
1. Direct index scan without JOINs for org-scoped queries
2. Notification events need `organizationId` at every level without hops
3. Pattern is established across all existing tables (notification_intent, notification_delivery, etc.)
4. PostgreSQL is not charged per column — storage cost is negligible

---

### D9: Listing Approval Workflow → **Skip for MVP, Column Ready**

**Decision:** Ship without mandatory platform approval. `listing.approvedAt` column exists but is nullable and unused in MVP. Org owners can directly set status to `active`.

**Future path:** When marketplace matures, add a `listing_moderation` table with reviewer comments and enforce `approvedAt IS NOT NULL` before `status = 'active'` in the domain layer (NOT in DB constraint — allows grandfathering).

---

### D10: Booking Race Conditions → **Exclusion Constraint with btree_gist**

**Decision:** Use PostgreSQL exclusion constraint for bulletproof time-slot overlap protection.

**Migration setup:**
```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE booking ADD CONSTRAINT booking_no_time_overlap
  EXCLUDE USING gist (
    listing_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status NOT IN ('cancelled', 'rejected', 'no_show'));
```

**Why `[)` (closed-open range):** A booking ending at 15:00 doesn't conflict with one starting at 15:00. This is standard for time-slot bookings.

**Application layer still checks first:** The domain layer runs an availability check before insert to provide a clean error message. The exclusion constraint is the safety net for true race conditions.

**Drizzle migration:** `btree_gist` extension creation goes in a custom SQL migration file. The exclusion constraint is added via `sql` in the migration since Drizzle doesn't have native exclusion constraint support.

---

## 10. New Tables — Gaps Resolved

### 10.1 Organization Settings (`organization_settings`)

**Problem:** The `organization` table is managed by Better Auth's org plugin. Adding custom columns risks sync conflicts on plugin upgrades. But orgs need: timezone, currency, business hours, cancellation policy, branding, contact info.

**Solution:** Separate `organization_settings` table with 1:1 relationship.

```
organization_settings
├── id: text PK
├── organizationId: text FK → organization (cascade) UNIQUE NOT NULL
├── timezone: text DEFAULT "UTC"
├── defaultCurrency: text DEFAULT "RUB"
├── defaultLanguage: text DEFAULT "ru"
├── businessHoursStart: integer DEFAULT 9     // 0-23
├── businessHoursEnd: integer DEFAULT 21      // 0-23
├── cancellationFreeWindowHours: integer DEFAULT 24   // hours before start when free cancellation is allowed
├── cancellationPenaltyPercentage: integer DEFAULT 0  // % charged if cancelled after free window (0-100)
├── bookingRequiresApproval: boolean DEFAULT false
├── contactEmail: text
├── contactPhone: text
├── websiteUrl: text
├── brandConfig: jsonb                        // { primaryColor, accentColor, logoUrl, faviconUrl }
├── notificationDefaults: jsonb               // { defaultChannels: ["in_app", "email"] }
├── ...timestamps
├── UNIQUE(organizationId)
```

**Access pattern:** Loaded alongside org context in middleware. Cached per-request.

### 10.2 Listing Review (`listing_review`)

**Problem:** Marketplace trust requires customer reviews. Neither legacy nor current plan includes this.

```
listing_review
├── id: text PK
├── organizationId: text FK → organization (cascade)
├── listingId: text FK → listing (cascade)
├── bookingId: text FK → booking (cascade) NOT NULL UNIQUE
├── reviewerUserId: text FK → user (set null on delete) NOT NULL
├── rating: integer NOT NULL                   // 1-5, CHECK(rating >= 1 AND rating <= 5)
├── title: text
├── body: text
├── status: pgEnum DEFAULT "pending"           // reviewStatusEnum: pending|published|hidden|flagged
├── publishedAt: timestamp
├── moderatedByUserId: text FK → user (set null)
├── moderatedAt: timestamp
├── moderationNote: text
├── ...timestamps
├── UNIQUE(bookingId)                          // one review per booking (NOT NULL ensures uniqueness works)
├── INDEX(listingId, status)
├── INDEX(organizationId)
├── INDEX(reviewerUserId)
```

**Why NOT NULL on `bookingId` and `reviewerUserId`:** A review always comes from a completed booking by an authenticated customer. The UNIQUE constraint on a nullable column doesn't prevent multiple NULLs in PostgreSQL. Making it NOT NULL ensures the one-review-per-booking invariant holds at the DB level.

```
listing_review_response
├── id: text PK
├── reviewId: text FK → listing_review (cascade)
├── authorUserId: text FK → user (set null on delete) NOT NULL
├── body: text NOT NULL
├── ...timestamps
├── UNIQUE(reviewId)                           // one response per review
```

**Rules:**
- Only customers who completed a booking can leave a review (enforce in domain: `booking.status = 'completed'` AND `booking.customerUserId = ctx.user.id`)
- One review per booking (unique constraint)
- Org owner/admin can respond once per review
- Reviews are `pending` until moderated (or auto-published after delay in MVP)
- Average rating is computed at query time (or cached in listing table via trigger/cron later)

### 10.3 Reconciled Booking Status Enums

**Legacy statuses reconciled with marketplace needs:**

```typescript
// Full booking status enum (merging legacy + new)
export const bookingStatusValues = [
  "pending",           // just created, awaiting payment or manual confirmation
  "awaiting_payment",  // confirmed intent, payment widget shown (from legacy)
  "confirmed",         // payment received OR manually confirmed
  "in_progress",       // booking time has started (from legacy)
  "completed",         // booking time ended, service delivered
  "cancelled",         // cancelled by customer or org
  "rejected",          // rejected by org (never confirmed)
  "no_show",           // customer didn't show up
  "disputed",          // payment dispute / chargeback
] as const;

// Booking payment status enum (reconciled)
export const bookingPaymentStatusValues = [
  "unpaid",           // no payment initiated
  "pending",          // payment initiated, waiting for provider
  "partially_paid",   // deposit collected, remainder pending
  "paid",             // fully paid
  "refunded",         // fully refunded
  "failed",           // payment failed
] as const;

// Payment attempt status (from legacy — richer than plan)
export const bookingPaymentAttemptStatusValues = [
  "initiated",        // API call made to provider
  "requires_action",  // 3-D Secure / customer action needed
  "authorized",       // authorized but not yet captured
  "captured",         // money collected
  "failed",           // attempt failed
  "cancelled",        // attempt cancelled before capture
  "refunded",         // this specific attempt was refunded
] as const;
```

**Booking lifecycle automation — pg-boss recurring jobs:**

Two state transitions happen based on time, not user action:
1. **`confirmed → in_progress`**: When `startsAt <= now()` and `status = 'confirmed'`
2. **`in_progress → completed`**: When `endsAt <= now()` and `status = 'in_progress'`

```typescript
// Register recurring job (runs every 5 minutes)
await pgBoss.schedule("booking-lifecycle-tick", "*/5 * * * *");

// Handler
await pgBoss.work("booking-lifecycle-tick", async () => {
  const now = new Date();

  // 1. Start confirmed bookings whose time has begun
  await db.update(booking)
    .set({ status: "in_progress", updatedAt: now })
    .where(and(
      eq(booking.status, "confirmed"),
      lte(booking.startsAt, now)
    ));

  // 2. Complete in-progress bookings whose time has ended
  await db.update(booking)
    .set({ status: "completed", updatedAt: now })
    .where(and(
      eq(booking.status, "in_progress"),
      lte(booking.endsAt, now)
    ));

  // Both emit domain events: booking.started / booking.completed → notifications, review prompts, affiliate eligibility
});
```

Side effects on `booking.completed`: emit `booking.completed` event → trigger review prompt notification (after configurable delay), mark affiliate attribution as eligible for payout, update listing aggregate rating cache.

**State transition maps — allowed transitions with guards:**

```typescript
// Booking status transitions
const bookingTransitions: Record<BookingStatus, { to: BookingStatus; guard: string; sideEffects: string[] }[]> = {
  pending: [
    { to: "awaiting_payment", guard: "auto or manual confirm", sideEffects: ["booking.awaiting_payment → show payment widget"] },
    { to: "confirmed",        guard: "manual confirm (no-pay flow)", sideEffects: ["booking.confirmed → notify customer, calendar sync"] },
    { to: "rejected",         guard: "org rejects",              sideEffects: ["booking.rejected → notify customer"] },
    { to: "cancelled",        guard: "customer or org cancels",  sideEffects: ["booking.cancelled → free calendar slot"] },
  ],
  awaiting_payment: [
    { to: "confirmed",  guard: "payment captured",  sideEffects: ["booking.payment_confirmed → notify, calendar sync"] },
    { to: "cancelled",  guard: "payment timeout/cancel", sideEffects: ["booking.cancelled → free calendar slot"] },
  ],
  confirmed: [
    { to: "in_progress", guard: "startsAt <= now() (cron)", sideEffects: ["booking.started"] },
    { to: "cancelled",   guard: "cancellation approved",    sideEffects: ["booking.cancelled → refund if applicable"] },
    { to: "no_show",     guard: "org marks no-show",        sideEffects: ["booking.no_show → possible penalty"] },
  ],
  in_progress: [
    { to: "completed", guard: "endsAt <= now() (cron)", sideEffects: ["booking.completed → review prompt, affiliate eligible"] },
    { to: "cancelled", guard: "emergency cancellation",  sideEffects: ["booking.cancelled → partial refund"] },
  ],
  completed: [
    { to: "disputed", guard: "chargeback received",  sideEffects: ["booking.disputed → freeze affiliate payout, notify org"] },
  ],
  cancelled: [],   // terminal
  rejected: [],    // terminal
  no_show: [],     // terminal
  disputed: [
    { to: "completed", guard: "dispute resolved in org's favor", sideEffects: ["booking.dispute_resolved"] },
    // If dispute lost → refund is created, but booking stays "disputed"
  ],
};

// Shift request (reschedule) transitions
// pending → approved_by_customer | approved_by_manager | rejected | expired
// Both customer + manager must approve → booking dates updated

// Dispute status transitions
// opened → under_review → resolved_won | resolved_lost
// resolved_lost → triggers refund creation

// Refund status transitions
// pending → processing → completed | failed
// failed → pending (retry)
```

### 10.4 Reconciled Booking Sub-Table Details

#### `booking_discount_code` — Full field set (from legacy)

```
booking_discount_code
├── id: text PK
├── organizationId: text FK → organization (cascade)
├── code: text NOT NULL
├── name: text NOT NULL
├── description: text
├── discountType: pgEnum NOT NULL              // discountTypeEnum: percentage|fixed_cents
├── discountValue: integer NOT NULL            // percentage (e.g. 10) or cents (e.g. 500)
├── maxDiscountCents: integer                  // cap for percentage discounts
├── minimumSubtotalCents: integer DEFAULT 0    // minimum order to apply
├── validFrom: timestamp
├── validTo: timestamp
├── usageLimit: integer                        // total uses allowed (null = unlimited)
├── usageCount: integer DEFAULT 0              // current use count — MUST use atomic increment (see note below)
├── perCustomerLimit: integer                  // uses per customer (null = unlimited)
├── appliesToListingId: text FK → listing (set null)  // null = org-wide
├── isActive: boolean DEFAULT true
├── createdByUserId: text FK → user (set null)
├── metadata: jsonb
├── ...timestamps
├── UNIQUE(organizationId, code)
├── INDEX(organizationId, isActive)
```

**Race condition prevention:** `usageCount` MUST be incremented atomically with a conditional UPDATE:
```sql
UPDATE booking_discount_code
SET "usageCount" = "usageCount" + 1, "updatedAt" = now()
WHERE id = $1
  AND "isActive" = true
  AND ("usageLimit" IS NULL OR "usageCount" < "usageLimit")
RETURNING *;
```
If zero rows returned → code is exhausted. This prevents the TOCTOU race where two concurrent bookings both see `usageCount=99` (limit=100) and both increment to 100. The same pattern applies to `perCustomerLimit` — track per-customer usage in `booking_discount_application` and check with: `SELECT COUNT(*) FROM booking_discount_application WHERE discountCodeId = $1 AND customerUserId = $2`.

#### `booking_payment_attempt` — Full field set (from legacy)

```
booking_payment_attempt
├── id: text PK
├── bookingId: text FK → booking (cascade)
├── organizationId: text FK → organization (cascade)
├── requestedByUserId: text FK → user (set null)
├── provider: text NOT NULL DEFAULT "manual"
├── idempotencyKey: text NOT NULL              // ← critical for webhook dedup
├── providerIntentId: text                     // ← provider's transaction ID
├── status: pgEnum DEFAULT "initiated"         // bookingPaymentAttemptStatusEnum
├── amountCents: integer NOT NULL DEFAULT 0
├── currency: text NOT NULL DEFAULT "RUB"
├── failureReason: text
├── metadata: jsonb
├── processedAt: timestamp
├── ...timestamps
├── UNIQUE(bookingId, idempotencyKey)          // one idempotent attempt per booking
├── UNIQUE(provider, providerIntentId)         // one record per provider transaction
├── INDEX(bookingId), INDEX(organizationId), INDEX(status)
```

#### `booking_shift_request` — Full dual-approval model (from legacy)

```
booking_shift_request
├── id: text PK
├── bookingId: text FK → booking (cascade)
├── organizationId: text FK → organization (cascade)
├── requestedByUserId: text FK → user (set null)
├── initiatedByRole: pgEnum NOT NULL           // shiftRequestInitiatorRoleEnum: customer|manager
├── status: pgEnum DEFAULT "pending"           // shiftRequestStatusEnum: pending|approved|rejected|applied|cancelled
│
│ ── Dual-approval section ──
├── customerDecision: pgEnum DEFAULT "pending"  // shiftRequestDecisionEnum: pending|approved|rejected
├── customerDecisionByUserId: text FK → user (set null)
├── customerDecisionAt: timestamp
├── customerDecisionNote: text
├── managerDecision: pgEnum DEFAULT "pending"
├── managerDecisionByUserId: text FK → user (set null)
├── managerDecisionAt: timestamp
├── managerDecisionNote: text
│
│ ── Snapshot: current vs proposed ──
├── currentStartsAt: timestamp NOT NULL
├── currentEndsAt: timestamp NOT NULL
├── proposedStartsAt: timestamp NOT NULL
├── proposedEndsAt: timestamp NOT NULL
├── currentPassengers: integer NOT NULL
├── proposedPassengers: integer NOT NULL
│
│ ── Price delta tracking ──
├── currentBasePriceCents: integer DEFAULT 0
├── currentDiscountAmountCents: integer DEFAULT 0
├── currentTotalPriceCents: integer DEFAULT 0
├── currentPayNowCents: integer DEFAULT 0
├── proposedBasePriceCents: integer DEFAULT 0
├── proposedDiscountAmountCents: integer DEFAULT 0
├── proposedTotalPriceCents: integer DEFAULT 0
├── proposedPayNowCents: integer DEFAULT 0
├── priceDeltaCents: integer DEFAULT 0
├── payNowDeltaCents: integer DEFAULT 0
├── currency: text DEFAULT "RUB"
├── discountCode: text
│
│ ── Resolution ──
├── reason: text
├── rejectedByUserId: text FK → user (set null)
├── rejectedAt: timestamp
├── rejectionReason: text
├── appliedByUserId: text FK → user (set null)
├── appliedAt: timestamp
├── paymentAdjustmentStatus: pgEnum DEFAULT "none"  // paymentAdjustmentStatusEnum: none|pending|captured|refunded|failed
├── paymentAdjustmentAmountCents: integer DEFAULT 0
├── paymentAdjustmentReference: text
├── metadata: jsonb
├── requestedAt: timestamp NOT NULL DEFAULT now()
├── ...timestamps
├── UNIQUE(bookingId)                          // one active shift request per booking
├── INDEX(organizationId), INDEX(status)
```

#### `booking_dispute` — Full field set (from legacy)

```
booking_dispute
├── id: text PK
├── bookingId: text FK → booking (cascade)
├── organizationId: text FK → organization (cascade)
├── raisedByUserId: text FK → user (set null)
├── status: pgEnum DEFAULT "open"              // disputeStatusEnum: open|under_review|resolved|rejected
├── reasonCode: text                           // chargeback reason code from provider
├── details: text
├── resolution: text
├── resolvedByUserId: text FK → user (set null)
├── resolvedAt: timestamp
├── ...timestamps
├── INDEX(bookingId), INDEX(organizationId), INDEX(status)
```

#### `booking_refund` — Full field set (from legacy)

```
booking_refund
├── id: text PK
├── bookingId: text FK → booking (cascade)
├── organizationId: text FK → organization (cascade)
├── requestedByUserId: text FK → user (set null)
├── approvedByUserId: text FK → user (set null)
├── processedByUserId: text FK → user (set null)
├── status: pgEnum DEFAULT "requested"         // refundStatusEnum: requested|approved|processed|failed|rejected
├── amountCents: integer NOT NULL DEFAULT 0
├── currency: text NOT NULL DEFAULT "RUB"
├── reason: text
├── provider: text
├── externalRefundId: text                     // provider's refund transaction ID
├── failureReason: text
├── metadata: jsonb
├── requestedAt: timestamp NOT NULL DEFAULT now()
├── approvedAt: timestamp
├── processedAt: timestamp
├── ...timestamps
├── UNIQUE(provider, externalRefundId)         // one record per provider refund
├── INDEX(bookingId), INDEX(organizationId), INDEX(status)
```

### 10.5 Reconciled Support Tables (from legacy)

The legacy support system has **5 tables**, not 3. The plan was missing `telegram_notification` and `telegram_webhook_event`. Since the new notification pipeline already handles Telegram delivery via `NotificationProcessorService`, these legacy tables become UNNECESSARY. The `inbound_message` table already captures raw webhook input from all channels.

**What we keep:**
- `support_ticket` — with full field set from legacy (adds `customerUserId`, `resolvedByUserId`, `source`, `dueAt`, `description`)
- `support_ticket_message` — with `channel` field and `attachmentsJson: jsonb`
- `inbound_message` — with `dedupeKey`, `externalThreadId`, `normalizedText` for routing

**What we drop:**
- `telegram_notification` → replaced by notification pipeline (notification_event → intent → delivery)
- `telegram_webhook_event` → raw Telegram webhooks handled by the inbound_message table

### 10.6 Reconciled Affiliate Tables (from legacy)

The legacy affiliate system has richer data than the plan specified:

**`affiliate_referral`** — adds `attributionWindowDays` (default 30), `status` enum (active|paused|archived), org nullable (platform-wide affiliates allowed)

**`booking_affiliate_attribution`** — adds `source` enum (cookie|query|manual), `referralCode` denormalized, `clickedAt` timestamp, `organizationId` denormalized

**`booking_affiliate_payout`** — adds `eligibleAt`, `paidAt`, `voidedAt`, `voidReason`, `externalPayoutRef`, per-booking unique (one payout per booking)

---

## 11. Search Infrastructure

The storefront needs three search modalities from day zero:
1. **BM25 ranked text search** — keyword queries ("catamaran Sochi", "яхта аренда")
2. **Vector similarity search** — semantic queries ("romantic sunset cruise", "family-friendly boat")
3. **Image similarity search** — "find listings that look like this photo"

All three use PostgreSQL extensions — no external search engine needed at MVP scale.

### 11.1 Text Search (Native tsvector/GIN + BM25 pg_textsearch)

Two approaches available — use both at different stages:

#### 11.1.1 Native Postgres Full-Text Search (tsvector + GIN)

Built into PostgreSQL, no extension needed. Good starting point with `ts_rank`/`ts_rank_cd` ranking.

**Drizzle schema with GIN index (single column):**

```typescript
import { index, pgTable, serial, text } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Single-column GIN index
export const listing = pgTable('listing', {
  // ...existing columns...
}, (table) => [
  // ...existing indexes...
  index('listing_name_search_idx').using('gin', sql`to_tsvector('russian', ${table.name})`),
]);
```

**Drizzle schema with weighted multi-column GIN index:**

```typescript
// Title (A) weighted higher than description (B)
(table) => [
  index('listing_search_idx').using(
    'gin',
    sql`(
      setweight(to_tsvector('russian', ${table.name}), 'A') ||
      setweight(to_tsvector('russian', ${table.description}), 'B')
    )`,
  ),
]
```

**Drizzle query patterns (type-safe via `sql` template):**

```typescript
import { sql, desc, getColumns } from 'drizzle-orm';

// Basic search
const q = 'яхта аренда';
await db.select().from(listing)
  .where(sql`to_tsvector('russian', ${listing.name}) @@ to_tsquery('russian', ${q})`);

// OR match: 'catamaran | yacht'
await db.select().from(listing)
  .where(sql`to_tsvector('russian', ${listing.name}) @@ to_tsquery('russian', ${'catamaran | yacht'})`);

// AND match (all keywords): plainto_tsquery
await db.select().from(listing)
  .where(sql`to_tsvector('russian', ${listing.name}) @@ plainto_tsquery('russian', ${'sunset cruise'})`);

// Phrase match (word order matters): phraseto_tsquery
await db.select().from(listing)
  .where(sql`to_tsvector('russian', ${listing.name}) @@ phraseto_tsquery('russian', ${'family trip'})`);

// Web-style syntax: websearch_to_tsquery
await db.select().from(listing)
  .where(sql`to_tsvector('russian', ${listing.name}) @@ websearch_to_tsquery('russian', ${'family or cruise -fishing'})`);
```

**Multi-column weighted search with ranking:**

```typescript
import { desc, getColumns, sql } from 'drizzle-orm';

const search = 'яхта Сочи';
const matchQuery = sql`(
  setweight(to_tsvector('russian', ${listing.name}), 'A') ||
  setweight(to_tsvector('russian', ${listing.description}), 'B')
), to_tsquery('russian', ${search})`;

await db
  .select({
    ...getColumns(listing),
    rank: sql`ts_rank(${matchQuery})`,
    rankCd: sql`ts_rank_cd(${matchQuery})`,
  })
  .from(listing)
  .where(sql`(
    setweight(to_tsvector('russian', ${listing.name}), 'A') ||
    setweight(to_tsvector('russian', ${listing.description}), 'B')
  ) @@ to_tsquery('russian', ${search})`)
  .orderBy((t) => desc(t.rank));
```

- `ts_rank` — frequency of query terms throughout the document.
- `ts_rank_cd` — proximity of query terms within the document.

#### 11.1.2 BM25 Ranked Search (pg_textsearch)

**Why pg_textsearch over native `tsvector`?** BM25 scoring is significantly better for ranked retrieval than `ts_rank`. The `<@>` operator with Block-Max WAND optimization gives fast top-k results without scoring every document. IDF weighting, term frequency saturation, and length normalization provide search-engine-quality relevance.

**Prerequisite:** `pg_textsearch` must be in `shared_preload_libraries` (postgresql.conf) and the extension created per-database.

**Migration — custom SQL (Drizzle doesn't auto-create extensions or BM25 indexes):**

```sh
npx drizzle-kit generate --custom
```

```typescript
// 0003_bm25_indexes.sql (custom migration)
import { sql } from 'drizzle-orm';

export async function up(db) {
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_textsearch`);
  await db.execute(sql`
    CREATE INDEX listing_name_bm25_idx ON listing USING bm25(name) WITH (text_config='russian')
  `);
  await db.execute(sql`
    CREATE INDEX listing_desc_bm25_idx ON listing USING bm25(description) WITH (text_config='russian')
  `);
}
```

**BM25 query via Drizzle (raw SQL — no typed `<@>` support):**

```typescript
// Basic BM25 ranked search — scores are negative, lower = better
const results = await db.execute(sql`
  SELECT l.id, l.name,
         l.description <@> to_bm25query(${searchTerm}, 'listing_desc_bm25_idx') AS score
  FROM listing l
  JOIN listing_publication lp ON lp.listing_id = l.id
  WHERE lp.channel_type = 'platform_marketplace'
    AND lp.is_active = true
    AND l.description <@> to_bm25query(${searchTerm}, 'listing_desc_bm25_idx') < -0.5
  ORDER BY score
  LIMIT 20
`);
```

**Multi-language:** Store `searchLanguage: text DEFAULT "russian"` on `organization_settings`. When i18n is needed, create per-language BM25 indexes and route queries to the appropriate index via `to_bm25query(term, indexName)`.

**Migration path:** Start with native tsvector/GIN (zero config). Upgrade to BM25 when ranking quality matters for RAG/AI search. Both can coexist.

### 11.2 Vector Similarity Search (pgvector)

**Purpose:** Semantic search — customers describe what they want in natural language, and we find listings with similar meaning even if keywords don't match.

**Core mindset: vectors are derived data, not source data.**
- Embeddings are computed artifacts — derived from text/images via an external model.
- Never generate embeddings in the request path — always async via pg-boss.
- Embeddings go stale — when source data changes, the vector must be recomputed.
- The embedding model is a dependency — changing models means re-embedding everything.
- `NULL` embedding = not yet computed — queries always filter `WHERE embedding IS NOT NULL`.

**Schema — listing vector columns:**

```
listing (additional columns)
├── embedding: vector(1536)                    // text embedding of name + description + amenities (nullable)
├── embeddingModel: text                       // which model generated this (e.g. 'text-embedding-3-small')
├── embeddingUpdatedAt: timestamp              // when the embedding was last computed
├── INDEX listing_embedding_idx USING hnsw(embedding vector_cosine_ops)
```

```typescript
// Drizzle schema addition
import { vector } from 'drizzle-orm/pg-core';

// On the listing table:
embedding: vector('embedding', { dimensions: 1536 }),
embeddingModel: text('embedding_model'),
embeddingUpdatedAt: timestamp('embedding_updated_at', { withTimezone: true }),
// With table index:
index('listing_embedding_idx').using('hnsw', table.embedding.op('vector_cosine_ops')),
```

**Embedding lifecycle — when vectors are created and refreshed:**

| Trigger | Domain Event | pg-boss Job | What Gets Embedded |
|---------|-------------|-------------|--------------------|
| Listing created | `listing.created` | `generate-listing-embedding` | name + description + amenities |
| Listing text updated | `listing.content_updated` | `generate-listing-embedding` | Re-embed with new content |
| Image uploaded | `listing_asset.created` | `generate-image-embedding` | Image via CLIP model |
| Initial data migration | Manual/cron | `backfill-embeddings` | All rows where `embedding IS NULL` |
| Model upgrade | Manual one-off | `reembed-all` | All rows (new model = new vectors) |

**Embedding service interface (injectable, mockable):**

```typescript
export interface EmbeddingService {
  generateTextEmbedding(text: string): Promise<number[]>;
  generateImageEmbedding(imageUrl: string): Promise<number[]>;
  readonly model: string;       // e.g. 'text-embedding-3-small'
  readonly dimensions: number;  // e.g. 1536
}
```

**pg-boss job handler:**

```typescript
async function handleGenerateListingEmbedding(
  job: { data: { listingId: string } },
  deps: { db: Database; embeddingService: EmbeddingService }
) {
  const listing = await deps.db.query.listing.findFirst({
    where: eq(schema.listing.id, job.data.listingId),
    with: { amenities: true },
  });
  if (!listing) return;

  const input = [listing.name, listing.description,
    listing.amenities.map(a => a.label).join(', ')
  ].filter(Boolean).join('. ');

  const embedding = await deps.embeddingService.generateTextEmbedding(input);

  await deps.db.update(schema.listing)
    .set({
      embedding,
      embeddingModel: deps.embeddingService.model,
      embeddingUpdatedAt: new Date(),
    })
    .where(eq(schema.listing.id, listing.id));
}
```

**Staleness detection (cron or on-demand):**

```typescript
// Find listings where content changed after embedding was generated
const staleListings = await db.select({ id: listing.id })
  .from(listing)
  .where(and(
    isNotNull(listing.embedding),
    gt(listing.updatedAt, listing.embeddingUpdatedAt)
  ));
// Queue re-embedding jobs for each stale listing
```

**Generating embeddings (OpenAI):**

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });

export const generateEmbedding = async (value: string): Promise<number[]> => {
  const input = value.replaceAll('\n', ' ');
  const { data } = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input,
  });
  return data[0].embedding;
};
```

**Semantic search query (type-safe via Drizzle helpers):**

Drizzle provides `cosineDistance`, `l2Distance`, `innerProduct`, `l1Distance`, `maxInnerProduct` helpers.
`cosineDistance` returns distance (0–2); use `1 - cosineDistance` for similarity score (0–1).

```typescript
import { cosineDistance, desc, gt, sql, and, isNotNull } from 'drizzle-orm';

async function searchListings(description: string, limit = 20) {
  const queryEmbedding = await generateEmbedding(description);
  const similarity = sql<number>`1 - (${cosineDistance(listing.embedding, queryEmbedding)})`;

  return db
    .select({ id: listing.id, name: listing.name, similarity })
    .from(listing)
    .where(and(isNotNull(listing.embedding), gt(similarity, 0.5)))
    .orderBy((t) => desc(t.similarity))
    .limit(limit);
}
```

**Pre-filtered similarity (org-scoped, active only):**

```typescript
import { cosineDistance, desc, sql, eq, and, isNotNull } from 'drizzle-orm';

const results = await db
  .select({
    id: listing.id,
    name: listing.name,
    similarity: sql<number>`1 - (${cosineDistance(listing.embedding, queryEmbedding)})`,
  })
  .from(listing)
  .innerJoin(listingPublication, eq(listing.id, listingPublication.listingId))
  .where(
    and(
      isNotNull(listing.embedding),
      eq(listingPublication.channelType, 'platform_marketplace'),
      eq(listingPublication.isActive, true),
      eq(listing.status, 'active'),
    ),
  )
  .orderBy(sql`${cosineDistance(listing.embedding, queryEmbedding)}`)
  .limit(20);
```

**Migration — custom SQL for extension + vector column in Drizzle schema:**

Drizzle doesn't auto-create extensions. Generate a custom migration:

```sh
npx drizzle-kit generate --custom
```

```sql
-- 0001_extensions.sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Then define vector columns in the Drizzle schema — `drizzle-kit generate` picks them up:

```typescript
import { index, pgTable, text, vector, timestamp } from 'drizzle-orm/pg-core';

export const listing = pgTable('listing', {
  // ...other columns...
  embedding: vector('embedding', { dimensions: 1536 }),
  embeddingModel: text('embedding_model'),
  embeddingUpdatedAt: timestamp('embedding_updated_at', { withTimezone: true }),
}, (table) => [
  index('listing_embedding_idx').using('hnsw', table.embedding.op('vector_cosine_ops')),
]);
```

**Index strategy:**
1. **Dev / <10K rows** — no index needed, exact search is fine.
2. **10K–1M rows** — HNSW (`m=16, ef_construction=64`). Build `CONCURRENTLY` in production.
3. **>1M rows** — evaluate IVFFlat if HNSW build time or memory is prohibitive.
4. Query-time recall tuning: `SET hnsw.ef_search = 100;` (default 40).

### 11.3 Image Similarity Search (pgvector + CLIP)

**Purpose:** "Find listings that look like this photo" — visual similarity search across `listing_asset` images.

**How it works:** CLIP maps images and text into the **same** embedding space (512 dims). This enables:
- **Image → Image:** upload a photo, find visually similar listings.
- **Text → Image:** type "wooden deck yacht" and find matching photos without keyword tags.

**Schema — embedding column on listing_asset:**

```
listing_asset (additional columns)
├── imageEmbedding: vector(512)                // CLIP image embedding (null for non-image assets)
├── imageEmbeddingModel: text                  // e.g. 'clip-ViT-B-32'
├── imageEmbeddingUpdatedAt: timestamp
├── INDEX listing_asset_image_embedding_idx USING hnsw(imageEmbedding vector_cosine_ops)
```

**Embedding lifecycle — same pattern as text vectors:**

| Trigger | Event | Job | Notes |
|---------|-------|-----|-------|
| Image uploaded | `listing_asset.created` (mimeType `image/*`) | `generate-image-embedding` | Async, never in upload path |
| Image replaced | `listing_asset.updated` | `generate-image-embedding` | Re-embed new image |
| CLIP model upgrade | Manual | `reembed-all-images` | All image assets |
| Backfill | Migration | `backfill-image-embeddings` | Assets where `imageEmbedding IS NULL` |

**Embedding generation:**

```typescript
// pg-boss job — generates CLIP embedding for uploaded image
async function handleGenerateImageEmbedding(
  job: { data: { assetId: string } },
  deps: { db: Database; embeddingService: EmbeddingService }
) {
  const asset = await deps.db.query.listingAsset.findFirst({
    where: eq(schema.listingAsset.id, job.data.assetId),
  });
  if (!asset || !asset.mimeType?.startsWith('image/')) return;

  const imageUrl = `${S3_PUBLIC_URL}/${asset.storageKey}`;
  const embedding = await deps.embeddingService.generateImageEmbedding(imageUrl);

  await deps.db.update(schema.listingAsset)
    .set({
      imageEmbedding: embedding,
      imageEmbeddingModel: deps.embeddingService.model,
      imageEmbeddingUpdatedAt: new Date(),
    })
    .where(eq(schema.listingAsset.id, asset.id));
}
```

**Query patterns:**

```typescript
// Image → Image: "find listings with similar photos"
async function searchByImage(imageEmbedding: number[], limit = 10) {
  const similarity = sql<number>`1 - (${cosineDistance(listingAsset.imageEmbedding, imageEmbedding)})`;
  return db.selectDistinctOn([listing.id], {
    listingId: listing.id,
    name: listing.name,
    similarity,
  })
  .from(listingAsset)
  .innerJoin(listing, eq(listing.id, listingAsset.listingId))
  .where(and(isNotNull(listingAsset.imageEmbedding), gt(similarity, 0.6)))
  .orderBy(listing.id, desc(similarity))
  .limit(limit);
}

// Text → Image: "show me yachts with wooden decks"
// Same query but encode the text query with CLIP's text encoder → same 512-dim space
```

**MVP scope:** Image search is a differentiator but non-blocking. Phase 1: text embeddings on `listing`. Phase 2: image embeddings on `listing_asset` when CLIP inference infra is ready (self-hosted FastAPI + sentence-transformers, or hosted vision API).

### 11.4 Hybrid Search — BM25 + pgvector (RRF)

**Why hybrid?** BM25 excels at exact keyword matches ("catamaran Sochi"). Vectors excel at semantic intent ("romantic sunset boat ride"). Neither alone covers both. Reciprocal Rank Fusion (RRF) combines them in one query — no external reranker, no data sync.

**How RRF works:** Run BM25 and vector search in parallel CTEs, rank each result set, then fuse:
`rrf_score = Σ (1 / (k + rank_i))` across result sets. `k=60` is the standard constant.

**The actual hybrid query:**

```sql
-- Single query combining BM25 keyword precision + vector semantic understanding
WITH keyword_results AS (
  SELECT id,
         ROW_NUMBER() OVER (
           ORDER BY description <@> to_bm25query(:query, 'listing_desc_bm25_idx')
         ) AS rank_kw
  FROM listing
  ORDER BY description <@> to_bm25query(:query, 'listing_desc_bm25_idx')
  LIMIT 20
),
semantic_results AS (
  SELECT id,
         ROW_NUMBER() OVER (ORDER BY embedding <=> :query_vec) AS rank_vec
  FROM listing
  WHERE embedding IS NOT NULL
  ORDER BY embedding <=> :query_vec
  LIMIT 20
)
SELECT COALESCE(k.id, s.id) AS id,
       COALESCE(1.0 / (60 + k.rank_kw), 0.0) +
       COALESCE(1.0 / (60 + s.rank_vec), 0.0) AS rrf_score
FROM keyword_results k
FULL OUTER JOIN semantic_results s ON k.id = s.id
ORDER BY rrf_score DESC
LIMIT 10;
```

**Weighted RRF (tunable blend):**

```sql
-- 70% semantic understanding, 30% keyword precision
0.7 * COALESCE(1.0 / (60 + s.rank_vec), 0.0) +
0.3 * COALESCE(1.0 / (60 + k.rank_kw), 0.0) AS rrf_score
```

**Drizzle integration — `db.execute(sql`...`)` for hybrid (BM25 `<@>` has no typed Drizzle helper):**

```typescript
async function hybridSearch(query: string, limit = 10) {
  const queryEmbedding = await generateEmbedding(query);

  return db.execute(sql`
    WITH keyword_results AS (
      SELECT id,
             ROW_NUMBER() OVER (
               ORDER BY description <@> to_bm25query(${query}, 'listing_desc_bm25_idx')
             ) AS rank_kw
      FROM listing
      ORDER BY description <@> to_bm25query(${query}, 'listing_desc_bm25_idx')
      LIMIT 20
    ),
    semantic_results AS (
      SELECT id,
             ROW_NUMBER() OVER (ORDER BY embedding <=> ${sql`${queryEmbedding}::vector`}) AS rank_vec
      FROM listing
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${sql`${queryEmbedding}::vector`}
      LIMIT 20
    )
    SELECT l.id, l.name,
           COALESCE(1.0 / (60 + k.rank_kw), 0.0) +
           COALESCE(1.0 / (60 + s.rank_vec), 0.0) AS rrf_score
    FROM listing l
    LEFT JOIN keyword_results k ON l.id = k.id
    LEFT JOIN semantic_results s ON l.id = s.id
    WHERE k.id IS NOT NULL OR s.id IS NOT NULL
    ORDER BY rrf_score DESC
    LIMIT ${limit}
  `);
}
```

**Weighted hybrid variant (70% semantic, 30% keyword):**

```typescript
async function weightedHybridSearch(query: string, limit = 10) {
  const queryEmbedding = await generateEmbedding(query);

  return db.execute(sql`
    WITH keyword_results AS (
      SELECT id,
             ROW_NUMBER() OVER (
               ORDER BY description <@> to_bm25query(${query}, 'listing_desc_bm25_idx')
             ) AS rank_kw
      FROM listing
      ORDER BY description <@> to_bm25query(${query}, 'listing_desc_bm25_idx')
      LIMIT 20
    ),
    semantic_results AS (
      SELECT id,
             ROW_NUMBER() OVER (ORDER BY embedding <=> ${sql`${queryEmbedding}::vector`}) AS rank_vec
      FROM listing
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${sql`${queryEmbedding}::vector`}
      LIMIT 20
    )
    SELECT l.id, l.name,
           0.7 * COALESCE(1.0 / (60 + s.rank_vec), 0.0) +
           0.3 * COALESCE(1.0 / (60 + k.rank_kw), 0.0) AS rrf_score
    FROM listing l
    LEFT JOIN keyword_results k ON l.id = k.id
    LEFT JOIN semantic_results s ON l.id = s.id
    WHERE k.id IS NOT NULL OR s.id IS NOT NULL
    ORDER BY rrf_score DESC
    LIMIT ${limit}
  `);
}
```

**Full storefront search combines all modalities:**

```typescript
async function storefrontSearch(params: {
  query?: string;             // text → BM25 + semantic
  imageEmbedding?: number[];  // CLIP embedding → image similarity
  filters: { lat?, lng?, radiusMiles?, amenities?, priceRange?, listingType? };
  limit: number;
}) {
  // 1. Hybrid BM25 + vector (RRF) — if query provided
  // 2. Image similarity — if imageEmbedding provided
  // 3. Geospatial pre-filter (earthdistance)
  // 4. Amenity/price/type filters (B-tree, exact match)
  // 5. Fuse all result sets with weighted RRF
}
```

**When to use which search mode:**

| User Action | Search Mode | Why |
|-------------|-------------|-----|
| Types keywords | BM25 only | Fast, precise, no embedding cost |
| Types natural language | Hybrid (BM25 + vector) | Catch exact + semantic matches |
| Uploads photo | Image vector | Visual similarity |
| Types + uploads photo | Hybrid + image RRF | All three fused |

### 11.5 Geospatial Search

**Problem:** Customers search by proximity ("boats near me", "listings within 10km of city center").

**Implementation:** Use PostgreSQL's `earth_distance` + `cube` extensions (lighter than PostGIS):

```sql
CREATE EXTENSION IF NOT EXISTS cube;
CREATE EXTENSION IF NOT EXISTS earthdistance;

-- Query: find listings within 10km of coordinates
SELECT l.*, ll.latitude, ll.longitude,
  (ll.latitude <@> point(:userLat, :userLng)) AS distance_miles
FROM listing l
JOIN listing_location ll ON ll.id = l.location_id
WHERE (ll.latitude <@> point(:userLat, :userLng)) < :radiusMiles
ORDER BY distance_miles ASC;
```

**Index:** `CREATE INDEX listing_location_coords_idx ON listing_location USING gist (ll_to_earth(latitude, longitude));`

**Alternative:** If spatial queries become complex, migrate to PostGIS later. `earthdistance` is sufficient for radius search.

### 11.6 Filtering

**Amenity filters:** Index amenity keys for fast filtering:
```sql
-- Find listings with WiFi AND parking
SELECT DISTINCT l.* FROM listing l
JOIN listing_amenity la ON la.listing_id = l.id
WHERE la.key IN ('wifi', 'parking') AND la.is_enabled = true
GROUP BY l.id
HAVING COUNT(DISTINCT la.key) = 2;
```

**Price range:** Direct WHERE on `listing_pricing_profile.baseHourlyPriceCents` with composite index `(listingId, isDefault, baseHourlyPriceCents)`.

**Listing type:** Direct WHERE on `listing.listingTypeSlug`.

### 11.7 Testing Strategy — Vector & BM25 Mocking

**Problem:** Unit tests must not call OpenAI/CLIP APIs or require pg_textsearch in `shared_preload_libraries`. Integration tests need deterministic similarity results.

**Approach: Layered mocking**

```typescript
// 1. Embedding service interface (swappable in tests)
interface EmbeddingService {
  generateTextEmbedding(text: string): Promise<number[]>;
  generateImageEmbedding(imageUrl: string): Promise<number[]>;
}

// 2. Production implementation
class OpenAIEmbeddingService implements EmbeddingService {
  async generateTextEmbedding(text: string) {
    const { data } = await openai.embeddings.create({ model: 'text-embedding-3-small', input: text });
    return data[0].embedding;
  }
  // ...
}

// 3. Test implementation — deterministic vectors
class MockEmbeddingService implements EmbeddingService {
  // Return deterministic embeddings based on content hash
  // Similar texts get similar vectors, dissimilar texts get orthogonal vectors
  async generateTextEmbedding(text: string): Promise<number[]> {
    return hashToVector(text, 1536);
  }
  async generateImageEmbedding(imageUrl: string): Promise<number[]> {
    return hashToVector(imageUrl, 512);
  }
}

// 4. hashToVector: deterministic, reproducible, preserves similarity for known test fixtures
function hashToVector(input: string, dimensions: number): number[] {
  // Seed PRNG with string hash → always produces same vector for same input
  // Normalize to unit vector for cosine similarity
  const seed = hashCode(input);
  const rng = createSeededRng(seed);
  const vec = Array.from({ length: dimensions }, () => rng());
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return vec.map(v => v / norm);
}
```

**Test database setup:**
- **pgvector:** Install the extension in test DB (`CREATE EXTENSION IF NOT EXISTS vector`). pgvector is a standard extension, available in most PG docker images.
- **pg_textsearch:** Requires `shared_preload_libraries` which can't be set at runtime. For CI:
  - Use a custom Docker image with pg_textsearch pre-installed and preloaded.
  - For unit tests that don't need BM25: skip BM25 index creation, test only the domain logic.
  - For integration/e2e tests: use the custom PG image in `docker-compose.e2e.yml`.

**Vitest fixtures:**
```typescript
// packages/db/src/test-utils/search-fixtures.ts
export const SIMILAR_LISTINGS = {
  yacht: { name: 'Luxury Yacht Serenity', description: 'Sail the sunset...' },
  catamaran: { name: 'Catamaran Adventure', description: 'Sailing excursion...' },
  unrelated: { name: 'City Walking Tour', description: 'Explore downtown...' },
};
// yacht and catamaran should have similarity > 0.7
// yacht and unrelated should have similarity < 0.3
// Mock service guarantees this via content-aware hashing
```

---

## 12. PostgreSQL Extensions Required

The following extensions must be created in the first migration:

```sql
-- Required for booking time-slot overlap protection
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Required for geospatial distance calculations
CREATE EXTENSION IF NOT EXISTS cube;
CREATE EXTENSION IF NOT EXISTS earthdistance;

-- pgcrypto for gen_random_uuid() (may already exist)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Required for vector similarity search (semantic + image)
CREATE EXTENSION IF NOT EXISTS vector;

-- Required for BM25 ranked text search
-- NOTE: pg_textsearch also requires shared_preload_libraries = 'pg_textsearch' in postgresql.conf
-- This must be set BEFORE the extension can be created (requires PG restart)
CREATE EXTENSION IF NOT EXISTS pg_textsearch;
```

**Migration file:** Create a dedicated `0001_extensions.sql` custom migration that runs before any table creation.

**Docker setup for pg_textsearch:**
- Production/staging: Install pg_textsearch binary on the Dokku PG instance, add to `shared_preload_libraries`, restart.
- Local dev: Custom Dockerfile extending `postgres:17` that installs pg_textsearch and sets `shared_preload_libraries`.
- CI/E2E: Same custom image in `docker-compose.e2e.yml`.
- Unit tests: pgvector is available in standard PG images. pg_textsearch BM25 indexes are skipped in unit tests (only domain logic tested); integration tests use the custom image.

```dockerfile
# infra/docker/postgres/Dockerfile
FROM postgres:17
# Install pgvector
RUN apt-get update && apt-get install -y postgresql-17-pgvector && rm -rf /var/lib/apt/lists/*
# Install pg_textsearch (from pre-built release)
ADD https://github.com/timescale/pg_textsearch/releases/download/v1.0.0/pg_textsearch-v1.0.0-pg17-linux-amd64.tar.gz /tmp/
RUN tar -xzf /tmp/pg_textsearch-*.tar.gz -C /usr/lib/postgresql/17/ && rm /tmp/pg_textsearch-*.tar.gz
# Preload pg_textsearch
RUN echo "shared_preload_libraries = 'pg_textsearch'" >> /usr/share/postgresql/postgresql.conf.sample
```

---

## 13. SQLite → PostgreSQL Type Migration Reference

All legacy tables use SQLite types. Here's the complete translation table for porting:

| SQLite (legacy) | PostgreSQL (new) | Notes |
|---|---|---|
| `sqliteTable` | `pgTable` | Table constructor |
| `integer("x", { mode: "timestamp_ms" })` | `timestamp("x", { withTimezone: true, mode: "date" })` | Native timestamps |
| `integer("x", { mode: "boolean" })` | `boolean("x")` | Native booleans |
| `text("x", { enum: [...] })` | Column referencing `pgEnum(...)` | Native PG enums |
| `real("x")` | `doublePrecision("x")` | For lat/lng |
| `text("metadata")` | `jsonb("metadata")` | Native JSON operations |
| `text("x", { mode: "json" })` | `jsonb("x")` | Native JSONB |
| `integer("x")` | `integer("x")` | Same |
| `text("x")` | `text("x")` | Same |
| `sql\`(cast(unixepoch(...) ...))\`` | `sql\`now()\`` | Default timestamp |

---

## 14. Asset Storage Strategy

**Decision:** Use S3-compatible object storage (MinIO for local dev, any S3-compatible for production — e.g., R2, Selectel S3).

**Schema implication:** `listing_asset.storageKey` is a full object key like `orgs/{orgId}/listings/{listingId}/photos/{uuid}.jpg`. The URL is computed at query time: `{S3_PUBLIC_URL}/{storageKey}`.

**Upload flow:**
1. Client requests presigned upload URL via `listing.getUploadUrl` endpoint
2. Client uploads directly to S3 (no server proxying)
3. Client confirms upload → `listing_asset` row created with `reviewStatus: "pending"`
4. For MVP: auto-approve. For marketplace: manual review of user-uploaded content.

**Env vars:** `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_PUBLIC_URL` — set via `dokku config:set`.

---

## Summary: Implementation Priority (Final)

| Phase | Tables | Depends On | Notes |
|-------|--------|------------|-------|
| **0** | PG extensions migration (`btree_gist`, `cube`, `earthdistance`, `vector`, `pg_textsearch`) | None | Custom SQL migration, run first. pg_textsearch requires shared_preload_libraries. |
| **1a** | `listing_type_config`, `organization_listing_type`, `organization_settings` | 0 | Org config + type registry |
| **1b** | `listing` + 8 sub-tables (location, amenity, asset, calendar_connection, calendar_webhook_event, availability_rule, availability_block, minimum_duration_rule) | 1a | Core entity + search indexes |
| **1c** | `listing_pricing_profile`, `listing_pricing_rule`, `platform_fee_config` | 1b | Pricing engine |
| **1d** | `listing_publication` | 1b, 1c | Multi-channel distribution |
| **1e** | `booking` + 9 sub-tables (calendar_link, discount_code, discount_application, payment_attempt, cancellation_request, shift_request, dispute, refund) + exclusion constraint | 1b, 1c, 1d | Core transaction + btree_gist overlap protection |
| **2** | `organization_payment_config`, `payment_webhook_event` | 1e | Per-org webhook routing |
| **3** | `tracking_pixel_config`, `tracking_conversion_event`, `tracking_click_attribution` | 1d, 1e | Conversion tracking + CAPI |
| **4** | `assistant_chat` (modify), `assistant_scope_config`, `assistant_api_key` | None | Multi-tenant AI |
| **5** | `support_ticket`, `support_ticket_message`, `inbound_message` | None | Multi-channel support |
| **6** | `affiliate_referral`, `booking_affiliate_attribution`, `booking_affiliate_payout` | 1e | Referral system |
| **7** | `listing_review`, `listing_review_response` | 1e | Trust & social proof |
| **8** | BM25 indexes on `listing` (name, description) + `vector(1536)` embedding column + HNSW index | 1b | Search: BM25 text + semantic vectors |
| **9** | `listing_asset.imageEmbedding` vector(512) + HNSW index | 8, 1b | Image similarity search (deferred until CLIP infra ready) |

**TOTAL: ~50 tables (22 existing + ~28 new) + 3 search indexes (BM25, text vector, image vector)**

**→ All questions resolved. All enums reconciled. All missing fields documented. Ready to write Drizzle schema code.**
