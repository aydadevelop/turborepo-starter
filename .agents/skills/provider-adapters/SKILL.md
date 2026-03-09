---
name: provider-adapters
description: >
  Create a provider interface, adapter registry, and concrete adapter implementation
  for external service integrations (calendar, payment, messaging channels).
  This pattern already exists for payments (PaymentWebhookAdapter + registry in packages/api/src/payments/).
  Use when: adding a new external integration behind a swappable interface, creating
  a CalendarProvider, PaymentProvider, or ChannelAdapter, or adding a new adapter
  implementation (e.g., Stripe alongside CloudPayments).
  Trigger terms: provider, adapter, registry, CalendarProvider, PaymentProvider,
  ChannelAdapter, registerAdapter, swappable, integration, Google Calendar, CloudPayments.
---

# Provider Adapters

External service integrations always sit behind a **Provider interface** with a **registry** for runtime resolution.
Domain logic calls the registry — it never imports an external SDK directly.

This pattern already exists in the codebase:
- `packages/api/src/payments/webhooks/` — `PaymentWebhookAdapter` + registry (reference implementation)

As domain packages are extracted, these move to:
- `packages/payments/` — `PaymentProvider` interface + registry + `CloudPaymentsProvider`
- `packages/calendar/` — `CalendarProvider` interface + registry + `GoogleCalendarProvider`
- `packages/messaging/` — `OutboundChannelAdapter` + `InboundChannelAdapter` + `ChannelAdapterRegistry`

## Pattern structure (per domain package)

```
packages/<domain>/src/
├── provider.ts          # Interface definition
├── registry.ts          # Registry: register, get, reset (for tests)
├── adapters/
│   ├── <impl>.ts        # Concrete implementation (e.g., google.ts, cloudpayments.ts)
│   └── fake.ts          # In-memory fake for unit tests
└── index.ts             # Re-export interface + registry functions
```

## Step 1: Define the provider interface

All monetary amounts are integer kopeks (1 RUB = 100 kopeks) to avoid floating-point errors.

> **Note on naming:** `packages/api/src/payments/webhooks/types.ts` currently exports `PaymentProvider` as a
> string-literal type alias. When `packages/payments` is extracted (Wave 1), that alias is replaced by this
> interface. Until then, these are in different packages and the names don't clash.

```typescript
// packages/payments/src/provider.ts
export interface PaymentProvider {
  readonly providerId: "cloudpayments" | "stripe"

  /** Charge a card. amountKopeks is integer kopeks. */
  charge(params: {
    amountKopeks: number
    token: string
    idempotencyKey: string
    description?: string
  }): Promise<{ paymentId: string; status: "authorized" | "completed" }>

  /** Refund a previous charge. Pass 0 for full refund. */
  refund(paymentId: string, amountKopeks: number): Promise<{ refundId: string }>

  capture(paymentId: string): Promise<void>
  cancel(paymentId: string): Promise<void>
}
```

```typescript
// packages/calendar/src/provider.ts
export interface DateRange {
  start: string  // ISO 8601
  end: string
}

export interface CalendarEventParams {
  externalId: string   // booking ID used as external calendar event ID
  title: string
  description?: string
  startDate: string
  endDate: string
  attendeeEmails?: string[]
}

export interface CalendarProvider {
  readonly providerId: string

  createEvent(params: CalendarEventParams): Promise<{ eventId: string }>
  updateEvent(eventId: string, params: Partial<CalendarEventParams>): Promise<void>
  deleteEvent(eventId: string): Promise<void>
  listBusySlots(range: DateRange): Promise<DateRange[]>
}
```

## Step 2: Build the registry

The registry uses a `Map` keyed by `providerId`. Always export a `reset` function for tests:

```typescript
// packages/payments/src/registry.ts
import type { PaymentProvider } from "./provider"

type ProviderId = PaymentProvider["providerId"]

const registry = new Map<ProviderId, PaymentProvider>()

export const registerPaymentProvider = (provider: PaymentProvider): void => {
  registry.set(provider.providerId, provider)
}

export const getPaymentProvider = (id: ProviderId): PaymentProvider => {
  const provider = registry.get(id)
  if (!provider) throw new Error(`PaymentProvider "${id}" is not registered. Call registerPaymentProvider() at startup.`)
  return provider
}

/** Test-only. Clears all registered providers. */
export const resetPaymentRegistry = (): void => {
  registry.clear()
}
```

## Step 3: Implement a concrete adapter

Credentials must be **injected via constructor**, never read from `process.env` inside a method.
Use `packages/env` to validate and expose typed env vars at startup.

```typescript
// packages/payments/src/adapters/cloudpayments.ts
import type { PaymentProvider } from "../provider"

// See docs/CloudPayments.md for full API reference
const CLOUDPAYMENTS_API = "https://api.cloudpayments.ru"

interface CloudPaymentsConfig {
  publicId: string
  apiSecret: string
}

export function createCloudPaymentsProvider(config: CloudPaymentsConfig): PaymentProvider {
  const auth = `Basic ${btoa(`${config.publicId}:${config.apiSecret}`)}`
  const headers = { "Content-Type": "application/json", "Authorization": auth }

  return {
    providerId: "cloudpayments",

    async charge({ amountKopeks, token, idempotencyKey, description }) {
      const res = await fetch(`${CLOUDPAYMENTS_API}/payments/cards/charge`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          Amount: amountKopeks / 100,  // CloudPayments API uses rubles, not kopeks
          Currency: "RUB",
          CardCryptogramPacket: token,
          InvoiceId: idempotencyKey,   // CloudPayments idempotency: InvoiceId in body, not HTTP header
          Description: description,
        }),
      })
      if (!res.ok) throw new Error(`CloudPayments HTTP error: ${res.status}`)
      const json = await res.json() as { Success: boolean; Message?: string; Model: { TransactionId: string; Status: string } }
      if (!json.Success) throw new Error(`CloudPayments charge failed: ${json.Message ?? "unknown"}`)
      return {
        paymentId: String(json.Model.TransactionId),
        status: json.Model.Status === "Authorized" ? "authorized" : "completed",
      }
    },

    async refund(paymentId, amountKopeks) {
      // See docs/CloudPayments.md — POST /payments/void or /payments/refund
      const res = await fetch(`${CLOUDPAYMENTS_API}/payments/refund`, {
        method: "POST",
        headers,
        body: JSON.stringify({ TransactionId: paymentId, Amount: amountKopeks / 100 }),
      })
      if (!res.ok) throw new Error(`CloudPayments HTTP error: ${res.status}`)
      const json = await res.json() as { Success: boolean; Message?: string; Model: { TransactionId: string } }
      if (!json.Success) throw new Error(`CloudPayments refund failed: ${json.Message ?? "unknown"}`)
      return { refundId: String(json.Model.TransactionId) }
    },

    async capture(_paymentId) { /* POST /payments/confirm */ },
    async cancel(_paymentId)  { /* POST /payments/void */ },
  }
}
```

## Step 4: In-memory fake for tests

```typescript
// packages/payments/src/adapters/fake.ts
import type { PaymentProvider } from "../provider"

export function createFakePaymentProvider(
  overrides: Partial<PaymentProvider> = {}
): PaymentProvider {
  return {
    providerId: "cloudpayments",
    async charge() { return { paymentId: "fake-payment-id", status: "completed" } },
    async refund()  { return { refundId: "fake-refund-id" } },
    async capture() {},
    async cancel()  {},
    ...overrides,
  }
}
```

## Step 5: Register at startup

Register concrete providers in `apps/server/src/index.ts` (or wherever server initialization happens):

```typescript
// apps/server/src/index.ts
import { registerPaymentProvider } from "@my-app/payments"
import { createCloudPaymentsProvider } from "@my-app/payments/adapters/cloudpayments"
import { registerCalendarProvider } from "@my-app/calendar"
import { createGoogleCalendarProvider } from "@my-app/calendar/adapters/google"
import { env } from "@my-app/env"  // typed env schema — never process.env directly

registerPaymentProvider(createCloudPaymentsProvider({
  publicId: env.CP_PUBLIC_ID,
  apiSecret: env.CP_API_SECRET,
}))
registerCalendarProvider(createGoogleCalendarProvider({
  serviceAccountKey: env.GOOGLE_SERVICE_ACCOUNT_KEY,
}))
```

## Step 6: Use the registry in domain code

Domain services call the registry — never construct providers inline:

```typescript
// packages/booking/src/workflows/steps/charge-payment.ts
import { getPaymentProvider } from "@my-app/payments"
import { createStep } from "@my-app/workflows"

export const chargePaymentStep = createStep<
  { amountKopeks: number; paymentToken: string },
  { paymentId: string }
>(
  "charge-payment",
  async ({ amountKopeks, paymentToken }, ctx) => {
    const provider = getPaymentProvider("cloudpayments")
    return await provider.charge({
      amountKopeks,
      token: paymentToken,
      idempotencyKey: `${ctx.idempotencyKey}:charge`,
    })
  },
  async ({ paymentId }) => {
    const provider = getPaymentProvider("cloudpayments")
    await provider.refund(paymentId, 0)  // full refund on compensation
  }
)
```

## Existing reference: PaymentWebhookAdapter

The current webhook adapter registry in `packages/api/src/payments/webhooks/` follows this same pattern and is the canonical reference until `packages/payments` is extracted:

| File | Role |
|---|---|
| `types.ts` | `PaymentWebhookAdapter` interface |
| `registry.ts` | `registerPaymentWebhookAdapter`, `getPaymentWebhookAdapter`, `resetPaymentWebhookRegistry` |
| `cloudpayments/adapter.ts` | CloudPayments concrete implementation |

## Testing with the fake

```typescript
// packages/booking/src/__tests__/charge-payment-step.test.ts
import { resetPaymentRegistry, registerPaymentProvider } from "@my-app/payments"
import { createFakePaymentProvider } from "@my-app/payments/adapters/fake"
import { chargePaymentStep } from "../workflows/steps/charge-payment"
import { vi, beforeEach, it, expect } from "vitest"

beforeEach(() => resetPaymentRegistry())

it("charges and returns paymentId", async () => {
  registerPaymentProvider(createFakePaymentProvider())
  const ctx = makeMockWorkflowContext()
  const result = await chargePaymentStep({ amountKopeks: 10000, paymentToken: "tok" }, ctx)
  expect(result.paymentId).toBe("fake-payment-id")
})

it("compensation calls refund", async () => {
  const refund = vi.fn().mockResolvedValue({ refundId: "r" })
  registerPaymentProvider(createFakePaymentProvider({ refund }))
  const ctx = makeMockWorkflowContext()
  await chargePaymentStep.compensate?.({ paymentId: "p-1" }, ctx)
  expect(refund).toHaveBeenCalledWith("p-1", 0)
})
```

## Hard rules

- ❌ Never import an external SDK (`googleapis`, `cloudpayments`, `node-telegram-bot-api`) inside a domain service — only inside adapter files.
- ❌ Never construct a provider inline in tests — always use the fake adapter via the registry.
- ✅ Always export `reset<X>Registry()` from every registry module for test isolation.
- ✅ Register providers at server startup, not lazily per-request.
- ✅ All monetary amounts are integer kopeks in both provider interfaces and domain events.
- ✅ Pass `idempotencyKey` to external charge/refund calls so they are safe to retry.
