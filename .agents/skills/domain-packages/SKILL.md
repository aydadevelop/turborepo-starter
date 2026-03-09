---
name: domain-packages
description: >
  Create a new domain package (booking, pricing, catalog, calendar, payments, disputes,
  messaging) following the contract-first, event-driven, provider-based architecture.
  Use when: scaffolding a new domain package, adding a new oRPC contract tree, wiring
  a domain package into packages/api as thin oRPC handlers, or creating a Drizzle
  repository inside a domain package.
  Trigger terms: new package, create domain, packages/booking, packages/pricing,
  packages/catalog, domain service, repository layer, oRPC handler, thin wiring.
---

# Domain Packages

Each domain package is a self-contained unit of business logic with clean boundaries.
This skill covers: creating the package scaffold, defining the Drizzle repository,
the domain service, adding oRPC contracts, and wiring thin handlers in `packages/api`.

> **Status:** Several examples below reference target-state packages such as `@my-app/events`
> and `@my-app/workflows`. These are architecture targets from `docs/ADR/002_architecture-patterns.md`
> and may not exist yet in the current workspace.

## Layering pattern

In this repo the architectural flow is:

`packages/api-contract` → `packages/api` handler → domain package service/workflow → repository

Each layer has one job:

- **Contract** — Zod input/output schemas and route metadata.
- **Handler** — Build request context, call a domain service or workflow, return the typed result.
- **Workflow / service** — Apply business rules, orchestrate steps, emit domain events.
- **Repository** — Execute Drizzle queries only.

This is the repo-native translation of Medusa's “module → workflow → route” pattern.
We keep the same separation of concerns, but the concrete layers are oRPC contracts and handlers,
not Medusa HTTP routes and modules.

### What stays out of each layer

- **Contracts** do not import domain services.
- **Handlers** do not contain business rules or manual rollback logic.
- **Workflows/services** do not perform role checks inline.
- **Repositories** do not emit events or call external providers.

## Checklist

Use manage_todo_list to track these steps:

- Scaffold the package directory + `package.json` + `tsconfig.json`
- Define the Drizzle repository (queries only — no business logic)
- Write domain service functions (state transitions + event emission)
- Add any required workflow steps (`packages/workflows`)
- Add Zod contracts to `packages/api-contract`
- Wire thin oRPC handlers in `packages/api` (≤10 lines each)
- Register event pusher at package startup (if this package has event-driven side effects)
- Write unit tests co-located with the package code

## Package naming

| Pattern | Example |
|---|---|
| `packages/<domain>/` | `packages/booking/` |
| Package name in `package.json` | `@my-app/booking` |
| TypeScript path alias | `@my-app/booking/*` |

## Directory structure

```
packages/booking/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── repository.ts         # Drizzle queries only — no business logic
    ├── service.ts            # Core domain logic: state transitions + ctx.eventBus.emit(...)
    ├── workflows/
    │   ├── create-booking.ts # createBookingWorkflow
    │   └── steps/
    │       ├── reserve-availability.ts
    │       └── persist-booking.ts
    ├── __tests__/
    │   ├── service.test.ts
    │   └── create-booking.test.ts
    └── index.ts              # Public API surface — export only what callers need
```

## package.json template

```json
{
  "name": "@my-app/booking",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsdown",
    "check-types": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@my-app/db": "workspace:*",
    "@my-app/events": "workspace:*",
    "@my-app/workflows": "workspace:*",
    "@my-app/pricing": "workspace:*"
  },
  "devDependencies": {
    "@my-app/vitest-config": "workspace:*"
  }
}
```

## tsconfig.json template

```json
{
  "extends": "@my-app/config/tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist"
  },
  "include": ["src"]
}
```

## Repository layer

The repository contains **only** Drizzle queries. No business logic, no events, no validation:

```typescript
// packages/booking/src/repository.ts
import { db } from "@my-app/db"
import { bookings } from "@my-app/db/schema/marketplace"
import { eq } from "drizzle-orm"

export const bookingRepository = {
  findById: (id: string) =>
    db.query.bookings.findFirst({ where: eq(bookings.id, id) }),

  findByOrganization: (organizationId: string) =>
    db.select().from(bookings).where(eq(bookings.organizationId, organizationId)),

  create: (values: typeof bookings.$inferInsert) =>
    db.insert(bookings).values(values).returning(),

  updateStatus: (id: string, status: string) =>
    db.update(bookings).set({ status }).where(eq(bookings.id, id)),
}
```

## Domain service layer

Services contain state transitions and emit domain events. They do NOT:
- Query the DB directly — they call the repository
- Perform role checks — the oRPC middleware pre-authorizes
- Import from `packages/api` or `apps/server`

```typescript
// packages/booking/src/service.ts
import type { WorkflowContext } from "@my-app/workflows"
import { bookingRepository } from "./repository"

export async function confirmBooking(
  bookingId: string,
  ctx: WorkflowContext
): Promise<void> {
  const booking = await bookingRepository.findById(bookingId)
  if (!booking) throw new Error(`Booking ${bookingId} not found`)
  if (booking.status !== "pending") throw new Error(`Cannot confirm booking in status: ${booking.status}`)

  await bookingRepository.updateStatus(bookingId, "confirmed")

  // Emit — calendar sync and notifications fire via registered pushers
  await ctx.eventBus.emit({
    type: "booking:confirmed",
    data: { bookingId, ownerId: booking.ownerId },
  })
}
```

## oRPC contracts (`packages/api-contract`)

Add a new contract file and register it in the router:

```typescript
// packages/api-contract/src/routers/booking.ts
import { oc } from "@orpc/contract"
import z from "zod"

const bookingOutputSchema = z.object({
  id: z.string(),
  status: z.string(),
  listingId: z.string(),
  customerId: z.string(),
  startDate: z.string(),
  endDate: z.string(),
})

export const bookingContract = {
  create: oc
    .route({ tags: ["Booking"], summary: "Create booking" })
    .input(z.object({
      listingId: z.string(),
      startDate: z.string(),
      endDate: z.string(),
      idempotencyKey: z.string().optional(),
    }))
    .output(bookingOutputSchema),

  confirm: oc
    .route({ tags: ["Booking"], summary: "Confirm booking" })
    .input(z.object({ bookingId: z.string() }))
    .output(z.object({ success: z.boolean() })),

  cancel: oc
    .route({ tags: ["Booking"], summary: "Cancel booking" })
    .input(z.object({ bookingId: z.string(), reason: z.string() }))
    .output(z.object({ success: z.boolean() })),
}
```

```typescript
// packages/api-contract/src/routers/index.ts — add to appContract:
import { bookingContract } from "./booking"

export const appContract = {
  // ... existing contracts
  booking: bookingContract,
}
```

## Thin oRPC handlers (`packages/api`)

Handlers must be ≤10 lines. All business logic lives in the domain package:

```typescript
// packages/api/src/handlers/booking.ts
import { createBookingWorkflow } from "@my-app/booking"
import { confirmBooking } from "@my-app/booking"
import { organizationProcedure } from "../index"
import { EventBus } from "@my-app/events"

const makeCtx = (context: OrganizationContext) => ({
  organizationId: context.activeMembership.organizationId,
  actorUserId: context.session?.user?.id,
  idempotencyKey: crypto.randomUUID(),
  eventBus: new EventBus(),
})

export const bookingRouter = {
  create: organizationProcedure.booking.create.handler(async ({ input, context }) => {
    const result = await createBookingWorkflow.execute(input, makeCtx(context))
    if (!result.success) throw result.error
    return result.output
  }),

  confirm: organizationProcedure.booking.confirm.handler(async ({ input, context }) => {
    await confirmBooking(input.bookingId, makeCtx(context))
    return { success: true }
  }),
}
```

**Rule:** The handler is a transport adapter, not a business layer. If you see branching business rules,
manual rollback, direct SDK calls, or raw Drizzle queries in the handler, the logic belongs lower in the stack.

## Wire the handler into the server

```typescript
// packages/api/src/handlers/index.ts — add bookingRouter
import { bookingRouter } from "./booking"

export const appRouter = {
  // ... existing routers
  booking: bookingRouter,
}
```

## Register event pushers at startup

If this domain package subscribes to events (e.g., calendar syncing on `booking:confirmed`), register the pusher in the package's `index.ts`:

```typescript
// packages/calendar/src/index.ts
import { registerEventPusher } from "@my-app/events"

// This runs once at application startup when packages/calendar is imported
registerEventPusher(async (event) => {
  if (event.type === "booking:confirmed") await syncCalendar(event.data.bookingId)
  if (event.type === "booking:cancelled") await deleteCalendarEvent(event.data.bookingId)
})

export { ... } // other public exports
```

## Dependency rules (enforced by TypeScript boundaries)

```
packages/<domain> MAY import:
  @my-app/db           (schema + Drizzle client)
  @my-app/events       (emit events)
  @my-app/workflows    (WorkflowContext type + createStep)
  @my-app/pricing      (booking may call pricing engine)

packages/<domain> MUST NOT import:
  @my-app/api          (creates circular dep)
  @my-app/api-contract (contracts are consumed by api, not domain)
  apps/server or apps/web
  Any other domain package EXCEPT documented cross-domain deps
    (disputes → booking for cancel step is an allowed one-way dep, documented in ADR-001)
```

## Hard rules

- ❌ Never put a role check inside a domain service — the oRPC middleware chain handles auth.
- ❌ Never call external service SDKs directly inside a service — always go through a Provider interface.
- ❌ Never put business logic or compensation logic in a handler — handlers adapt transport only.
- ❌ Never create a "shared" or "utils" sub-directory inside a domain package — if a utility is needed elsewhere, it belongs in the package that owns the concept.
- ✅ Co-locate unit tests with package code in `src/__tests__/`.
- ✅ Export only the public surface from `index.ts`; keep internals private.
- ✅ Each repository function is a single Drizzle query. No joins spanning domain boundaries.
