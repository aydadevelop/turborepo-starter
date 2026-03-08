#!/usr/bin/env bash
# Runs visual UI snapshot tests if port 5173 (dev server) is active.
# Called by the Copilot agentStop hook after each agent turn.
#
# First run: creates baseline .png snapshots in e2e/ui-snapshots.spec.ts-snapshots/
# Subsequent runs: compare against baseline and fail on visual regressions.
#
# To update baselines after an intentional change, run manually:
#   cd packages/e2e-web && bunx playwright test ui-snapshots \
#     --update-snapshots --config playwright.snapshots.config.ts

set -euo pipefail

PORT=5173

if ! lsof -ti ":$PORT" >/dev/null 2>&1; then
  echo "📸 [snapshot] Port $PORT not running — skipping UI snapshot tests."
  exit 0
fi

echo "📸 [snapshot] Dev server detected on :$PORT — running visual snapshot tests..."

cd packages/e2e-web

# If no baseline snapshots exist yet, create them (first-run mode)
SNAPSHOT_DIR="e2e/ui-snapshots.spec.ts-snapshots"
if [[ ! -d "$SNAPSHOT_DIR" || -z "$(ls -A "$SNAPSHOT_DIR" 2>/dev/null)" ]]; then
  echo "  📷 No baselines found — creating initial snapshots..."
  bunx playwright test ui-snapshots \
    --config playwright.snapshots.config.ts \
    --update-snapshots \
    --reporter line
  echo "  ✅ Baseline snapshots created. Commit them to track future UI changes."
  exit 0
fi

# Baseline exists — compare and report regressions
if bunx playwright test ui-snapshots \
    --config playwright.snapshots.config.ts \
    --reporter line; then
  echo "  ✅ No visual regressions detected."
else
  echo ""
  echo "  ⚠️  UI snapshot mismatch! Review diffs in packages/e2e-web/playwright-report/"
  echo "  If the change is intentional, update baselines:"
  echo "    cd packages/e2e-web && bunx playwright test ui-snapshots --update-snapshots --config playwright.snapshots.config.ts"
  # Exit 0 so the hook doesn't block the agent — this is advisory only
  exit 0
fi
