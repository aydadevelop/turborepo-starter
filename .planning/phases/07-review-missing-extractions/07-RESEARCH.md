# Phase 07: review-missing-extractions — Research

**Researched:** 2026-03-10
**Domain:** Legacy extraction — booking computations, Google Calendar adapter, cancellation/dispute policies
**Confidence:** HIGH — all findings verified against live codebase (legacy/ + packages/)

## Summary

Phase 7 is a legacy extraction phase. All four plans port existing business logic from `legacy/full-stack-cf-app/packages/api/src/...` into new domain packages. There are no new external library choices to make. The primary research value is identifying **exact source files to port**, **naming discrepancies between plan specs and legacy code**, **what already exists in our packages** (avoid re-implementing), and one critical architectural finding for the Google Calendar adapter.

**Primary recommendation:** Port logic from the identified legacy locations. Do not hand-roll OAuth/JWT — the legacy GoogleCalendarAdapter uses `crypto.subtle` (WebCrypto, available in Bun/Node 18+) for JWT signing. No `googleapis` npm package is used or needed.

---

## Standard Stack

### Core (all already in workspace — no new installs needed)
| Library / API | version | Purpose | Notes |
|---|---|---|---|
| `drizzle-orm` | `1.0.0-beta.16-2ffd1a5` | DB queries in all domain packages | Use exact version — monorepo pinned |
| `@my-app/db` | workspace | Drizzle client + all schema tables | All schema tables already migrated |
| `@my-app/events` | workspace | `registerEventPusher`, `emitDomainEvent` | All needed event types already in DomainEventMap |
| `@my-app/workflows` | workspace | `createWorkflow`, `createStep` | Use for processCancellationWorkflow + processDisputeWorkflow in 07-04 |
| `zod` | (workspace via config) | Schema validation for policy metadata | Used in legacy action-policy.ts and cancellation policy.service.ts |
| WebCrypto (`crypto.subtle`) | Bun built-in | JWT signing for Google Calendar auth | No external library needed |

### New packages to create
| Package | Depends on |
|---|---|
| `packages/calendar` | `@my-app/db`, `@my-app/events` |
| `packages/disputes` | `@my-app/db`, `@my-app/workflows`, `@my-app/booking` |

### Package.json conventions (derive from packages/support + packages/booking)
```json
{
  "name": "@my-app/{name}",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.4.6",
    "@my-app/config": "workspace:*",
    "@my-app/vitest-config": "workspace:*",
    "typescript": "^5",
    "vitest": "^4.0.18"
  }
}
```

> ⚠️ **Plan 07-02 correction**: plan lists `"vitest": "^3.0.9"` — actual workspace version is `^4.0.18`. Use `^4.0.18`.

---

## Architecture Patterns

### Pattern 1: Function-per-operation, db-as-param (all domain packages)
All exported service functions accept `db: Db` as last parameter. No module-level DB singletons. No class-based services.

```typescript
// Correct pattern (from packages/booking, packages/pricing, packages/support)
export async function resolveActivePricingProfile(
  params: { listingId: string; startsAt: Date },
  db: Db,
): Promise<typeof listingPricingProfile.$inferSelect> { ... }

// NOT: new PricingService(db)
// NOT: const db = createDb() at module scope
```

### Pattern 2: Plain Error, not ORPCError
Domain packages throw `new Error("CODE: detail")`. ORPCError is a transport-layer concern. The legacy files use ORPCError — remove them during porting.

```typescript
// Legacy (remove in port):
throw new ORPCError("BAD_REQUEST", { message: "Boat is already booked" });

// Port to:
throw new Error("OVERLAP_DETECTED: listing is already booked for this slot");
```

### Pattern 3: Barrel export via src/index.ts
Every package exports all public symbols from `src/index.ts` using `export * from "./module"` or explicit named exports.

### Pattern 4: Adapter Registry (for packages/calendar)
Registry is a Map singleton with `registerCalendarAdapter(provider, adapter)` and `getCalendarAdapter(provider)` functions. `getCalendarAdapter` throws (does not return null) if provider not registered:

```typescript
// Our pattern (from packages/payment and packages/events precedents)
export function getCalendarAdapter(provider: string): CalendarAdapter {
  const adapter = registry.get(provider);
  if (!adapter) throw new Error(`NO_CALENDAR_ADAPTER: ${provider}`);
  return adapter;
}
```

> Note: Legacy registry returns `null` on miss — our pattern throws. Align with project convention (see packages/payment adapter pattern).

### Pattern 5: registerEventPusher for outbound calendar sync
BookingLifecycleSync (07-03) is an OUTBOUND event pusher — it reacts to booking domain events and writes to the external calendar. This is NOT a port of the legacy `booking-lifecycle-sync.ts` (which handles inbound calendar → booking direction).

```typescript
// packages/calendar/src/booking-lifecycle-sync.ts
import { registerEventPusher } from "@my-app/events";
import { getCalendarAdapter } from "./adapter-registry";

export function registerBookingLifecycleSync(db: Db): void {
  registerEventPusher("booking:confirmed", async (event) => {
    // look up listingCalendarConnection for event.data.bookingId
    // call adapter.upsertEvent or createEvent
  });
  registerEventPusher("booking:cancelled", async (event) => {
    // call adapter.deleteEvent
  });
}
```

### Pattern 6: WebCrypto JWT for Google OAuth (no googleapis SDK)
The legacy `GoogleCalendarAdapter` implements OAuth 2.0 service-account flow using `crypto.subtle.sign("RSASSA-PKCS1-v1_5", ...)`. Bun exposes `crypto.subtle` globally. No `googleapis`, `google-auth-library`, or `jose` needed.

```typescript
// From legacy/packages/api/src/calendar/adapters/google-calendar-adapter.ts
private async createSignedJwt(scope: string) {
  const payload = { iss: credentials.client_email, scope, aud: tokenUri, iat, exp };
  const unsignedJwt = `${base64UrlEncodeJson(header)}.${base64UrlEncodeJson(payload)}`;
  const privateKey = await crypto.subtle.importKey("pkcs8", ...);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, encode(unsignedJwt));
  return `${unsignedJwt}.${base64UrlEncodeBytes(signature)}`;
}
```

Access tokens are cached per scope in a `Map<string, { accessToken; expiresAt }>`. Tokens expire in 1 hour; cache evicts 30s before expiry.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Service-account JWT for Google APIs | Custom JWT lib | `crypto.subtle` (built-in WebCrypto) | Already implemented in legacy — port directly |
| Booking overlap detection SQL | Custom interval logic | `lt(booking.startsAt, endsAt) AND gt(booking.endsAt, startsAt)` | Standard Drizzle `and(lt, gt)` pattern — already in legacy overlap.ts |
| Calendar adapter selection | switch/if chain | `Map<provider, CalendarAdapter>` registry | Already in legacy registry.ts, idiomatic with events package pattern |
| Multi-step cancellation / dispute | Inline try/catch rollback | `createWorkflow` + `createStep` from `@my-app/workflows` | Rollback-safe, already in workspace |
| Cancellation policy math | Custom calculator | Port templates + policy.service.ts logic | Legacy has Zod-validated configurable policies with org-level overrides |

---

## Common Pitfalls

### Pitfall 1: Duplicating `assertSlotAvailable` from packages/availability
**What goes wrong:** Plan 07-01 adds `assertNoOverlap` to packages/booking. `packages/availability` already exports `assertSlotAvailable` (checks blocks + bookings). Executor might think they're the same.

**Distinction:** 
- `assertSlotAvailable` (availability package) — integrated check (rules + blocks + bookings, any status except cancelled)
- `assertNoOverlap` (booking package) — booking-only overlap check with `excludedBookingId` param (for shift use case — excludes the booking being shifted)
- `detectOverlap` (booking package) — pure boolean, no DB, for `BusyInterval[]` arrays in slot computation

**How to avoid:** `assertNoOverlap` must accept `excludedBookingId?: string` and use `ne(booking.id, excludedBookingId)` when present.

### Pitfall 2: Stale vitest version in plan 07-02
**What goes wrong:** Plan 07-02 lists `"vitest": "^3.0.9"` in the package.json example — workspace uses `^4.0.18`.

**How to avoid:** Use `^4.0.18` for both packages/calendar and packages/disputes.

### Pitfall 3: Wrong CalendarAdapter method names
**What goes wrong:** Plan 07-02/03 spec says `createEvent`, `updateEvent`, `deleteEvent`, `listBusySlots`. Legacy types use `upsertEvent` (create+update combined), `deleteEvent`, `listBusyIntervals`.

**Recommendation:** Use the legacy naming (`upsertEvent`, `listBusyIntervals`) since that's what GoogleCalendarAdapter already implements. The plan's simplified API can be layered on top if needed for CalendarUseCases, but the adapter interface should match the adapter's capabilities.

- `upsertEvent(input: CalendarEventInput): Promise<CalendarEventResult>` — creates if no `externalEventId`, patches if present
- `deleteEvent({ externalCalendarId, externalEventId }): Promise<void>`
- `listBusyIntervals(query: CalendarBusyQuery): Promise<CalendarBusyInterval[]>`
- Optional: `listEvents?`, `startWatch?`, `stopWatch?`, `parseWebhookNotification?`

### Pitfall 4: Reading env vars inside GoogleCalendarAdapter methods
**What goes wrong:** Legacy configure.ts uses `process.env` to inject credentials. The plan correctly says "no process.env reads inside methods" but executor might miss this.

**How to avoid:** Credentials are constructor-injected only. `apps/server/src/index.ts` reads env and passes to constructor: `new GoogleCalendarAdapter({ credentials: JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY ?? "{}") })`.

### Pitfall 5: `packages/booking` already has `cancellationReasonCatalog` and `CancellationReasonCode`
**What goes wrong:** Plan 07-04 creates `packages/disputes` with `policy-templates.ts`. If executor re-defines the reason codes, there will be type conflicts when disputes imports from booking.

**How to avoid:** `packages/disputes` should import `CancellationReasonCode` and `cancellationReasonCatalog` from `@my-app/booking`. Do NOT redefine them in disputes. The policy templates in packages/disputes define the *refund calculation parameters* (time windows, percentages), not the reason codes themselves.

### Pitfall 6: `ORPCError` in legacy source
**What goes wrong:** All legacy files use `ORPCError` from `@orpc/server`. This import will fail in domain packages.

**How to avoid:** Replace every `throw new ORPCError("BAD_REQUEST", { message })` with `throw new Error("CODE: " + message)` during the port.

### Pitfall 7: `db` module-level import in legacy
**What goes wrong:** Every legacy file does `import { db } from "@full-stack-cf-app/db"` at module scope.

**How to avoid:** Remove all module-level db imports. Add `db: Db` parameter to each function.

---

## Code Examples

### Booking overlap detection (port directly from legacy/services/overlap.ts)
```typescript
// packages/booking/src/overlap.ts
import { and, eq, gt, inArray, lt, ne } from "drizzle-orm";
import { booking } from "@my-app/db/schema/marketplace";
import type { Db } from "./types";

const BLOCKING_STATUSES = ["pending", "awaiting_payment", "confirmed", "in_progress", "disputed"] as const;

// Pure boolean — no DB (for slot computation)
export function detectOverlap(
  a: { startsAt: Date; endsAt: Date },
  b: { startsAt: Date; endsAt: Date },
): boolean {
  return a.startsAt < b.endsAt && a.endsAt > b.startsAt;
}

// DB-backed: used in createBooking and shift flows
export async function assertNoOverlap(params: {
  listingId: string;
  startsAt: Date;
  endsAt: Date;
  excludedBookingId?: string;
}, db: Db): Promise<void> {
  const conditions = [
    eq(booking.listingId, params.listingId),
    inArray(booking.status, [...BLOCKING_STATUSES]),
    lt(booking.startsAt, params.endsAt),
    gt(booking.endsAt, params.startsAt),
  ];
  if (params.excludedBookingId) {
    conditions.push(ne(booking.id, params.excludedBookingId));
  }
  const [hit] = await db.select({ id: booking.id }).from(booking).where(and(...conditions)).limit(1);
  if (hit) throw new Error("OVERLAP_DETECTED: listing is already booked for this slot");
}
```

### Action policy (port from legacy/services/action-policy.ts)
```typescript
// packages/booking/src/action-policy.ts — key types
export type BookingActionPolicyActor = "customer" | "owner" | "manager" | "system";
export type BookingActionPolicyAction = "cancellation" | "shift";

export interface BookingActionWindowPolicyProfile {
  cancellation: { customerLatestHoursBeforeStart: number; managerLatestHoursBeforeStart: number; ownerLatestHoursBeforeStart: number; systemLatestHoursBeforeStart: number };
  shift: { ... };
}

// evaluateBookingActionWindow: checks if action is within time window, throws if not
export function evaluateBookingActionWindow(params: {
  action: BookingActionPolicyAction;
  actor: BookingActionPolicyActor;
  bookingStartsAt: Date;
  policyProfile: BookingActionWindowPolicyProfile;
  now?: Date;
}): void { ... }
```

### Pricing profile resolution (port from legacy/services/pricing-profile.ts)
```typescript
// packages/pricing/src/pricing-profile.ts
import { listingPricingProfile } from "@my-app/db/schema/marketplace";
import { and, desc, eq, gt, isNull, lte, or } from "drizzle-orm";

export async function resolveActivePricingProfile(
  params: { listingId: string; startsAt: Date },
  db: Db,
) {
  const [profile] = await db.select()
    .from(listingPricingProfile)
    .where(and(
      eq(listingPricingProfile.listingId, params.listingId),
      isNull(listingPricingProfile.archivedAt),
      lte(listingPricingProfile.validFrom, params.startsAt),
      or(isNull(listingPricingProfile.validTo), gt(listingPricingProfile.validTo, params.startsAt)),
    ))
    .orderBy(desc(listingPricingProfile.isDefault), desc(listingPricingProfile.validFrom))
    .limit(1);

  if (!profile) throw new Error("NO_ACTIVE_PRICING_PROFILE: listing has no active pricing profile");
  return profile;
}
```

Note: Legacy uses `boatPricingProfile` with `boatId`. Our schema uses `listingPricingProfile` with `listingId`. Query logic is identical.

### Google Calendar adapter constructor (key DI pattern)
```typescript
// packages/calendar/src/google-adapter.ts
interface GoogleServiceAccountCredentials {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export class GoogleCalendarAdapter implements CalendarAdapter {
  readonly provider = "google" as const;
  private readonly credentials: GoogleServiceAccountCredentials;
  private readonly accessTokenCache = new Map<string, { accessToken: string; expiresAt: number }>();
  
  constructor(options: { credentials: GoogleServiceAccountCredentials; fetchImpl?: typeof fetch }) {
    if (!options.credentials.client_email || !options.credentials.private_key) {
      throw new Error("GoogleCalendarAdapter: client_email and private_key are required");
    }
    this.credentials = options.credentials;
  }
  // ... upsertEvent, deleteEvent, listBusyIntervals via raw fetch + WebCrypto JWT
}
```

### DomainEventMap — all needed events already exist
```typescript
// packages/events/src/types.ts (already present, no changes needed)
"booking:confirmed": { bookingId: string; ownerId: string };
"booking:cancelled": { bookingId: string; reason: string; refundAmountKopeks: number };
"booking:contact-updated": { bookingId: string; contactDetails: Record<string, unknown> };
"calendar:sync-requested": { bookingId: string; calendarId: string };
"dispute:opened": { disputeId: string; bookingId: string };
"dispute:resolved": { disputeId: string; resolution: string };
```

---

## Source Map: Legacy → New Package

| New file | Legacy source | Line count | Key rename |
|---|---|---|---|
| `packages/booking/src/action-policy.ts` | `legacy/.../services/action-policy.ts` | 160L | `boatId`→listingId, ORPCError→Error, remove db module import |
| `packages/booking/src/overlap.ts` | `legacy/.../services/overlap.ts` | 80L | `boatId`→listingId, ORPCError→Error, remove db module import; add pure `detectOverlap` |
| `packages/booking/src/slots.ts` | `legacy/.../services/slots.ts` | 502L | Port only pure computation (slot gap logic); strip pricing calls |
| `packages/pricing/src/pricing-profile.ts` | `legacy/.../services/pricing-profile.ts` | 30L | `boatId`→listingId, `boatPricingProfile`→listingPricingProfile |
| `packages/calendar/src/types.ts` | `legacy/.../calendar/adapters/types.ts` | 125L | Keep rich interface with `upsertEvent`, `listBusyIntervals` |
| `packages/calendar/src/adapter-registry.ts` | `legacy/.../calendar/adapters/registry.ts` | 36L | Throw on miss instead of returning null |
| `packages/calendar/src/fake-adapter.ts` | `legacy/.../calendar/adapters/fake-calendar-adapter.ts` | 90L | Minimal changes |
| `packages/calendar/src/google-adapter.ts` | `legacy/.../calendar/adapters/google-calendar-adapter.ts` | 722L | Remove process.env, constructor-inject credentials |
| `packages/calendar/src/use-cases.ts` | `legacy/.../calendar/application/calendar-use-cases.ts` | 279L | Strip webhook/watch/sync ops; keep connect, disconnect, listEvents |
| `packages/calendar/src/booking-lifecycle-sync.ts` | NEW (outbound pusher pattern) | ~80L | NOT a port of `legacy/sync/booking-lifecycle-sync.ts` — that's inbound |
| `packages/disputes/src/cancellation-policy-service.ts` | `legacy/.../booking/cancellation/policy.service.ts` | 519L | Remove ORPCError, remove db module import, use `@my-app/booking` for reason codes |
| `packages/disputes/src/policy-templates.ts` | `legacy/.../booking/cancellation/policy.templates.ts` | 141L | Import CancellationReasonCode from `@my-app/booking`, don't redefine |
| `packages/disputes/src/cancellation-workflow.ts` | `legacy/.../routers/booking/cancellation/router.ts` (workflow logic) | ~120L | Use `createWorkflow` + `createStep` from `@my-app/workflows` |
| `packages/disputes/src/dispute-workflow.ts` | `legacy/.../routers/booking/dispute.ts` (workflow logic) | ~100L | Use `createWorkflow` + `createStep` from `@my-app/workflows` |

---

## Open Questions

1. **CalendarAdapter interface: simplified vs rich**
   - Plan 07-02 specifies `createEvent`, `updateEvent`, `deleteEvent`, `listBusySlots`
   - Legacy has `upsertEvent` (create+update in one), `deleteEvent`, `listBusyIntervals` (no separate create/update)
   - **Recommendation:** Use legacy naming (`upsertEvent`, `listBusyIntervals`) — GoogleCalendarAdapter already implements this. The Book plan's interface spec appears to be a simplification. Executor should use `upsertEvent` to avoid reimplementing the Google PATCH vs POST logic in the adapter.

2. **Slots.ts scope**
   - Legacy `slots.ts` is 502 lines and includes pricing-annotated slots, working-hours computation, local-timezone conversion, and minimum-duration filtering
   - The plan only requires `calculateAvailableSlots`, `findFreeGaps`, `BusyInterval`, `FreeGap`, `TimeSlot`
   - **Recommendation:** Port only the pure gap computation logic. Exclude the `AnnotatedTimeSlot`, `SlotWithPricing`, `BoatDayConfig` complexity unless needed by EXTR-01.

3. **bookingCalendarLink lookup in BookingLifecycleSync**
   - When `booking:confirmed` fires, we need to look up the `listingCalendarConnection` for the listing associated with the booking to know which calendar to write to
   - The DB schema has `bookingCalendarLink` table with `bookingId` and `calendarConnectionId`
   - Executor should: (a) look up booking → listingId, (b) query listingCalendarConnection for the listing, (c) call adapter.upsertEvent, (d) insert bookingCalendarLink row

---

## Sources

### Primary (HIGH confidence — verified against live codebase)
- `legacy/full-stack-cf-app/packages/api/src/routers/booking/services/action-policy.ts` — action policy source
- `legacy/full-stack-cf-app/packages/api/src/routers/booking/services/overlap.ts` — overlap detection source
- `legacy/full-stack-cf-app/packages/api/src/routers/booking/services/pricing-profile.ts` — pricing profile resolution source
- `legacy/full-stack-cf-app/packages/api/src/routers/booking/services/slots.ts` — slot computation source (502L)
- `legacy/full-stack-cf-app/packages/api/src/calendar/adapters/types.ts` — CalendarAdapter interface (125L)
- `legacy/full-stack-cf-app/packages/api/src/calendar/adapters/registry.ts` — adapter registry (36L)
- `legacy/full-stack-cf-app/packages/api/src/calendar/adapters/fake-calendar-adapter.ts` — FakeCalendarAdapter (90L)
- `legacy/full-stack-cf-app/packages/api/src/calendar/adapters/google-calendar-adapter.ts` — GoogleCalendarAdapter (722L)
- `legacy/full-stack-cf-app/packages/api/src/calendar/application/calendar-use-cases.ts` — CalendarUseCases (279L)
- `legacy/full-stack-cf-app/packages/api/src/routers/booking/cancellation/policy.service.ts` — CancellationPolicyService (519L)
- `legacy/full-stack-cf-app/packages/api/src/routers/booking/cancellation/policy.templates.ts` — policy templates (141L)
- `legacy/full-stack-cf-app/packages/api/src/routers/booking/dispute.ts` — dispute router (168L)
- `packages/events/src/types.ts` — DomainEventMap (current)
- `packages/db/src/schema/marketplace.ts` — listingPricingProfile, listingPricingRule, bookingDispute tables
- `packages/db/src/schema/availability.ts` — listingCalendarConnection, bookingCalendarLink tables
- `packages/availability/src/availability-service.ts` — assertSlotAvailable (existing, not to be duplicated)
- `packages/booking/src/cancellation-reasons.ts` — CancellationReasonCode (existing, to be imported by disputes package)

## Metadata

**Confidence breakdown:**
- Source file identification: HIGH — files read and verified
- Port patterns (ORPCError removal, db injection): HIGH — consistent with phases 1-6 precedents
- Google Calendar auth (WebCrypto JWT): HIGH — read full 722L adapter implementation
- DomainEventMap completeness: HIGH — all events confirmed present
- CalendarAdapter interface discrepancy: HIGH — identified from direct comparison of plan spec vs legacy types

**Research date:** 2026-03-10
**Valid until:** Stable extraction — no time-sensitive APIs. Valid until legacy code changes.
