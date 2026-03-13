# ADR-005: oRPC API Boundary — Contract-First Transport Layer

**Date:** 2026-03-10
**Status:** Active
**Authors:** Platform Team
**Related:** [ADR-002: Architecture Patterns §1.1](./002_architecture-patterns.md#11-from-medusa) | [ADR-004: Event Bus Migration & Alignment Gaps](./004_event-bus-migration.md)

---

## Table of Contents

1. [Context](#context)
2. [Decision](#decision)
3. [Canonical Chain](#canonical-chain)
   - [packages/api-contract](#packagesapi-contract)
   - [packages/api](#packagesapi)
   - [apps/server](#appsserver)
   - [apps/assistant](#appsassistant)
   - [apps/web](#appsweb)
4. [Context Shape](#context-shape)
   - [What Lives in Context](#what-lives-in-context)
   - [Middleware Narrowing](#middleware-narrowing)
   - [buildWorkflowContext Helper](#buildworkflowcontext-helper)
5. [Hard Rules](#hard-rules)
6. [Error Handling at the Boundary](#error-handling-at-the-boundary)
7. [Accepted Exceptions](#accepted-exceptions)
8. [Known Seams](#known-seams)
9. [Consequences](#consequences)

---

## Context

ADR-002 states the layering rule:

> `packages/api-contract` → `packages/api` handler → domain package service/workflow → repository/provider

This ADR documents the oRPC-specific conventions for that layering — what each layer is allowed to contain, how the request context flows and narrows through middleware, how clients are wired, and where errors are handled — so that anyone adding or modifying an API procedure has a single canonical reference.

Event bus wiring, pending alignment gaps, and the Wave 1 migration are documented in ADR-004. This ADR covers the transport boundary itself.

---

## Decision

We use **oRPC** as the API contract and handler binding layer. All external-facing procedures are defined as typed contracts in `packages/api-contract`, implemented as thin handlers in `packages/api`, and mounted on a Hono server in `apps/server`.

The inviolable boundary contract: **transport layers call domain; domain never imports transport.**

---

## Canonical Chain

```
packages/api-contract    — Zod-validated contracts (oc.router, oc.procedure)
       ↓
packages/api             — Typed implementations (o.implement(contract).handler(...))
       ↓
apps/server/src/rpc      — Hono adapter (@orpc/server/fetch), mounted at /rpc
       ↓
apps/assistant/src/rpc   — Server-to-server oRPC client (bearer token)
       ↓
apps/web/src/lib/orpc    — Browser/SSR client (@orpc/client + TanStack Query)
```

### packages/api-contract

- Contains only: Zod schemas, `oc.procedure()` definitions, and `oc.router()` groupings.
- No business logic, no DB imports, no external SDK references.
- Exported as a single `appContract` tree from `src/routers/index.ts`.
- Contract file names mirror handler file names: `routers/booking.ts` ↔ `handlers/booking.ts`.
- Imported by both server and browser clients — must remain bundle-safe.

### packages/api

- Each handler file implements a subtree via `implement(appContract.booking).router({ ... })`.
- Handlers are **≤10 lines**: build context → call service/workflow → return result.
- No direct DB queries, no notification calls, no inline side effects.
- Business logic that grows beyond 3 lines in a handler belongs in a domain service.

### apps/server

- Registers the combined router on a Hono `app` via `@orpc/server/fetch`.
- Runs `requireAuth` / cookie extraction at the Hono level, before the oRPC adapter.
- Mounts at `/rpc`; the `handleFetch` adapter handles routing and serialization.
- Responsible for calling `registerBookingLifecycleSync(db)` and `registerNotificationEventPusher(queue)` at startup — see ADR-004 Gap 2.

### apps/assistant

- Uses `createORPCClient(appContract, { fetch: authenticatedFetch })` for server-to-server calls.
- Its own AI tool procedures are separate Hono routes outside the shared `appContract`.
- Passes a bearer token from env; does not use cookie-based auth.

### apps/web

- Browser client: `createORPCClient(appContract)` with a fetch link that sends credentials.
- SSR client: same contract, different instantiation in SvelteKit `load()` that reads the session token from `locals` and sets the `Authorization` header explicitly — see Known Seams §4.
- TanStack Query options factories live in `src/lib/orpc.ts`, not in page components.
- Web infers network-owned request/response types from the root oRPC client or root contract only, via a single local facade such as `src/lib/orpc-types.ts`.
- Web uses oRPC-generated query and mutation helpers for all server-state access, including `queryOptions`, `mutationOptions`, `call`, `key`, and `queryKey`.

---

## Context Shape

The request context is created once per request by `createContext()` in `packages/api/src/context.ts` and flows through the entire middleware stack. Each middleware may narrow (not widen) the type.

### What Lives in Context

| Field | Type | Set by |
|---|---|---|
| `session` | `Session \| null` | `createContext()` — from auth header / cookie |
| `activeMembership` | `ActiveMembership \| null` | `createContext()` — from DB membership lookup |
| `db` | `Db` | `createContext()` |
| `eventBus` | `EventBus` | `createContext()` — `new EventBus()` from `@my-app/events` (see ADR-004 Gap 1) |
| `notificationQueue` | `QueueProducer \| undefined` | `createContext()` — from env binding |
| `recurringTaskQueue` | `QueueProducer \| undefined` | `createContext()` — from env binding |
| `requestUrl` | `string` | `createContext()` |
| `requestHostname` | `string` | `createContext()` |
| `requestCookies` | `string` | `createContext()` |

### Middleware Narrowing

```
Context                          (session may be null)
  └─ requireSession              → AuthContext          (session: Session, non-null)
       └─ requireActiveMembership → MemberContext       (activeMembership: ActiveMembership)
            └─ requireActiveOrganization → OrganizationContext  (organizationId available)
```

Rules:
- Middleware must not call DB beyond the lookups needed to narrow its own field.
- Middleware must not emit events or trigger side effects.
- Organization-scoped procedures must be under `requireActiveOrganization`.

### buildWorkflowContext Helper

Handlers that call multi-step workflows construct a `WorkflowContext` via a single helper. This is the only bridge between the transport layer and the workflow/domain layer:

```typescript
// packages/api/src/context.ts
export function buildWorkflowContext(context: OrganizationContext): WorkflowContext {
  return {
    db: context.db,
    eventBus: context.eventBus,
    organizationId: context.activeMembership.organizationId,
    actorUserId: context.session.userId,
    notificationQueue: context.notificationQueue,
    recurringTaskQueue: context.recurringTaskQueue,
  }
}
```

Handlers that call plain domain services pass `db` and `ctx.organizationId` individually; `buildWorkflowContext` is only needed when calling into workflows.

---

## Hard Rules

| Rule | Rationale |
|---|---|
| Contracts contain no logic — only Zod schemas + procedure definitions | Contracts are imported by browser clients; impure code breaks client bundling |
| Handlers are ≤10 lines | Keeps transport thin; forces logic into testable domain services |
| Handlers never import from db directly | DB access belongs to repositories in domain packages |
| Handlers never call `notificationsPusher` or any pusher directly | Side effects belong to the event bus, emitted from domain services |
| Domain packages never import from api or api-contract | Prevents circular dependency; keeps domain packages independently deployable |
| `WorkflowContext` is the only bridge from transport to workflow/domain | Stable, testable interface; prevents ad-hoc context threading |
| Client TanStack Query options factories live in orpc.ts | Prevents query options from leaking into Svelte page components |
| Web never imports leaf-router type aliases from `packages/api-contract` | Frontend network types must stay rooted in the shared contract/client, not ad-hoc router exports |
| Web never hand-builds TanStack Query keys for oRPC procedures | Prevents cache-key drift; use `orpc.*.key()` / `queryKey()` helpers instead |

---

## Error Handling at the Boundary

- Handlers throw `ORPCError` for expected failures (`NOT_FOUND`, `FORBIDDEN`, `BAD_REQUEST`).
- Domain services throw plain `Error` subclasses; the handler or a wrapping middleware maps these to `ORPCError` before they reach the transport.
- Unhandled errors propagate to the Hono error handler in index.ts, which logs and returns a generic 500.
- Clients receive typed errors via `@orpc/client`'s error propagation; the web layer inspects `ORPCError.code` for user-facing feedback.

---

## Accepted Exceptions

| Exception | Justification |
|---|---|
| assistant tool handlers query db directly | Assistant tools are exploratory; they do not produce side effects that require compensation or event emission |
| Webhook intake handlers in webhooks exceed 10 lines | Webhook parsing requires signature verification and multi-branch event dispatch; extracting these to a service would recreate the handler inline |

---

## Known Seams

Areas where the current implementation deviates from this ADR. Detailed remediation steps are in ADR-004.

| Seam | Current State | Fix |
|---|---|---|
| `context.eventBus` | `createContext()` never instantiates `EventBus`; middleware lazily creates legacy bus | Instantiate `new EventBus()` from `@my-app/events` in `createContext()` — ADR-004 Gap 1 |
| `buildWorkflowContext` helper | Does not exist; handlers thread context fields manually | Add to context.ts |
| SSR client auth | SvelteKit `load()` functions reuse the browser client; correct path is a dedicated SSR client that sets `Authorization` from `locals.session` | Create `createSSRClient(session)` utility in orpc.ts |
| Error normalization | Domain service `Error` subclasses reach the client as generic 500s | Add error-mapping middleware or a thin catch in the Hono error handler |

---

## Consequences

**Positive:**
- New procedures have a single canonical template: contract schema → handler ≤10 lines → domain service or workflow.
- Domain packages are independently testable; they never import from the HTTP layer.
- Client type-safety is maintained end-to-end via `appContract`.
- Adding a new actor type (e.g., customer-facing storefront procedures) is purely additive: new subtree in `api-contract`, new handler file, new middleware guard.

**Negative / watch-outs:**
- Any schema change in `api-contract` propagates to all clients; narrowing inputs or changing output shapes is a breaking change across web, assistant, and any third-party integrations.
- The `requireActiveOrganization` middleware is the sole source of `organizationId` for org-scoped procedures. Procedures that need org context without an active membership (e.g., admin impersonation) require a separate middleware path — this is not yet designed.
