#!/usr/bin/env bash
# deploy-dokku.sh — Deploy Docker images to Dokku apps on the VPS.
#
# Called from CI after images are built and pushed to GHCR.
# Deploys each app using `dokku git:from-image`.
#
# Required env vars:
#   SSH_HOST, SSH_USER, SSH_PORT — VPS connection
#   REGISTRY, IMAGE_PREFIX, GIT_SHA — image coordinates
#   SSH_KEY_FILE (optional) — path to SSH private key file
#
# Usage:
#   bash infra/scripts/deploy-dokku.sh

set -euo pipefail

REGISTRY="${REGISTRY:-ghcr.io}"
IMAGE_PREFIX="${IMAGE_PREFIX:?IMAGE_PREFIX is required}"
GIT_SHA="${GIT_SHA:?GIT_SHA is required}"
TAG="sha-${GIT_SHA:0:7}"

# Support both local (self-hosted runner on VPS) and remote SSH execution
if command -v dokku &>/dev/null; then
  # Running directly on VPS — invoke dokku locally
  dokku_cmd() { dokku "$@"; }
  echo "Deploying tag ${TAG} locally (self-hosted runner)..."
else
  # Fallback: SSH to VPS (requires SSH_HOST, SSH_USER, SSH_PORT, SSH_KEY_FILE)
  SSH_HOST="${SSH_HOST:?SSH_HOST required when dokku is not local}"
  SSH_USER="${SSH_USER:-root}"
  SSH_PORT="${SSH_PORT:-22}"
  SSH_KEY_FILE="${SSH_KEY_FILE:-}"
  dokku_cmd() {
    ssh -o StrictHostKeyChecking=no -p "${SSH_PORT}" \
      ${SSH_KEY_FILE:+-i "${SSH_KEY_FILE}"} \
      "${SSH_USER}@${SSH_HOST}" dokku "$@"
  }
  echo "Deploying tag ${TAG} via SSH to ${SSH_HOST}..."
fi

# Deploy each app — Dokku pulls the image and does zero-downtime swap
for app in server assistant notifications web; do
  image="${REGISTRY}/${IMAGE_PREFIX}/${app}:${TAG}"
  echo "→ Deploying ${app} from ${image}"
  dokku_cmd git:from-image "${app}" "${image}"
done

echo "✓ All apps deployed"
