# Better-T-Stack Project Rules

This repository is the source template for a reusable Cloudflare full-stack starter.

## Starter Target Stack

- Frontend: SvelteKit (Svelte 5) + shadcn-svelte
- Backend: Hono (Cloudflare Workers runtime)
- API layer: oRPC (contract-first)
- Database: Drizzle + D1 (SQLite)
- Infra: Alchemy
- Build system: Turborepo
- Testing: Vitest (+ e2e workspace tests)
- Runtime/deploy: Cloudflare Workers + Queues
- Package manager target for starter: Bun

## Recommended Starter Extraction Flow

1. Create a dedicated extraction branch from a green main.
   - `git switch -c codex/starter-v1`
2. Remove domain-specific business modules and third-party integrations not meant for template users.
3. Keep baseline packages and examples:
   - Auth, API contracts/routers, DB schema + migrations, queue producer/consumer, UI primitives.
4. Migrate to Bun in one pass.
   - Update root `packageManager`.
   - Generate `bun.lock`.
   - Remove npm lockfile and npm-only command docs.
5. Validate baseline before publishing:
   - `turbo run lint check-types test build`
   - `turbo run deploy --filter=@*/infra -- --stage dev`
6. Publish to new repository:
   - Keep history: push `codex/starter-v1` to new remote `main`.
   - Clean history: create orphan branch and commit once.

## Core Rules

### Turborepo

- Define tasks in workspace packages; root only delegates with `turbo run`.
- Keep `turbo.json` task graph explicit (`dependsOn`, `outputs`, env passthrough).
- Avoid root scripts that run package commands directly.

### oRPC Contract-First

- Keep shared contracts and routers in `packages/api`.
- Use typed Zod schemas for inputs/outputs.
- Keep web client typed against router exports, not ad-hoc HTTP wrappers.

### Hono Worker Boundaries

- Keep server entrypoints transport-focused.
- Put business logic in package services/routers.
- Use middleware for cross-cutting behavior (auth, cors, error handling).

### Drizzle + D1

- Keep schema and migrations in `packages/db`.
- Do not introduce migration drift between local and deployed stages.
- Keep seeders deterministic for starter demos/tests.

### Alchemy + Cloudflare Queues

- Define resources in `packages/infra/alchemy.run.ts`.
- Bind queues through Alchemy and consume via Worker `queue` handler.
- Use message schemas and DLQs by default for async workloads.

### Svelte + shadcn-svelte

- Use Svelte 5 runes and modern event syntax.
- Keep shared components in `packages/ui`.
- Reuse shadcn-svelte composition patterns and import conventions.

## Bad Practices To Avoid

- Mixing Bun and npm lockfiles in the same branch.
- Hiding task logic in root scripts instead of package scripts.
- Putting business/domain logic in Hono entrypoint files.
- Queue consumers that process unvalidated payloads.
- Manual Cloudflare resource edits that are not captured in Alchemy.
- Starter defaults that include sensitive env values or product-specific secrets.
