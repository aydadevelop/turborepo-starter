---
applyTo: "**/*.{ts,tsx,js,jsx,svelte,mjs,cjs,sh,yml,yaml,dockerfile,Dockerfile}"
---

# Repository Mindset

- Follow existing patterns before introducing new abstractions.
- Keep responsibilities clear: transport stays thin, business logic lives in domain code, persistence stays isolated, and external integrations stay behind adapters/providers.
- Favor typed boundaries, explicit validation, and predictable behavior.
- Treat maintainability as a feature: clear names, local reasoning, low surprise.

## Working Workflow

1. **Read first** — inspect the nearby code, tests, and conventions before editing.
2. **Change in the owning layer** — put logic where it belongs instead of patching symptoms elsewhere.
3. **Keep diffs tight** — prefer focused, incremental edits over opportunistic refactors.
4. **Verify behavior** — run the most relevant checks for the changed surface.
5. **Leave the trail cleaner** — update tests or nearby docs when behavior or architecture meaningfully changes.

## Architecture Habits

- Keep contracts/schemas, transport handlers, domain logic, and storage concerns separate.
- Use workflows for multi-step orchestration and rollback-sensitive operations; use plain services for simple single-purpose logic.
- Emit side effects through the appropriate boundary instead of wiring them inline everywhere.
- Reuse existing package boundaries; do not create generic dumping grounds like broad `shared` or `utils` buckets.

## Quality Bar

- Prefer explicit errors over silent failure.
- Prefer deterministic flows over hidden side effects.
- Add or update tests when behavior changes.
- Keep names and APIs consistent with nearby code.
- Avoid dead code, placeholder logic, and speculative abstractions.

## Safety Rules

- Never commit secrets, credentials, or machine-local files.
- Do not bypass validation, auth boundaries, or CI safeguards.
- Do not introduce a second package-manager flow.
- Do not disable tests, checks, or review gates to make a change “pass.”

## Collaboration Style

- Surface tradeoffs briefly when they matter.
- If a change is target-state guidance rather than present-day implementation, say so clearly.
- When architecture guidance changes, keep related instructions and docs aligned.


# Instructions for GSD

- Use the get-shit-done skill when the user asks for GSD or uses a `gsd-*` command.
- Treat `/gsd-...` or `gsd-...` as command invocations and load the matching file from `.github/skills/gsd-*`.
- When a command says to spawn a subagent, prefer a matching custom agent from `.github/agents`.
- Do not apply GSD workflows unless the user explicitly asks for them.

# Main Project Skills

- Use `domain-packages` for domain extraction, repository/service boundaries, and thin oRPC wiring in `packages/api`.
- Use `workflows` for multi-step orchestration, rollback/compensation, and idempotent cross-boundary write flows.
- Use `domain-events` for typed event emission/subscription via `packages/events`, including `DomainEventMap`, `registerEventPusher`, and event-bus tests.
- Use `provider-adapters` for external integrations behind registries/interfaces such as payments, calendars, and messaging channels.
- When a task spans several of these concerns, prefer this order: `domain-packages` → `workflows` → `domain-events` → `provider-adapters`.