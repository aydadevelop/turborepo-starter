# oRPC Domain Extraction Schema (Boats + Bookings)

This document maps the **current structure** to the **target structure**:

```text
/packages
 ├─ orpc-contract/
 │   ├─ index.ts
 │   ├─ boats.ts
 │   └─ bookings.ts
 ├─ domain/
 │   ├─ boats/
 │   │   └─ index.ts
 │   └─ bookings/
 │       └─ index.ts
 └─ orpc-server/
     ├─ context.ts
     ├─ boats.ts
     └─ bookings.ts
```

## 1) Current -> Target Mapping

### `orpc-server/context.ts`
- Source: `packages/api/src/context.ts`
- Purpose: auth session resolution, active org membership, request metadata, notification queue wiring.

### `orpc-server/boats.ts` (server RPC wrappers)
- Primary wrapper sources:
  - `packages/api/src/routers/boat/router.ts`
  - `packages/api/src/routers/boat/self.ts`
  - `packages/api/src/routers/boat/dock.ts`
  - `packages/api/src/routers/boat/amenity.ts`
  - `packages/api/src/routers/boat/asset.ts`
  - `packages/api/src/routers/boat/calendar.ts`
  - `packages/api/src/routers/boat/availability.ts`
  - `packages/api/src/routers/boat/pricing.ts`
  - `packages/api/src/routers/boat/min-duration.ts`
- Shared access checks currently used by wrappers:
  - `packages/api/src/routers/boat/access.ts`

### `orpc-server/bookings.ts` (server RPC wrappers)
- Primary wrapper sources:
  - `packages/api/src/routers/booking/index.ts`
  - `packages/api/src/routers/booking/core.ts`
  - `packages/api/src/routers/booking/storefront.ts`
  - `packages/api/src/routers/booking/cancellation/router.ts`
  - `packages/api/src/routers/booking/affiliate.ts`
  - `packages/api/src/routers/booking/dispute.ts`
  - `packages/api/src/routers/booking/refund.ts`
  - `packages/api/src/routers/booking/shift.ts`
  - `packages/api/src/routers/booking/payments.ts`
  - `packages/api/src/routers/booking/discount/router.ts`
- Shared booking helpers currently used by wrappers:
  - `packages/api/src/routers/booking/helpers.ts`

### `orpc-contract/boats.ts`
- Source candidates (inputs/outputs/types):
  - `packages/api/src/routers/boat/schemas.ts`
  - Route metadata pieces currently embedded in `packages/api/src/routers/boat/*.ts` (`summary`, `description`, tags).

### `orpc-contract/bookings.ts`
- Source candidates (inputs/outputs/types):
  - `packages/api/src/routers/booking.schemas.ts`
  - `packages/api/src/routers/booking/cancellation/request-payload.ts`
  - Route metadata pieces currently embedded in `packages/api/src/routers/booking/*.ts`.

### `orpc-contract/index.ts`
- Composition source:
  - `packages/api/src/routers/index.ts` (boat + booking branches only for this split).

### `domain/boats/index.ts`
- Domain logic to extract from current wrappers:
  - DB operations in `packages/api/src/routers/boat/*.ts`
  - Access/auth checks from `packages/api/src/routers/boat/access.ts`

### `domain/bookings/index.ts`
- Domain logic to extract from current wrappers:
  - Business logic from `packages/api/src/routers/booking/core.ts`
  - Public booking logic from `packages/api/src/routers/booking/storefront.ts`
  - Subdomain flows from:
    - `packages/api/src/routers/booking/cancellation/*`
    - `packages/api/src/routers/booking/affiliate.ts`
    - `packages/api/src/routers/booking/dispute.ts`
    - `packages/api/src/routers/booking/refund.ts`
    - `packages/api/src/routers/booking/shift.ts`
    - `packages/api/src/routers/booking/payments.ts`
    - `packages/api/src/routers/booking/discount/*`
  - Shared services:
    - `packages/api/src/routers/booking/services/*`

## 2) Current Composition Points (for Reference)

- Procedure/middleware layer (auth + org permission): `packages/api/src/index.ts`
- App router composition: `packages/api/src/routers/index.ts`
- Runtime RPC handler: `apps/server/src/rpc/handlers.ts`

## 3) Practical Extraction Rule

Use this split rule consistently:
- `orpc-contract/*`: only contract shapes (input/output/type + endpoint signatures).
- `domain/*`: pure business logic (DB, pricing, policy, booking state transitions).
- `orpc-server/*`: procedure wiring (`publicProcedure`/`protectedProcedure`/`organizationPermissionProcedure`) + calls into `domain/*`.

