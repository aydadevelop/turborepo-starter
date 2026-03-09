# Coding Conventions

**Analysis Date:** 2026-03-09

## Naming Patterns

**Files:**
- Use kebab-case for runtime source, test, and config files: `packages/api/src/lib/event-bus.ts`, `packages/api/src/handlers/todo.ts`, `apps/web/e2e/public-layout.spec.ts`, `packages/e2e-web/playwright.snapshots.config.ts`.
- Reserve conventional uppercase names for repository docs and agent metadata only: `README.md`, `SKILL.md`, `docs/ADR/002_architecture-patterns.md`.
- Keep test file suffixes semantic: `*.test.ts` for Vitest and `*.spec.ts` for Playwright/browser stories.

**Functions:**
- Use camelCase and prefer verb-first names for helpers and orchestration points: `hasOrganizationPermission`, `getPlaywrightRuntimeEnv`, `bootstrapTestDatabase`, `signInAndSaveState`.
- Middleware helpers in `packages/api/src/index.ts` use imperative `require*` names (`requireSession`, `requireAuthenticatedUser`, `requireActiveOrganization`) to signal boundary checks.
- Predicate helpers use `has*` / `is*` naming (`hasSessionUser`, `hasNonAnonymousSessionUser`, `isLocalBaseURL`).

**Variables:**
- Use camelCase for ordinary locals and injected collaborators: `eventBus`, `testDatabase`, `reuseExistingServers`, `anchorDate`.
- Use UPPER_SNAKE_CASE for durable constants and fixture paths: `LOGIN_URL_PATTERN`, `NAV_OPTIONS`, `ADMIN_STORAGE_STATE`, `OPERATOR_STORAGE_STATE`, `SEED_CREDENTIALS`.
- Keep package aliases under the `@my-app/*` namespace instead of long relative imports when crossing package boundaries.

**Types:**
- Use PascalCase for interfaces, context types, and helpers that represent stable shapes: `Context`, `OrganizationContext`, `TestDatabase`, `TestFixtures`, `BootstrapTestDatabaseOptions`.
- Use descriptive type names instead of generic `Data` / `Result` buckets; examples in `packages/db/src/test/index.ts` and `packages/api/src/context.ts` are the standard to follow.

## Code Style

**Formatting:**
- Formatter: Biome via `biome.json`.
- Indentation: tabs (`"formatter.indentStyle": "tab"` in `biome.json`).
- Quotes: double quotes for JavaScript/TypeScript (`"javascript.formatter.quoteStyle": "double"`).
- Import cleanup is automatic through Biome assist with `organizeImports` enabled.
- Biome intentionally ignores generated, legacy, and planning-heavy paths such as `**/legacy`, `**/docs`, `**/.agents`, `**/.github`, `**/test-results`, and `**/playwright-report`; conventions in those areas are maintained manually.

**Linting:**
- Linter: Biome, extended from `ultracite/biome/core` and `ultracite/biome/svelte` in `biome.json`.
- Prefer explicit, low-surprise code: `noParameterAssign`, `useAsConstAssertion`, `useDefaultParameterLast`, `useEnumInitializers`, `useSingleVarDeclarator`, and `noUselessElse` are enabled as errors.
- Tailwind class sorting is encouraged through `useSortedClasses` for `clsx`, `cva`, and `cn` calls.
- Svelte files relax several rules (`useConst`, `useImportType`, `noUnusedVariables`, etc.) in `biome.json`; do not copy those exceptions back into plain `.ts` files.
- Package boundaries are enforced where needed. Example: `apps/notifications/**` may not import `@my-app/api` internals; the restriction is encoded directly in `biome.json`.

## Import Organization

**Order:**
1. External packages and platform libraries first (`@playwright/test`, `@orpc/server`, `drizzle-orm`, `hono`).
2. Workspace packages next via `@my-app/*` aliases.
3. Relative imports last (`../index`, `./utils/url`).

**Path Aliases:**
- Prefer `@my-app/*` for package-to-package imports: `@my-app/db`, `@my-app/api-contract/routers`, `@my-app/vitest-config`.
- Use relative imports only within the owning package or app.
- Do not introduce a generic `shared` alias. The owning package should stay obvious from the import path.

## Error Handling

**Patterns:**
- Prefer explicit error types at transport boundaries. Authorization and membership checks in `packages/api/src/index.ts` throw `ORPCError("UNAUTHORIZED")` or `ORPCError("FORBIDDEN")` instead of silent nulls.
- Fail fast on impossible states. Example: `packages/api/src/handlers/todo.ts` throws `new Error("Insert failed")` when Drizzle returns no row.
- Preserve framework-native error handling where appropriate. `apps/server/src/__tests__/app.test.ts` codifies that `HTTPException` responses pass through unchanged while unknown exceptions become `{ error: "Internal Server Error" }`.
- Prefer typed return envelopes over ambiguous booleans. Examples: `{ success: true }` in simple handlers and structured session objects in `packages/auth/src/__tests__/auth.test.ts`.

## Logging

**Framework:** console logging only

**Patterns:**
- Keep logs sparse and operational. `packages/e2e-web/e2e/global-setup.ts` logs only seed-skip decisions; this is the preferred style for infra/setup messaging.
- Use `console.error` only at failure boundaries where the error would otherwise be swallowed. `packages/api/src/__tests__/event-bus.test.ts` documents this expectation for notification push failures.
- Avoid chatty logs inside handlers, domain logic, or reusable utilities.

## Comments

**When to Comment:**
- Add short intent comments when behavior is non-obvious, flaky-sensitive, or framework-driven.
- Good examples:
  - `packages/e2e-web/e2e/auth.setup.ts` explains why setup waits for `domcontentloaded` instead of full load.
  - `apps/web/e2e/dev.spec.ts` explains why screenshots are captured during local interaction replay.
  - `packages/e2e-web/e2e/ui-snapshots.spec.ts` explains baseline snapshot behavior and update flow.
- Avoid narrating obvious syntax or restating the code line-by-line.

**JSDoc/TSDoc:**
- Use short doc comments when a fixture or exported symbol benefits from durable editor help. Example: the `TestFixtures` properties in `packages/e2e-web/e2e/fixtures.ts`.
- Prefer local comments over heavyweight JSDoc for private helpers.

## Function Design

**Size:**
- Keep transport-facing functions thin. `packages/api/src/handlers/todo.ts` is the current baseline: validate through the procedure contract, perform one focused action, and return typed data.
- Move branching, orchestration, compensation, and cross-domain behavior out of handlers and into owned domain services/workflows as the codebase grows. This rule is explicit in `.github/copilot-instructions.md` and `docs/ADR/002_architecture-patterns.md`.

**Parameters:**
- Prefer typed context injection over optional argument soup. Examples: `packages/api/src/index.ts` middleware builds richer context incrementally; `packages/db/src/test/index.ts` wraps seeding behind `BootstrapTestDatabaseOptions`.
- Keep env and runtime parameters grouped in config helpers (`getPlaywrightRuntimeEnv`, `getE2ERuntimeEnv`) rather than sprinkling `process.env` reads everywhere.

**Return Values:**
- Return explicit objects, arrays, or domain rows; avoid hidden mutation.
- Async helpers should return the smallest complete unit needed by callers: storage state files in `packages/e2e-web/e2e/auth.setup.ts`, `{ db, close }` in `packages/db/src/test/index.ts`, typed records from Drizzle `returning()` calls.

## Module Design

**Exports:**
- Each package should expose an intentional public surface through `src/index.ts` or curated `package.json` subpath exports. `packages/api/package.json` is the pattern: explicit exports for handlers, services, and payment webhook modules.
- Keep internal details internal. Test helpers live under package-local paths such as `packages/auth/src/test` and `packages/db/src/test` rather than a repo-wide helper bucket.

**Barrel Files:**
- Barrel files are allowed only where the repo already blesses them. `biome.json` disables `noBarrelFile` for specific package entrypoints such as `**/ui/src/index.ts`, `**/ai-chat/src/index.ts`, and schema/env entry files.
- Do not add new broad barrels outside those public API surfaces.

## Layering and Handler Thinness

**Transport stays thin:**
- Contracts belong in `packages/api-contract/src/**`.
- Procedure composition and middleware belong in `packages/api/src/index.ts`.
- Request adapters belong in app shells such as `apps/server/src/**` and `apps/assistant/src/**`.
- Thin handlers should build/receive context, call owned logic, and return typed output. They should not inline permission matrices, manual rollback, or third-party SDK calls.

**Authorization lives in middleware:**
- Follow the existing procedure ladder in `packages/api/src/index.ts`: `publicProcedure` → `sessionProcedure` → `protectedProcedure` → `organizationProcedure` / `organizationPermissionProcedure`.
- Do not scatter role checks across handlers when a middleware can enforce them once.

**Owning layer rule:**
- Persistence belongs in `packages/db/src/**` and domain-owned repositories/helpers.
- Shared UI lives in `packages/ui/src/**` and `packages/ai-chat/src/**`.
- External integration code belongs behind adapters/providers, not inside domain or transport code. This is a hard rule from `.github/copilot-instructions.md` and `docs/ADR/002_architecture-patterns.md`.

## Event and Workflow Patterns

**Current state:**
- The live event mechanism is `EventBus` in `packages/api/src/lib/event-bus.ts`.
- Middleware in `packages/api/src/index.ts` injects the bus into organization-scoped requests and flushes pending notifications after handler completion.
- This means side effects are already being collected at the boundary instead of being fired ad hoc from transport code.

**Expected architecture rule:**
- Treat `docs/ADR/002_architecture-patterns.md` as the repo’s target-state contract for side effects:
  - domain events are the preferred side-effect trigger;
  - event pushers self-register in their owning package;
  - multi-step operations with rollback needs belong in workflows using `createWorkflow` / `createStep` + compensation;
  - handlers must not contain ad hoc try/catch rollback logic.
- `packages/events` and `packages/workflows` are still architecture targets rather than broadly implemented runtime packages in this snapshot. Document that distinction when planning new work instead of pretending they already exist everywhere.

## Package Ownership and Boundaries

**Use the owning package:**
- API contracts: `packages/api-contract/src/**`
- Domain/API implementation: `packages/api/src/**`
- Auth rules and Better Auth setup: `packages/auth/src/**`
- Database schema/test harness: `packages/db/src/**`
- Browser UI and route code: `apps/web/src/**`
- Shared UI primitives: `packages/ui/src/**` and `packages/ai-chat/src/**`
- Deployment-gate E2E stories: `packages/e2e-web/e2e/**`

**No dumping grounds:**
- `.github/copilot-instructions.md` explicitly forbids broad `shared` / `utils` buckets that blur responsibility.
- If a helper belongs to a concept, place it in that concept’s package. Examples already follow this rule: auth helpers in `packages/auth/src/test`, DB harness in `packages/db/src/test`, Playwright auth/data helpers in `packages/e2e-web/e2e/utils`.

**Cross-package imports should tell the story:**
- Importing `@my-app/api-contract` from `apps/web` is good because it preserves contract-first boundaries.
- Importing API internals into unrelated runtime apps is bad; `apps/notifications/**` has a lint rule that blocks it.

## Documentation and ADR Expectations

**Source of truth order:**
- Read `.github/copilot-instructions.md` for day-to-day coding rules.
- Read `docs/architecture-constitution.md` for current package composition and oRPC adoption status.
- Read `docs/ADR/002_architecture-patterns.md` for target-state architecture rules (thin handlers, providers, events, workflows, bounded packages).

**When to update docs:**
- If architecture guidance changes, update the relevant docs in the same change. `.github/copilot-instructions.md` explicitly says instructions and docs must stay aligned.
- Use ADRs in `docs/ADR/*.md` for durable architecture decisions and `docs/architecture-constitution.md` for current-state mapping.
- Do not leave architecture-only changes encoded solely in code. Future GSD planning depends on the docs being current.

**Review expectation:**
- Before editing code, inspect nearby files, tests, and conventions first. This repo treats “read first, change in the owning layer, keep diffs tight, verify behavior” as a standing rule from `.github/copilot-instructions.md`.

---

*Convention analysis: 2026-03-09*