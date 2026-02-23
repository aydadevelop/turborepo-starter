/**
 * Bun native test runner guard — loaded via bunfig.toml [test] preload.
 *
 * This file is ONLY executed when `bun test` is invoked directly.
 * Vitest (used by `bun run test` → turbo → vitest per package) never loads it.
 *
 * Effect: `bun test` exits immediately with a clear error instead of
 * confusingly picking up Playwright specs and Vitest-only test files.
 */
console.error(`
ERROR: Wrong test runner.

  bun test        ← Bun's native runner. Picks up ALL *.test.ts and *.spec.ts
                    files across the workspace, including Playwright specs and
                    Vitest-only tests. Do NOT use this at the workspace root.

  bun run test    ← Correct. Runs: turbo run test → vitest per package.
  bun run test:e2e← Correct. Runs: turbo → Playwright (packages/e2e-web).
`);
process.exit(1);
