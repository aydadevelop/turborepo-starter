# Legacy Migration Audit (`/legacy`)

Date: 2026-02-06

## Scope

- `legacy/cf-boat-api` (Hono + Worker API)
- `legacy/boat-app-main` (SvelteKit web + Telegram Mini App frontend)

## Quick Inventory

- Backend source files (`.ts`): 183
- Backend route files: 12
- Backend service files: 79
- Backend repository files: 15
- Backend tests: 70
- Frontend source files (`.ts` + `.svelte`): 352
- Frontend tests: 6 (includes mocks)

## Migration Progress (Current Monorepo)

- [x] Better Auth organization plugin integrated with canonical roles (`org_owner`, `org_admin`, `manager`, `agent`, `customer`).
- [x] Organization auth schema added (`organization`, `member`, `invitation`) with migration and tests.
- [x] API now resolves active organization membership in request context and exposes reusable org-permission procedures.
- [x] Scratch-first migration policy adopted (no legacy compatibility/backfill path in the new stack).
- [x] Boat management vertical is migrated with org-scoped guards and typed oRPC contracts (core, docks, amenities, assets, availability, calendar links, pricing).

## High-Risk Findings

### P0: Secrets are committed in legacy infra config

`legacy/cf-boat-api/wrangler.toml` stores live credentials and tokens in plaintext under `[vars]` and `[env.local.vars]`.

- Evidence: `legacy/cf-boat-api/wrangler.toml:30`
- Impact: token leakage, account takeover, payment/provider abuse.
- Required action before migration starts:
  - Rotate all exposed credentials.
  - Remove secrets from tracked files.
  - Keep only non-secret defaults in config.

### P0: Manual auth and role checks are scattered and inconsistent

- JWT middleware is custom and role checks are boolean helpers (`admin/agent/owner/manager`):
  - `legacy/cf-boat-api/src/middleware/authMiddleware.ts:7`
- Role-based authorization is path-driven (`/manage/:role/...`) and resolved manually:
  - `legacy/cf-boat-api/src/routes/manageRoutes.ts:15`
- Public route bypass list is broad and string-prefix based:
  - `legacy/cf-boat-api/src/app.ts:62`

This is the main reason to migrate to Better Auth first.

### P1: Schema/type drift already exists

- Migration drops `users.role`:
  - `legacy/cf-boat-api/migrations/0009_nifty_ravenous.sql:1`
- Runtime code still queries `users.role`:
  - `legacy/cf-boat-api/src/services/PaymentService/ExternalPaymentProvider.ts:113`
- Types still require `role` on agent model:
  - `legacy/cf-boat-api/src/types/agent.ts:6`

This confirms backend type drift and hidden runtime risk.

### P1: Calendar sync is cron polling per boat, not event-driven

- Scheduled cron triggers calendar sync and cleanup:
  - `legacy/cf-boat-api/wrangler.toml:212`
  - `legacy/cf-boat-api/src/index.ts:13`
- Sync loops through all approved boats with calendars:
  - `legacy/cf-boat-api/src/services/Calendar/CalendarService.ts:90`

Current behavior scales linearly with boats and increases external API pressure.

### P1: Boat-centric domain coupling makes extension difficult

- `boatId` usage is widespread across backend (395 direct references).
- Generic CRUD layer relies on string entities and `any` payloads:
  - `legacy/cf-boat-api/src/repositories/ManageRepository.ts:64`
  - `legacy/cf-boat-api/src/services/ManageService.ts:45`

This blocks easy pivot from “boats only” toward a broader asset model.

### P2: Frontend tightly couples auth/session and role-path APIs

- Access/refresh token cookie handling is manual:
  - `legacy/boat-app-main/src/lib/api/request.ts:22`
- Manage API client embeds role in route path:
  - `legacy/boat-app-main/src/lib/api/client.ts:15`
- Telegram Mini App logic and web shell are intertwined:
  - `legacy/boat-app-main/src/routes/+layout.svelte:51`
  - `legacy/boat-app-main/src/lib/utils/startParam.ts:105`

## Domain Coverage Found in Legacy

The legacy codebase contains all listed business areas:

1. Boat management (roles, documents/media, approvals, availability)
2. Booking (filters, pricing, discounts, cancellation/dispute)
3. Help desk and support tickets
4. Multi-channel intake (Telegram, Avito, email, Sputnik adapter)
5. Telegram notifications + webhook callbacks
6. AI-assisted response scaffolding (partial)
7. Combined rental frontend (web + Telegram Mini App)
8. Management frontend
9. Affiliate-related fields/logic (partial)
10. Landing/content pages

## Migration Strategy (Better Auth First)

## Phase 0: Stabilize and secure

- Rotate and revoke leaked secrets.
- Freeze feature work in legacy auth/role code.
- Establish migration branch and compatibility checklist.

## Phase 1: Identity and permissions foundation (first project)

Goal: replace manual JWT + role booleans with Better Auth + explicit membership/role model.

1. Add org membership model in new stack (`packages/db` + `packages/auth`):
   - `organizations`
   - `organization_memberships`
   - `organization_roles` (or enum-backed role field)
2. Canonical roles for v1:
   - `org_owner`, `org_admin`, `manager`, `agent`, `customer`
3. Add permission matrix in one place (policy map), not in route files.
4. Replace `/manage/:role/...` authorization with session+membership checks from Better Auth context.
5. Keep migration scratch-first: no legacy boolean-role compatibility layer in new APIs.

Exit criteria:

- No route depends on `users.admin/agent/owner/manager` booleans.
- No route takes role from URL for authorization decisions.
- Session identity is sourced only from Better Auth.

## Phase 2: Domain extraction and API contracts

1. Split legacy logic into typed modules in `packages/api`:
   - `boat-management`
   - `booking`
   - `pricing`
   - `messaging`
   - `support`
2. Move from dynamic entity CRUD (`string` + `any`) to explicit oRPC contracts.
3. Generate OpenAPI from oRPC for external integrations.
4. Introduce shared DTO/schema layer to keep frontend/backend types aligned.

## Phase 3: Calendar abstraction and webhook model

1. Create calendar provider adapter interface:
   - `CalendarProvider.syncIncremental()`
   - `CalendarProvider.createWatch()`
   - `CalendarProvider.stopWatch()`
2. Keep polling as fallback; default to push/webhook for Google.
3. Persist channel metadata (`channelId`, `resourceId`, `expiresAt`, `syncToken`).
4. Add renewal job only for expiring watches.

TODO (explicit):

- [ ] Replace per-boat 2-minute polling with Google Calendar webhook channels (`events.watch`) + incremental sync on webhook receipt.
- [ ] Add watch renewal/cleanup worker for channel expiration.
- [ ] Keep emergency cron fallback (lower frequency) behind a feature flag.

## Phase 4: Frontend split and transport cleanup

1. Replace manual cookie token flow with Better Auth client/session.
2. Replace role-path manage client with typed RPC client methods.
3. Split user experiences by app boundary:
   - rental app (web + mini app compatibility)
   - management app
4. Keep Telegram-specific launch/start-param logic as an adapter layer, not core app auth logic.

## Phase 5: Test system reset (TDD + regression + manual)

1. Contract tests for each router (API behavior, auth rules, role policy).
2. Domain tests for pricing/discount/cancellation edge cases.
3. Integration tests for calendar sync and webhook handlers.
4. Playwright regression pack for critical booking/management flows.
5. CI gates: `lint`, `check-types`, `test`, `test:e2e`, plus migration smoke tests.

## Recommended First Sprint (2 weeks)

1. Security hardening: remove secrets from legacy tracked config, rotate credentials.
2. Implement Better Auth org membership schema in current monorepo.
3. Add centralized permission matrix and middleware helpers.
4. Migrate one vertical slice end-to-end:
   - read-only boats list for management
   - scoped by org membership role
   - typed oRPC contract + test coverage.

This gives a safe baseline before migrating booking/pricing complexity.

## Notes on Architecture Direction

- Current Better-T-Stack repo is a good target for migration (`oRPC + Better Auth + Drizzle + Turbo`).
- Keep calendar provider-agnostic from day one (Google first adapter).
- Avoid generic `entity` CRUD for new code; explicit domain APIs are easier to secure and test.
