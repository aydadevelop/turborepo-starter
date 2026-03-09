# Testing Patterns

**Analysis Date:** 2026-03-09

## Test Framework

**Runner:**
- Vitest `^4.0.18` for unit/integration tests via `packages/vitest-config` (`packages/vitest-config/package.json`).
- Config: shared defaults in `packages/vitest-config/src/index.ts`, then per-package/app `vitest.config.ts` files such as `packages/api/vitest.config.ts`, `packages/auth/vitest.config.ts`, `packages/db/vitest.config.ts`, `apps/server/vitest.config.ts`, and `apps/web/vitest.config.ts`.
- Playwright `^1.58.2` for browser tests in `packages/e2e-web` and `apps/web`.

**Assertion Library:**
- Vitest `expect` for unit/integration tests.
- Playwright `expect` for browser assertions and screenshots.

**Run Commands:**
```bash
bun run test                          # Run all Vitest-backed package/app tests through Turbo
bun run test:watch                    # Run workspace watch mode through Turbo
bun run test:e2e                      # Run deployment-gate Playwright stories in packages/e2e-web
cd packages/api && bunx vitest run --coverage   # Coverage for a specific package (no root coverage script exists)
```

## Test File Organization

**Location:**
- Unit/integration tests are mostly package-local under `src/__tests__/`: `packages/api/src/__tests__/`, `packages/auth/src/__tests__/`, `packages/db/src/__tests__/`, `apps/server/src/__tests__/`.
- Deployment-gate E2E stories live in `packages/e2e-web/e2e/`.
- Dev-only browser checks live in `apps/web/e2e/`.

**Naming:**
- Use `*.test.ts` for Vitest suites: `packages/api/src/__tests__/event-bus.test.ts`, `packages/auth/src/__tests__/auth.test.ts`.
- Use `*.spec.ts` for Playwright stories: `packages/e2e-web/e2e/auth.spec.ts`, `apps/web/e2e/dev.spec.ts`.
- Keep setup fixtures explicit: `auth.setup.ts`, `global-setup.ts`, `fixtures.ts`.

**Structure:**
```text
packages/api/src/__tests__/
packages/auth/src/__tests__/
packages/db/src/__tests__/
apps/server/src/__tests__/
packages/e2e-web/e2e/
apps/web/e2e/
```

## Test Structure

**Suite Organization:**
```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("app", () => {
	beforeEach(() => {
		vi.resetModules?.();
	});

	it("returns JSON not found response for unknown routes", async () => {
		const { app } = await import("../app");
		const response = await app.request("/missing");
		expect(response.status).toBe(404);
	});
});
```
- This pattern is taken directly from `apps/server/src/__tests__/app.test.ts`.

**Patterns:**
- Group tests by public behavior using nested `describe` blocks and plain-English `it(...)` names.
- Reset mutable state in `beforeEach` rather than leaking setup across tests. Examples:
  - `apps/server/src/__tests__/app.test.ts` resets module state and mocks.
  - `packages/auth/src/__tests__/auth.test.ts` clears the test DB before each scenario.
  - `packages/db/src/__tests__/database.test.ts` relies on `bootstrapTestDatabase({ seedStrategy: "beforeEach" })`.
- Favor observable behavior over implementation detail. `packages/api/src/__tests__/organization.test.ts` tests permission outcomes, not internal control-flow branches.

## Mocking

**Framework:** Vitest mocks (`vi.mock`, `vi.doMock`, `vi.fn`, `vi.spyOn`)

**Patterns:**
```typescript
vi.doMock("@my-app/db", () => ({ db: {} }));

const mockPusher = vi.fn().mockResolvedValue(undefined);
vi.doMock("@my-app/notifications/pusher", () => ({
	notificationsPusher: mockPusher,
}));

const { EventBus } = await import("../lib/event-bus");
```
- This is the established import-order pattern from `packages/api/src/__tests__/event-bus.test.ts`: mock first, import the module under test second.

**What to Mock:**
- External boundaries and slow collaborators: env modules, queue/pusher integrations, route adapters, SDK-facing modules, and runtime boot hooks.
- Hono route fragments and oRPC adapters when testing app shell behavior, as shown in `apps/server/src/__tests__/app.test.ts`.

**What NOT to Mock:**
- Database constraints or schema behavior when the test is about persistence semantics; use the in-memory PGlite harness in `packages/db/src/test/index.ts` instead.
- Auth/session flows that already have a purpose-built test harness (`packages/auth/src/test`).
- Browser flows that depend on real navigation, storage state, or rendered UI; use Playwright fixtures instead of faking DOM behavior.

## Fixtures and Factories

**Test Data:**
```typescript
const testDatabase = bootstrapTestDatabase({ seedStrategy: "beforeEach" });
let db: TestDatabase;

beforeEach(() => {
	db = testDatabase.db;
});
```
- This is the standard DB-backed unit/integration pattern from `packages/db/src/__tests__/database.test.ts`.

**Location:**
- In-memory DB harness: `packages/db/src/test/index.ts`
- Auth helper harness: `packages/auth/src/test/**`
- Playwright authenticated fixtures: `packages/e2e-web/e2e/fixtures.ts`
- Playwright credential/state bootstrap: `packages/e2e-web/e2e/auth.setup.ts`
- Playwright seeded helpers and factories: `packages/e2e-web/e2e/utils/**`

**How fixtures are used:**
- `packages/db/src/test/index.ts` creates a fresh PGlite-backed Drizzle database, applies schema with `pushSchema`, and supports `beforeAll` or `beforeEach` seeding strategies.
- `packages/e2e-web/e2e/fixtures.ts` provides `adminPage`, `operatorPage`, `testNamespace`, and auto-cleaning `testData` factories.
- Auth setup stores reusable session state in `packages/e2e-web/e2e/.auth/admin.json` and `packages/e2e-web/e2e/.auth/operator.json`.

## Coverage

**Requirements:**
- Coverage reporting is configured globally in `packages/vitest-config/src/index.ts` using provider `v8` with `text`, `json`, and `html` reporters.
- No coverage threshold is enforced.
- The workspace has no root `coverage` script; coverage is package-by-package.
- `passWithNoTests: true` is enabled in shared config, so packages without tests can still pass CI unless additional checks are added.

**View Coverage:**
```bash
cd packages/api && bunx vitest run --coverage
```

## Test Types

**Unit Tests:**
- Fast logic checks around permissions, event-bus behavior, helpers, and auth API responses.
- Representative files: `packages/api/src/__tests__/organization.test.ts`, `packages/api/src/__tests__/event-bus.test.ts`, `packages/auth/src/__tests__/auth.test.ts`.

**Integration Tests:**
- DB schema and constraint tests run against in-memory PGlite with real Drizzle schemas in `packages/db/src/__tests__/database.test.ts`.
- App-shell integration tests use `app.request(...)` on Hono instances in `apps/server/src/__tests__/app.test.ts`.

**E2E Tests:**
- Deployment-gate suite: `packages/e2e-web/playwright.config.ts` + `packages/e2e-web/e2e/**`.
- Dev-only progress checks: `apps/web/playwright.e2e.config.ts` + `apps/web/e2e/**`.
- Snapshot-only browser config: `packages/e2e-web/playwright.snapshots.config.ts`.

## Common Patterns

**Async Testing:**
```typescript
const response = await app.request("/health/boom");
expect(response.status).toBe(500);
expect(await response.json()).toEqual({ error: "Internal Server Error" });
```
- This style comes from `apps/server/src/__tests__/app.test.ts` and is the default for request/response assertions.

**Error Testing:**
```typescript
await expect(
	db.insert(user).values({ email: "duplicate@example.com" })
).rejects.toThrow();
```
- This pattern appears repeatedly in `packages/db/src/__tests__/database.test.ts` and `packages/auth/src/__tests__/auth.test.ts`.

## TDD-Managed Progress

**Expected flow:**
- Treat logic-heavy work in this repo as TDD-managed progress by default, matching the user preference and the GSD guidance in `.github/get-shit-done/references/tdd.md`.
- Use RED → GREEN → REFACTOR for:
  - business logic and validation,
  - API endpoint request/response behavior,
  - data transformations and constraints,
  - workflow/state-machine behavior.
- Skip strict TDD only for layout-only UI tweaks, simple glue code, or exploratory work; add tests immediately after the design settles.

**Red-Green-Refactor rule:**
1. Write the failing Vitest or Playwright spec first.
2. Prove it fails for the expected reason.
3. Implement the smallest change that turns the suite green.
4. Refactor only while the suite remains green.
5. Keep each cycle scoped to one feature or one user-visible behavior.

**Where this matters most:**
- `packages/api/src/**` and `packages/auth/src/**` for request/response and rule logic.
- `packages/db/src/**` for schema semantics.
- `packages/e2e-web/e2e/**` when the behavior crosses service boundaries.

## Seeds, Snapshots, and Determinism

**Seeds:**
- `packages/e2e-web/e2e/global-setup.ts` seeds the local E2E database by calling `bootstrapLocalE2EDatabase(...)`.
- Seeding is skipped only when:
  - `PLAYWRIGHT_SKIP_SEED=1`, or
  - `PLAYWRIGHT_BASE_URL` points at a non-local host.
- The E2E suite uses `PLAYWRIGHT_SEED_ANCHOR_DATE` with default `2026-03-15`; date-sensitive tests should lean on this anchor instead of `new Date()` drift.
- Seeded identities are a first-class contract in the browser suite (`SEED_CREDENTIALS`, `adminPage`, `operatorPage`).

**Snapshots:**
- Visual snapshots are defined in `packages/e2e-web/e2e/ui-snapshots.spec.ts` and use `packages/e2e-web/playwright.snapshots.config.ts`.
- Snapshot baselines belong in `packages/e2e-web/e2e/ui-snapshots.spec.ts-snapshots/`.
- The snapshot directory currently exists but is empty in this workspace snapshot, so the first intentional baseline generation is still required.
- Keep screenshot updates deliberate; never regenerate baselines casually after unrelated UI drift.

**Practical snapshot update command:**
```bash
cd packages/e2e-web && bunx playwright test ui-snapshots --update-snapshots --config playwright.snapshots.config.ts
```

## Practical Gaps to Close

**Coverage gaps:**
- No coverage thresholds are enforced even though coverage reporters are configured.
- `apps/web` has a Vitest config in `apps/web/vitest.config.ts`, but no Vitest specs were detected in the current workspace snapshot.
- `apps/assistant`, `apps/notifications`, `packages/assistant`, and `packages/notifications` expose test scripts/configs, but no matching test files were detected in the current snapshot.

**Workflow/event test gaps:**
- `docs/ADR/002_architecture-patterns.md` defines target-state `packages/events` and `packages/workflows`, but there are not yet corresponding runtime package tests because those packages are not broadly implemented in this snapshot.
- Current event coverage is limited to `packages/api/src/lib/event-bus.ts`; future domain-event and workflow packages will need their own unit and compensation tests.

**E2E determinism gaps:**
- The deployment-gate suite has solid seeding and auth bootstrapping, but only a narrow set of seeded identities/scenarios is encoded today.
- The empty snapshot baseline directory means visual regression protection is configured but not fully operational yet.

**CI realism gaps:**
- `passWithNoTests: true` in `packages/vitest-config/src/index.ts` keeps empty packages from failing. That is convenient during extraction work, but it also hides missing coverage in newly created packages.

---

*Testing analysis: 2026-03-09*