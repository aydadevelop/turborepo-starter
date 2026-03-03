#!/usr/bin/env bash
# sync-secrets.sh — Push environment config to GitHub Secrets + Variables.
#
# Usage:
#   ./scripts/sync-secrets.sh production
#   ./scripts/sync-secrets.sh staging
#
# Prerequisites:
#   brew install gh
#   gh auth login
#
# Files read (fill these in locally — they are gitignored):
#   .env.{ENV}.secrets  → GitHub Secrets  (encrypted, never visible)
#   .env.{ENV}.vars     → GitHub Variables (visible in UI, not secret)
#
# The GitHub environment must already exist:
#   gh api repos/{owner}/{repo}/environments/{ENV} -X PUT
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

ENV_NAME="${1:-}"
if [[ -z "${ENV_NAME}" ]]; then
  echo "Usage: $0 <production|staging>" >&2
  exit 1
fi

SECRETS_FILE=".env.${ENV_NAME}.secrets"
VARS_FILE=".env.${ENV_NAME}.vars"
REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo '')"

if [[ -z "${REPO}" ]]; then
  echo "Error: not inside a GitHub repo or 'gh' is not authenticated." >&2
  echo "Run: gh auth login" >&2
  exit 1
fi

echo "→ Syncing to GitHub repo: ${REPO} / environment: ${ENV_NAME}"
echo

# ── Ensure the environment exists ─────────────────────────────────────────────
gh api "repos/${REPO}/environments/${ENV_NAME}" -X PUT --silent || true

# ── Secrets ───────────────────────────────────────────────────────────────────
if [[ -f "${SECRETS_FILE}" ]]; then
  echo "Uploading secrets from ${SECRETS_FILE}..."
  # Strip comment lines and blank lines before uploading
  FILTERED_SECRETS=$(grep -v '^\s*#' "${SECRETS_FILE}" | grep -v '^\s*$')
  echo "${FILTERED_SECRETS}" | gh secret set --env "${ENV_NAME}" --env-file /dev/stdin --repo "${REPO}"
  echo "✓ Secrets uploaded"
else
  echo "⚠  ${SECRETS_FILE} not found — skipping secrets"
fi

echo

# ── Variables ─────────────────────────────────────────────────────────────────
if [[ -f "${VARS_FILE}" ]]; then
  echo "Uploading variables from ${VARS_FILE}..."
  # gh variable set supports --env-file directly
  # Strip comment lines and blank lines
  FILTERED_VARS=$(grep -v '^\s*#' "${VARS_FILE}" | grep -v '^\s*$')
  echo "${FILTERED_VARS}" | gh variable set --env "${ENV_NAME}" --env-file /dev/stdin --repo "${REPO}"
  echo "✓ Variables uploaded"
else
  echo "⚠  ${VARS_FILE} not found — skipping variables"
fi

echo
echo "Done. Verify at: https://github.com/${REPO}/settings/environments"
