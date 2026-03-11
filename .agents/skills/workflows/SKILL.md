---
name: workflows
description: >
  Create multi-step workflows with automatic compensation (rollback) using packages/workflows.
  Use when: implementing a booking flow, payment + calendar create + notification as a single
  atomic-ish operation, any operation that needs rollback on failure, or when decomposing a
  monolithic service method into discrete steps. Do NOT use for simple single-step CRUD.
  Trigger terms: createWorkflow, createStep, compensate, WorkflowContext, idempotency key,
  workflow step, rollback, saga, booking workflow, cancel booking workflow.
---

# Workflows (`packages/workflows`)

> **Status:** `packages/workflows` is live and is the repo's workflow engine.
> Current examples include the booking cancellation workflow under `packages/booking/src/cancellation/`.
> Use this skill for new multi-step orchestration and compensation boundaries, not for simple CRUD.

## Repo-native orchestration model

We adopt the **idea** of Medusa workflows, but not Medusa's workflow DSL.

In this repo:

- `createWorkflow` is an **imperative async orchestrator**.
- Using `async` / `await` inside the workflow body is **correct**.
- We do **not** assume Medusa-specific primitives like `when()`, `transform()`, `WorkflowResponse`, `StepResponse`, or hooks.
- Compensation is handled by our own `createStep` / `createWorkflow` implementation.

Think of this package as a small saga engine for our stack — Drizzle + oRPC + pg-boss — not a clone of Medusa's orchestration runtime.

## When to use a workflow vs. a plain service call

| Situation | Use |
|---|---|
| Single DB write | Plain service function |
| Two or more external side effects (charge + calendar + notify) | `createWorkflow` |
| Needs idempotency key (safe to retry) | `createWorkflow` |
| Must roll back on partial failure | `createWorkflow` with `compensate` |

## Package structure

```
packages/workflows/src/
├── types.ts           # WorkflowContext and internal execution types
├── create-step.ts     # createStep helper
├── create-workflow.ts # createWorkflow engine with compensation
└── index.ts           # Public exports
```

## WorkflowContext

Every step and workflow receives a `WorkflowContext`. Domain services must accept it as a parameter — never construct it inline:

```typescript
// packages/workflows/src/types.ts
export interface WorkflowContext {
  organizationId: string
  actorUserId?: string
  idempotencyKey: string
  eventBus: EventBus   // from @my-app/events — injected at call site
}
```

The context is constructed at the oRPC handler boundary and passed down:

```typescript
// packages/api/src/handlers/booking.ts (thin oRPC wiring — ≤10 lines)
create: organizationProcedure.booking.create.handler(async ({ input, context }) => {
  return await createBookingWorkflow.execute(input, {
    organizationId: context.activeMembership.organizationId,
    actorUserId: context.session?.user?.id,
    idempotencyKey: input.idempotencyKey ?? crypto.randomUUID(),
    eventBus: new EventBus(),
  })
})
```

## Creating a step

One mutation per step. Each step optionally declares a `compensate` function for rollback:

```typescript
// packages/booking/src/workflows/steps/reserve-availability.ts
import { createStep } from "@my-app/workflows"

type Input = { listingId: string; startDate: string; endDate: string }
type Output = { reservationId: string }

export const reserveAvailabilityStep = createStep<Input, Output>(
  "reserve-availability",
  async (input, ctx) => {
    const reservation = await createAvailabilityBlock({
      listingId: input.listingId,
      startDate: input.startDate,
      endDate: input.endDate,
      idempotencyKey: `${ctx.idempotencyKey}:reserve`,
    })
    return { reservationId: reservation.id }
  },
  // compensate: called on workflow failure AFTER this step completed
  async (output, ctx) => {
    await deleteAvailabilityBlock(output.reservationId)
  }
)
```

```typescript
// packages/booking/src/workflows/steps/charge-payment.ts
import { createStep } from "@my-app/workflows"

export const chargePaymentStep = createStep<
  { amountKopeks: number; paymentToken: string },
  { paymentId: string; amountKopeks: number }
>(
  "charge-payment",
  async (input, ctx) => {
    const result = await paymentRegistry
      .getProvider("cloudpayments")
      .charge({ amountKopeks: input.amountKopeks, token: input.paymentToken })
    return { paymentId: result.paymentId, amountKopeks: input.amountKopeks }
  },
  async (output, ctx) => {
    // Refund the charge on rollback
    await paymentRegistry.getProvider("cloudpayments").refund(output.paymentId, output.amountKopeks)
  }
)
```

## Creating a workflow

Compose steps into a workflow. The engine runs steps in sequence, tracking each output.
On failure it iterates completed steps in **reverse order** calling `compensate`:

```typescript
// packages/booking/src/workflows/create-booking.ts
import { createWorkflow } from "@my-app/workflows"
import { reserveAvailabilityStep } from "./steps/reserve-availability"
import { chargePaymentStep } from "./steps/charge-payment"
import { persistBookingStep } from "./steps/persist-booking"

type Input = {
  listingId: string
  startDate: string
  endDate: string
  amountKopeks: number
  paymentToken: string
  customerId: string
}

type Output = { bookingId: string; paymentId: string }

export const createBookingWorkflow = createWorkflow<Input, Output>(
  "create-booking",
  async (input, ctx) => {
    // Steps run sequentially; engine tracks outputs for compensation
    const { reservationId } = await reserveAvailabilityStep(input, ctx)
    const { paymentId }     = await chargePaymentStep(input, ctx)
    const { bookingId }     = await persistBookingStep({ ...input, reservationId, paymentId }, ctx)

    // Emit domain event — subscribers handle calendar sync & notifications
    await ctx.eventBus.emit({ type: "booking:created", data: { bookingId, listingId: input.listingId, customerId: input.customerId } })

    return { bookingId, paymentId }
  }
)
```

## Orchestration boundaries

A workflow coordinates steps; it does not become a dumping ground for every line of business logic.

- A **handler** builds `WorkflowContext` and calls `.execute(...)`.
- A **workflow** coordinates multi-step state changes and compensation.
- A **step** performs one mutation or one external side effect.
- A **repository** performs the Drizzle query used by the step or service.

If the operation is a single DB write with no rollback story, prefer a plain domain service instead of a workflow.

## The createWorkflow engine (implementation reference)

```typescript
// packages/workflows/src/create-workflow.ts
type CompletedStep = {
  name: string
  output: unknown
  compensate?: (output: unknown, ctx: WorkflowContext) => Promise<void>
}

type InternalWorkflowContext = WorkflowContext & {
  /** Internal execution log used by createStep/createWorkflow. */
  __completed: CompletedStep[]
}

type StepFn<TIn, TOut> = ((input: TIn, ctx: InternalWorkflowContext) => Promise<TOut>) & {
  stepName: string
  compensate?: (output: TOut, ctx: WorkflowContext) => Promise<void>
}

export const createStep = <TIn, TOut>(
  name: string,
  invoke: (input: TIn, ctx: WorkflowContext) => Promise<TOut>,
  compensate?: (output: TOut, ctx: WorkflowContext) => Promise<void>
): StepFn<TIn, TOut> => {
  const step = (async (input: TIn, ctx: InternalWorkflowContext) => {
    const output = await invoke(input, ctx)
    ctx.__completed.push({ name, output, compensate: compensate as CompletedStep["compensate"] })
    return output
  }) as StepFn<TIn, TOut>

  step.stepName = name
  step.compensate = compensate
  return step
}

export const createWorkflow = <TIn, TOut>(
  name: string,
  run: (input: TIn, ctx: WorkflowContext) => Promise<TOut>
) => ({
  name,
  async execute(input: TIn, ctx: WorkflowContext): Promise<{ success: true; output: TOut } | { success: false; error: Error }> {
    const internalCtx: InternalWorkflowContext = { ...ctx, __completed: [] }
    try {
      const output = await run(input, internalCtx)
      return { success: true, output }
    } catch (error) {
      for (const completed of internalCtx.__completed.reverse()) {
        if (completed.compensate) {
          await completed.compensate(completed.output, ctx).catch(() => {
            // log compensation failure; do not rethrow — best-effort rollback
          })
        }
      }
      return { success: false, error: error instanceof Error ? error : new Error(String(error)) }
    }
  },
})
```

`createStep(...)` returns a callable step function. That is why the examples use `await reserveAvailabilityStep(input, ctx)` instead of `step.invoke(...)`.

## Execution log (add to `packages/db`)

Every workflow execution is recorded for observability and idempotency:

```sql
workflow_execution (
  id uuid primary key,
  workflow_name text not null,
  idempotency_key text not null unique,
  status text not null,       -- 'running' | 'completed' | 'failed' | 'compensating'
  input_snapshot jsonb,
  output_snapshot jsonb,
  error text,
  created_at timestamptz,
  completed_at timestamptz
)

workflow_step_log (
  id uuid primary key,
  execution_id uuid references workflow_execution(id),
  step_name text not null,
  status text not null,       -- 'completed' | 'failed' | 'compensated'
  input_snapshot jsonb,
  output_snapshot jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz
)
```

## Testing workflows

Test each step in isolation. Test the workflow integration separately, mocking external calls:

```typescript
// packages/booking/src/__tests__/reserve-availability-step.test.ts
import { clearEventPushers } from "@my-app/events"
import { reserveAvailabilityStep } from "../workflows/steps/reserve-availability"
import { vi, beforeEach, expect, it } from "vitest"

beforeEach(() => clearEventPushers())

it("creates an availability block and returns reservationId", async () => {
  const ctx = makeMockWorkflowContext()
  const result = await reserveAvailabilityStep(
    { listingId: "lst-1", startDate: "2026-04-01", endDate: "2026-04-03" },
    ctx
  )
  expect(result.reservationId).toBeDefined()
})

it("compensate deletes the block on rollback", async () => {
  const deleteFn = vi.spyOn(availabilityRepo, "deleteBlock")
  const ctx = makeMockWorkflowContext()
  // simulate rollback
  await reserveAvailabilityStep.compensate?.({ reservationId: "res-1" }, ctx)
  expect(deleteFn).toHaveBeenCalledWith("res-1")
})
```

## Hard rules

- ❌ Do NOT use `createWorkflow` for single-step CRUD — add unnecessary overhead.
- ❌ Do NOT put authorization checks inside a step — the oRPC middleware chain pre-authorizes the caller.
- ❌ Do NOT throw inside a `compensate` function — catch, log, return. Best-effort rollback.
- ❌ Do NOT copy Medusa DSL examples literally (`when`, `transform`, `WorkflowResponse`) into this repo — they are not our API.
- ❌ Do NOT query the database directly from a handler to emulate orchestration — move the logic into a domain service or workflow.
- ✅ Each step does ONE mutation. One step = one external side effect.
- ✅ Use `idempotencyKey` in external calls (`${ctx.idempotencyKey}:step-name`) so retries are safe.
- ✅ Emit domain events AFTER all steps succeed, not inside steps.
- ✅ Domain services (booking, pricing, etc.) must NOT import from `packages/api` or `apps/server`.
- ✅ If a compensation needs the original amount, booking ID, or provider ID, include it in the step output instead of relying on placeholder values.
