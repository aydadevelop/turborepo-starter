---
applyTo: "**/*.{ts,tsx,js,jsx,svelte,mjs,cjs}"
---

# Full-Stack CF App Instructions

This monorepo is the baseline for a reusable Cloudflare starter:

- SvelteKit (Svelte 5) + shadcn-svelte
- Hono on Workers
- oRPC contract-first APIs
- Drizzle + D1
- Alchemy IaC
- Turborepo
- Vitest
- Cloudflare Queues + DLQ

## Working Model

- Keep task scripts in workspace `package.json` files.
- Root scripts only delegate (`turbo run <task>`).
- Register task behavior in `turbo.json`; do not hide task logic in root scripts.
- Keep one package manager per branch/repo.
  - This repo runs Bun.
  - Do not reintroduce npm lockfiles or npm-only scripts.

## Architecture Boundaries

- `apps/web`: UI composition and client integration.
- `apps/server`: Hono transport adapters and worker entrypoints.
- `packages/api`: oRPC contracts, routers, and domain services.
- `packages/db`: Drizzle schema, migrations, and DB scripts.
- `packages/infra`: Alchemy Cloudflare resources and bindings.
- `packages/ui`: shared shadcn-svelte components.

## Svelte + shadcn-svelte

- Use Svelte 5 runes (`$state`, `$derived`, `$props`).
- Prefer modern DOM handlers (`onclick`) over legacy syntax.
- Use shadcn-svelte import patterns consistently.
- Keep shared design system pieces in `packages/ui`.

## Hono + oRPC

- Keep endpoint transport thin in server files.
- Put validation and business logic in package-level routers/services.
- Use Zod schemas for request/response boundaries.
- Favor contract-first usage from client and server; avoid ad-hoc fetch for core RPC flows.

## Queues

- Define queue message schemas in shared package contracts.
- Validate message payloads with `safeParse` before processing.
- Use explicit retry limits and DLQ strategy.
- Acknowledge/ retry deterministically; do not leave ambiguous outcomes.

## Testing

- Use shared Vitest config from `packages/vitest-config`.
- Co-locate unit tests with package code.
- Keep e2e tests isolated in dedicated workspace package(s).
- Do not merge code with `.only` or `.skip` test controls enabled.

## Security and Reliability

- Never commit secrets or local credential files.
- Validate env inputs with typed schemas.
- Prefer explicit error handling with structured logs over silent failures.
- Keep infra as code in Alchemy; avoid manual dashboard-only changes.

## Starter Branch Strategy

- Yes: create a dedicated extraction branch before copying to a new repo.
- Recommended branch name: `codex/starter-v1`.
- Publish options:
  - Preserve history by pushing the branch to a new remote.
  - Use an orphan branch for a clean, single-commit starter history.
