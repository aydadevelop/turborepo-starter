# Contaktly Production Gap Analysis

Reviewed on `2026-03-06` against:

- live target: `https://app.contaktly.com`
- local implementation: current `turborepo-alchemy` Contaktly slice

## Original shortlist brief, condensed

Phase 1 needs:

1. High-engagement widget and contact flow
2. Deterministic conversation orchestration with no parallel-question bug
3. Shared AI engine across website chat and WhatsApp/click-to-chat continuation
4. Frictionless meeting booking
5. Qualification + enrichment
6. Basic analytics and operator visibility

## Live target: what exists today

Observed in the real product:

- `/client/dashboard`
- `/client/conversations`
- `/client/chat`
- `/client/knowledge`
- `/client/meetings`
- `/client/analytics`
- `/client/widget`
- `/client/settings`

### Strong points in the live product

- The admin shell is broad and coherent.
- `Widget Setup` already exposes a large configuration surface:
  - embed mode
  - domain allowlist
  - appearance controls
  - bot identity
  - opening message / starter cards
  - custom instructions
  - qualified lead definition
  - calendar provider selector
- `Settings` is a real authenticated account surface.

### Current live-product weaknesses

- `/client/conversations` is still unstable in the browser.
  - Playwright captured repeated React runtime/hydration errors:
    - `#425`
    - `#418`
    - `#423`
  - The page also rendered a misleading zero-state while the shell loaded.
- `Knowledge Base` is structurally present but empty in the audited workspace.
- `Meetings` is structurally present but empty in the audited workspace.
- `Chat Test` exposes a composer, but the observed UI does not prove deterministic state control or tool-backed runtime behavior by itself.

## Our implementation: what is already better

Areas where the current repo is already stronger than the live target:

- Deterministic widget turn progression and idempotent `clientTurnId` handling in
  - `packages/api/src/lib/contaktly-conversation.ts`
- Shared anonymous visitor session across widget host and Astro embed
  - `apps/widget`
  - `packages/contaktly-widget`
- Public chat runs through streamed oRPC + AI SDK transport, not only static UI
  - `packages/api/src/lib/contaktly-widget-chat.ts`
- Org-scoped conversations inbox works and is browser-verified
  - `apps/web/src/routes/(app)/dashboard/contaktly/conversations/+page.svelte`
- Better Auth foundation is real and already integrated
  - `packages/auth/src/index.ts`
- TanStack Query v6 is already in use in the web app
  - `apps/web/package.json`
- Demo verification is repeatable and green
  - `scripts/demo-verify-contaktly.mjs`

## Our implementation: what is still not production-ready

These are the real gaps if the goal is a production-grade Phase 1, not a demo-safe slice.

### 1. Tools are not fully wired into the customer runtime

Current state:

- The widget chat streams through AI SDK.
- The public Contaktly runner still builds a constrained prompt around a precomputed deterministic reply.
- It does **not** yet run a real tool loop for:
  - availability lookup
  - booking creation
  - knowledge retrieval
  - lead enrichment
  - context fetch by page/source

Relevant file:

- `packages/api/src/lib/contaktly-widget-chat.ts`

Required production change:

- Reuse the assistant tool architecture from `packages/assistant`, not a separate bespoke prompt-only runner.
- Add explicit Contaktly tools:
  - `getCalendarAvailability`
  - `createBooking`
  - `retrieveKnowledgeContext`
  - `enrichLeadProfile`
  - `handoffToBookingUrl`
- Tool access for anonymous visitors must be authorized by `widgetSessionToken`, not Better Auth cookies.

### 2. Calendar integration is metadata-level, not booking-level

Current state:

- Google OAuth linking is real.
- Workspace calendar connection persistence is real.
- Booking URL fallback is real.
- Native availability search and booking creation are **not** implemented.

Relevant files:

- `packages/api/src/lib/contaktly-google-calendar.ts`
- `apps/web/src/routes/(app)/dashboard/contaktly/widget/+page.svelte`

Required production change:

- Move from `calendar connected` to:
  - availability search
  - slot selection
  - booking write
  - confirmation payload
  - meeting-link generation

### 3. Knowledge is scaffolded, not true ingestion + retrieval

Current state:

- Prefill scrape and draft generation are real.
- Knowledge page is currently a derived inventory over the prefill draft.
- There is no real ingestion pipeline, chunking/indexing, retrieval, or grounding in the runtime.

Relevant files:

- `packages/api/src/lib/contaktly-prefill.ts`
- `packages/api/src/lib/contaktly-knowledge.ts`

Required production change:

- Add async ingest job:
  - scrape / upload
  - chunk
  - embed
  - store vectors / metadata
- Expose retrieval as a runtime tool, not only admin display data.

### 4. Widget settings are still much thinner than the live product

Current state:

- Our public widget config currently persists only a narrow subset:
  - `allowedDomains`
  - `bookingUrl`
  - `botName`
  - `openingMessage`
  - `starterCards`
  - `theme`

Relevant files:

- `packages/db/src/schema/contaktly.ts`
- `packages/api/src/lib/contaktly-widget-config.ts`

Gap versus live target:

- Missing full persisted appearance system:
  - border
  - radius
  - shadow
  - bot/visitor message colors
  - font sizing
  - inline/bubble mode parity

Required production change:

- Promote the widget config from demo schema to full runtime schema.
- Make the iframe/widget renderer consume persisted theme values directly.

### 5. Observability is not Contaktly-grade yet

Current state:

- Basic logging exists in server/assistant/notifications.
- Queue infrastructure exists.
- Admin analytics page currently derives metrics from current DB state.

Missing:

- structured per-conversation event logging
- stream lifecycle metrics
- tool-call traces
- queue failure dashboards / DLQ strategy
- booking success/failure instrumentation
- per-widget funnel events
- alerting

Relevant files:

- `apps/server/src/app.ts`
- `apps/assistant/src/app.ts`
- `apps/notifications/src/app.ts`

Required production change:

- Add event schema and telemetry for:
  - widget boot
  - chat start
  - turn accepted
  - tool call
  - qualification complete
  - booking started
  - booking succeeded / failed
- Persist these separately from read-model aggregates.

### 6. State control is partially correct, but not unified yet

Current state:

- Web app uses `@tanstack/svelte-query` `^6.1.0`.
- Admin pages already use query-backed reads.
- Widget stream lifecycle still relies on component-local control around bootstrap + commit sequencing.

Relevant files:

- `apps/web/package.json`
- `apps/widget/src/routes/embed/frame/+page.svelte`
- `apps/widget/src/lib/contaktly-chat.ts`

Required production change:

- Keep TanStack Query v6 as the single server-state owner for admin surfaces.
- For widget runtime:
  - formalize cache ownership for bootstrap/history
  - explicitly invalidate/refetch after stream commit
  - persist conversation resume state cleanly
  - avoid hidden local-state forks

### 7. Auth is solid for admin, but widget auth must remain intentionally separate

Current state:

- Admin auth via Better Auth is real and strong.
- Widget identity uses traceable anonymous visitor/session tokens.

This is the correct direction.

Required production hardening:

- signed widget session token expiry/rotation
- explicit host/domain binding in token validation
- replay protection on mutation endpoints
- cleaner separation between admin auth and public widget auth

## Recommended architecture decision

Build on the current system, but rebuild specific runtime layers:

- Keep:
  - Better Auth
  - oRPC contracts
  - query-based admin shell
  - widget iframe/embed model
  - deterministic turn/state model
  - queue foundation
- Rebuild or substantially refactor:
  - public widget chat runtime into true tool-based assistant execution
  - booking runtime
  - knowledge ingest/retrieval
  - widget configuration schema breadth
  - telemetry/event model

## Bottom line

The current repo is already strong enough for a convincing technical demo because:

- the widget session model is real
- the parallel-question bug is actually addressed
- the admin shell is browser-verified
- auth is real
- query state is not fake

But it is **not** yet a production-ready Phase 1 substitute for the live product.

The main reason is simple:

- the live product is broader in configuration surface
- our product is stronger in conversation/runtime correctness
- neither side yet has the full production-grade combination of:
  - tool-driven runtime
  - native booking
  - real knowledge retrieval
  - observability
  - full widget configuration depth

That combination is the real finish line.
