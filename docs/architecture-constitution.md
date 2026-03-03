# Architecture Constitution

> Monorepo composition analysis, oRPC adoption map, and recommendations.

---

## Dependency Graph

```
apps/web ──────────┬── @my-app/api-contract  (types only)
                   ├── @my-app/assistant     (types: AssistantRouter)
                   ├── @my-app/ai-chat       (UI components)
                   ├── @my-app/ui            (design system)
                   └── @orpc/client, @orpc/tanstack-query

apps/server ───────┬── @my-app/api           (appRouter)
                   ├── @my-app/auth
                   ├── @my-app/db
                   ├── @my-app/env
                   ├── @my-app/queue
                   └── @orpc/server, @orpc/openapi, @orpc/zod

apps/assistant ────┬── @my-app/assistant     (router, context)
                   ├── @my-app/auth
                   ├── @my-app/env
                   └── @orpc/server

apps/notifications ┬── @my-app/notifications (contracts, processor)
                   ├── @my-app/db
                   ├── @my-app/env
                   ├── @my-app/queue
                   └── (no oRPC)

packages/api ──────┬── @my-app/api-contract  (implements contract)
                   ├── @my-app/auth
                   ├── @my-app/db
                   ├── @my-app/env
                   ├── @my-app/notifications
                   ├── @my-app/queue
                   └── @orpc/server, @orpc/zod

packages/assistant ┬── @my-app/api-contract  (AppContractClient for tool calls)
                   ├── @my-app/db            (direct DB access for chat persistence)
                   ├── @orpc/client
                   ├── @orpc/server
                   └── ai (Vercel AI SDK)
```

---

## oRPC Adoption Map

| Layer | Package | oRPC Role | Packages Used |
|-------|---------|-----------|---------------|
| **Contract** | `api-contract` | Defines `appContract` — all route shapes, input/output Zod schemas | `@orpc/contract` |
| **Server (main)** | `api` | Implements `appContract` via `implement()`. Middleware chain: public → session → protected → organization | `@orpc/server`, `@orpc/zod` |
| **Server (assistant)** | `assistant` | Standalone router via `os.$context<AssistantContext>()`. No shared contract — defines routes inline | `@orpc/server`, `@orpc/client` |
| **Transport (main)** | `apps/server` | `RPCHandler` + `OpenAPIHandler` mounted at `/rpc` and `/api-reference` | `@orpc/server/fetch`, `@orpc/openapi/fetch` |
| **Transport (assistant)** | `apps/assistant` | `RPCHandler` at `/rpc`. Creates internal `serverClient: AppContractClient` via `RPCLink` with cookie forwarding | `@orpc/server/fetch`, `@orpc/client/fetch` |
| **Client (web)** | `apps/web` | `createORPCClient(RPCLink)` → typed `AppContractClient`. TanStack Query integration via `createTanstackQueryUtils` | `@orpc/client`, `@orpc/tanstack-query` |
| **Client (assistant AI)** | `packages/assistant` | Tools receive `AppContractClient` and call server RPC (todo, tasks, payments, etc.) | `@orpc/client` |
| **Client (web→assistant)** | `apps/web` | Separate `RPCLink` to assistant `/rpc`. Uses `RouterClient<AssistantRouter>` (inferred, no contract) | `@orpc/client` |
| **Chat transport** | `packages/assistant` | `eventIteratorToUnproxiedDataStream` bridges oRPC streaming ↔ AI SDK `ChatTransport` | `@orpc/client` |
| **None** | `notifications` | No oRPC. Queue-based (pg-boss). Zod contracts for queue message validation only | — |
| **None** | `queue` | No oRPC. pg-boss wrapper | — |
| **None** | `auth` | No oRPC. Better Auth with drizzle adapter, used as middleware dependency | — |
| **None** | `db` | No oRPC. Drizzle schema + singleton connection | — |
| **None** | `env` | No oRPC. t3-env typed env vars | — |
| **None** | `ui`, `ai-chat` | No oRPC. Svelte component libraries | — |

### Key Observation: Two oRPC Patterns Coexist

1. **Contract-first** (`api-contract` → `api`): Full `oc.route()` contracts, `implement()`, typed client.
2. **Inline** (`assistant`): `os.$context()` with no shared contract. Client types inferred from `typeof assistantRouter`.

---

## Package-by-Package Assessment

### `packages/api-contract` — **Contract Layer**

**Role**: Single source of truth for the main API surface.

| Aspect | Status |
|--------|--------|
| oRPC adoption | ✅ Full — `oc.route()` with Zod schemas |
| Shared types | ✅ Exports `AppContract`, `AppContractClient` |
| Sub-contracts | admin, consent, notifications, payments, tasks, todo |
| Shared schemas | `contracts/shared.ts`, `contracts/recurring-task-queue.ts` |

**No issues.** This is the contract backbone.

---

### `packages/api` — **Business Logic + Router Implementation**

**Role**: Implements `appContract`, owns middleware chain, handler logic, event bus.

| Aspect | Status |
|--------|--------|
| oRPC adoption | ✅ Full — `implement(appContract).$context<Context>()` |
| Middleware | ✅ 4-tier: public → session → protected → organization |
| Context | Session extraction, org membership, queue producers, event bus |
| Handlers | 6 sub-routers + 4 root routes |

**Concern**: `context.ts` creates pg-boss producers eagerly on every request.
`createPgBossProducer()` is called for both queues even on unauthenticated/read requests.
The lazy `ensureBoss()` inside the producer defers the actual connection, but the allocation is unnecessary.

---

### `packages/assistant` — **AI Domain Package**

**Role**: AI chat logic, tool definitions, streaming, chat persistence.

| Aspect | Status |
|--------|--------|
| oRPC adoption | ⚠️ Partial — inline router (no contract) |
| Tools | 5 tools call `AppContractClient` from `api-contract` |
| DB access | Direct — reads/writes `assistantChat`, `assistantMessage` tables |
| Context | Own `AssistantContext` (not shared with main API context) |

**Concerns**:
- **No contract**: `assistantRouter` is defined inline with `os.$context()`. The web client types it as `RouterClient<AssistantRouter>` (inferred). This means breaking changes are only caught at build time, not at the contract level.
- **Direct DB access**: The package imports `@my-app/db` directly for chat CRUD. This bypasses any API abstraction — the assistant is both an API consumer (tools → server) and a direct DB writer (chat persistence).
- **Dual identity**: It's a library package consumed by `apps/assistant`, but it also owns business logic (chat CRUD, message persistence, tool orchestration).

---

### `packages/notifications` — **Notification Domain**

**Role**: Notification contracts (Zod schemas), processor, preference engine.

| Aspect | Status |
|--------|--------|
| oRPC adoption | ❌ None — queue-driven |
| Integration | Consumed by `api` (event bus → queue), `apps/notifications` (worker) |
| Contracts | Zod schemas for queue messages, not oRPC contracts |
| DB access | Direct — reads/writes notification tables |

**No issues.** Queue-driven domain, oRPC doesn't apply. Zod schemas for message validation are appropriate.

---

### `packages/queue` — **Queue Abstraction**

**Role**: pg-boss lifecycle, producer factory, worker registration.

| Aspect | Status |
|--------|--------|
| oRPC adoption | ❌ None — infrastructure package |
| Producer | `QueueProducer` interface matching old CF Queue API shape |
| Worker | `registerWorker()` with DLQ + retry config |

**Minor concern**: The `QueueProducer` interface still has `contentType` options (`"text" | "bytes" | "json" | "v8"`) inherited from the Cloudflare Queue migration. pg-boss always sends JSON. The options field is ignored. Harmless but misleading.

---

### `packages/auth` — **Authentication**

**Role**: Better Auth factory with drizzle adapter + plugins.

| Aspect | Status |
|--------|--------|
| oRPC adoption | ❌ None — auth framework |
| Consumed by | `api` (session middleware), `apps/server`, `apps/assistant` |

**No issues.** Auth is an infrastructure concern, not an API layer.

---

### `packages/db` — **Database**

**Role**: Drizzle schema, migrations, singleton `db` instance.

| Aspect | Status |
|--------|--------|
| oRPC adoption | ❌ None — data layer |
| Consumed by | `api`, `assistant`, `notifications`, `auth` |
| Schema | auth tables, assistant, notifications, consent, todo |

**No issues.** Proper data layer.

---

### `packages/env` — **Environment Config**

**Role**: Typed env vars via `@t3-oss/env-core`.

| Aspect | Status |
|--------|--------|
| Exports | `./server`, `./assistant`, `./web` |
| Consumed by | Every app + several packages |

**No issues.** Clean separation.

---

### `packages/proxy` — **Dev Tunnel**

**Role**: ngrok tunnel + reverse proxy for local dev.

| Aspect | Status |
|--------|--------|
| Used in dev? | Unclear — may be a leftover from Cloudflare Workers era |
| Dependencies | `@ngrok/ngrok`, `http-proxy` |

**Concern**: With Docker + local dev, is ngrok still needed? If it's only used for Telegram webhook testing, document that.

---

### `packages/ui` + `packages/ai-chat` — **UI Libraries**

| Aspect | Status |
|--------|--------|
| `ui` | shadcn-svelte components, Tailwind v4, design system |
| `ai-chat` | AI chat UI components (Message, Markdown, Tool, etc.) |
| `ai-chat` depends on | `@my-app/ui` |

**No issues.** Proper UI layering.

---

### `packages/config`, `packages/tailwind-config`, `packages/vitest-config` — **Tooling**

Infrastructure configs. No code logic. **No issues.**

---

## Composition Issues & Recommendations

### 1. Assistant: Contract Gap

**Problem**: `assistantRouter` has no contract. The web client uses `RouterClient<AssistantRouter>` (runtime inference). All other API surfaces use contract-first.

**Options**:

| Option | Pros | Cons |
|--------|------|------|
| **A. Create `assistant-contract`** package | Consistent with main API pattern; web gets typed contract client; breaking changes caught earlier | Another package to maintain; assistant API is simple (6 routes) |
| **B. Add assistant contract to `api-contract`** | Single contract source; consistent imports | Couples assistant routes to main API contract; may be confusing since they're served by different apps |
| **C. Keep inline (status quo)** | Simple; TypeScript inference catches most issues at build | Inconsistent with the rest of the architecture; no OpenAPI spec for assistant |

**Recommendation**: **Option A** if the assistant API surface is expected to grow. **Option C** is acceptable for now given the small surface area (6 routes, 1 streaming).

---

### 2. Assistant: Direct DB Access vs API Calls

**Problem**: `packages/assistant` imports `@my-app/db` directly for chat CRUD, but calls `@my-app/api` via oRPC client for tool operations. It has two data access patterns.

**Options**:

| Option | Pros | Cons |
|--------|------|------|
| **A. Move chat CRUD to `api` as oRPC routes** | Single data access pattern; chat API available to other consumers; consistent | Extra latency (assistant → server → DB); more routes in main API; tight coupling |
| **B. Keep direct DB (status quo)** | Low latency; simple; assistant owns its data | Two access patterns; assistant package has DB dependency; harder to split into separate service |
| **C. Extract `assistant-db` package** | Explicit ownership; DB queries isolated | Package proliferation for 5 queries |

**Recommendation**: **Option B (status quo)**. The assistant owns its domain tables (`assistant_chat`, `assistant_message`). Direct DB access for owned data is fine. The oRPC client calls are for *cross-domain* operations (todos, tasks, payments) which correctly go through the main API. This is a healthy bounded-context split.

---

### 3. Queue Producer Interface Cleanup

**Problem**: `QueueProducer` interface has `contentType` options from Cloudflare Queue migration that pg-boss ignores.

**Recommendation**: Simplify to `send(message: unknown): Promise<void>`. Low priority.

---

### 4. Merge Candidates

| Candidate | Merge Into | Rationale | Verdict |
|-----------|-----------|-----------|---------|
| `api-contract` → `api` | Merge contract into implementation | Reduces package count | ❌ **Don't merge.** Contract must be importable by `web` and `assistant` without pulling server deps (drizzle, pg, auth). Contract-first is the core pattern. |
| `assistant` → `apps/assistant` | Collapse package into app | Only one consumer | ⚠️ **Consider.** Currently `apps/assistant` is a thin shell (index.ts + rpc/handlers.ts). Could move router into app. But keeping it as a package allows `apps/web` to import types without depending on the app. **Keep as-is.** |
| `notifications` → `apps/notifications` | Collapse package into app | Similar to assistant | ❌ **Don't merge.** `packages/api` also imports notification contracts and pusher. Two consumers. |
| `queue` → `api` | Merge queue into API package | Queue is infrastructure for API | ❌ **Don't merge.** Queue is used by `apps/server`, `apps/notifications`, and `packages/api` independently. |
| `proxy` → remove | Delete if unused | May be dead code post-migration | ⚠️ **Evaluate.** If only used for Telegram webhooks, document. If unused, remove. |
| `config` → root | Merge into root biome config | Just holds biome config path | ⚠️ **Consider.** Very thin package. |
| `env/server` + `env/assistant` | Keep separate | Clean separation per runtime | ✅ **Keep.** |

---

### 5. Extract Candidates

| Candidate | From | Into | Rationale | Verdict |
|-----------|------|------|-----------|---------|
| Event bus | `api/src/lib/event-bus.ts` | `packages/events` | Used by API handlers to emit notifications. Currently buried in api/lib. | ⚠️ **Only if** other packages need to emit events. Currently only `api` uses it. **Keep as-is.** |
| Organization permissions | `api/src/organization.ts` | `packages/auth/organization-access` | Already half-extracted — `auth` exports `organizationRoles`, `api` wraps it. | ⚠️ **Consider** moving the `hasOrganizationPermission` helper into `auth`. Low priority. |
| AI tool helpers | `assistant/src/tools/*.ts` | Keep | 5 tools, each ~30 lines. | ✅ **Keep.** Well-organized. |

---

## Summary Scorecard

| Package | oRPC | Responsibility | Health | Action |
|---------|------|---------------|--------|--------|
| `api-contract` | ✅ Full | Contract definitions | 🟢 | None |
| `api` | ✅ Full | Business logic + routing | 🟢 | Minor: lazy queue producers |
| `assistant` | ⚠️ Partial | AI domain (no contract) | 🟡 | Consider contract if growing |
| `notifications` | ❌ N/A | Queue-driven domain | 🟢 | None |
| `queue` | ❌ N/A | pg-boss abstraction | 🟢 | Minor: clean producer interface |
| `auth` | ❌ N/A | Authentication | 🟢 | None |
| `db` | ❌ N/A | Schema + connection | 🟢 | None |
| `env` | ❌ N/A | Typed env vars | 🟢 | None |
| `ui` | ❌ N/A | Design system | 🟢 | None |
| `ai-chat` | ❌ N/A | Chat UI components | 🟢 | None |
| `proxy` | ❌ N/A | Dev tunnel (ngrok) | 🟡 | Evaluate if still needed |
| `config` | ❌ N/A | Biome config | 🟡 | Consider merging to root |

### Architecture Health: **Good**

The contract-first oRPC pattern is well-applied across the main API surface. The assistant's inline approach is the main inconsistency but is pragmatically acceptable. No packages need immediate merging or extraction. The bounded contexts (API domain, assistant domain, notification domain) are correctly separated with appropriate data access patterns.
