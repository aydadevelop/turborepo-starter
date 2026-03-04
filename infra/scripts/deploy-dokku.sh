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

SSH_HOST="${SSH_HOST:?SSH_HOST is required}"
SSH_USER="${SSH_USER:-root}"
SSH_PORT="${SSH_PORT:-22}"
SSH_KEY_FILE="${SSH_KEY_FILE:-}"
REGISTRY="${REGISTRY:-ghcr.io}"
IMAGE_PREFIX="${IMAGE_PREFIX:?IMAGE_PREFIX is required}"
GIT_SHA="${GIT_SHA:?GIT_SHA is required}"
TAG="sha-${GIT_SHA:0:7}"

ssh_cmd() {
  ssh -o StrictHostKeyChecking=no -p "${SSH_PORT}" \
    ${SSH_KEY_FILE:+-i "${SSH_KEY_FILE}"} \
    "${SSH_USER}@${SSH_HOST}" "$@"
}

echo "Deploying tag ${TAG} to ${SSH_HOST}..."

# Deploy each app — Dokku pulls the image and does zero-downtime swap
for app in server assistant notifications web; do
  image="${REGISTRY}/${IMAGE_PREFIX}/${app}:${TAG}"
  echo "→ Deploying ${app} from ${image}"
  ssh_cmd "dokku git:from-image ${app} ${image}"
done

echo "✓ All apps deployed"
