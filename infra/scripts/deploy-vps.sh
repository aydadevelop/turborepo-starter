#!/usr/bin/env bash
# deploy-vps.sh — Run Docker Compose deploy on VPS over SSH.
#
# Usage:
#   bash infra/scripts/deploy-vps.sh --env staging --deploy-path /srv/app
#
# What it does remotely:
#   1. Ensures docker-compose files exist in DEPLOY_PATH
#   2. Ensures Loki docker log driver is installed (idempotent)
#   3. docker compose pull
#   4. Runs DB migrations (best-effort, non-blocking)
#   5. docker compose up -d --remove-orphans --wait

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=infra/scripts/lib/vps-common.sh
source "${SCRIPT_DIR}/lib/vps-common.sh"
ROOT_DIR="$(vps_repo_root_from_script_dir "${SCRIPT_DIR}")"

usage() {
  cat <<'USAGE'
Usage: bash infra/scripts/deploy-vps.sh [options]

Options:
  --env <staging|production|name>   Environment name (default: staging)
  --host <ip-or-hostname>           VPS SSH host (default: from .vps/<env>.ip)
  --user <ssh-user>                 SSH user (default: deploy)
  --port <ssh-port>                 SSH port (default: 22)
  --key <path>                      SSH private key path (default: auto-detect, else SSH agent)
  --deploy-path <path>              Remote deploy path (default: /srv/app)
  --ghcr-user <user>                GHCR username/org for docker login (default: $GHCR_USER)
  --no-ensure-loki                  Skip automatic loki driver install
  -h, --help                        Show help
USAGE
}

ENV_NAME="staging"
HOST="${SSH_HOST:-}"
SSH_USER_NAME="${SSH_USER:-deploy}"
SSH_PORT_VALUE="${SSH_PORT:-22}"
KEY_PATH="${SSH_KEY_PATH:-}"
DEPLOY_PATH_VALUE="${DEPLOY_PATH:-/srv/app}"
ENSURE_LOKI="1"
LOKI_DRIVER_VERSION="${LOKI_DRIVER_VERSION:-3.0.0}"
GHCR_USER_VALUE="${GHCR_USER:-}"
GHCR_TOKEN_VALUE="${GHCR_TOKEN:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      ENV_NAME="${2:-}"
      shift 2
      ;;
    --host)
      HOST="${2:-}"
      shift 2
      ;;
    --user)
      SSH_USER_NAME="${2:-}"
      shift 2
      ;;
    --port)
      SSH_PORT_VALUE="${2:-}"
      shift 2
      ;;
    --key)
      KEY_PATH="${2:-}"
      shift 2
      ;;
    --deploy-path)
      DEPLOY_PATH_VALUE="${2:-}"
      shift 2
      ;;
    --ghcr-user)
      GHCR_USER_VALUE="${2:-}"
      shift 2
      ;;
    --no-ensure-loki)
      ENSURE_LOKI="0"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Error: unknown option '$1'" >&2
      usage >&2
      exit 1
      ;;
  esac
done

HOST="$(vps_resolve_host "${HOST}" "${ROOT_DIR}" "${ENV_NAME}")"
KEY_PATH="$(vps_resolve_key_path "${KEY_PATH}" "${ENV_NAME}")"
vps_require_cmd ssh

SSH_OPTS=(
  -p "${SSH_PORT_VALUE}"
  -o BatchMode=yes
  -o ConnectTimeout=12
  -o StrictHostKeyChecking=accept-new
)

if [[ -n "${KEY_PATH}" ]]; then
  SSH_OPTS=(-i "${KEY_PATH}" "${SSH_OPTS[@]}")
fi

echo "== VPS Deploy =="
echo "env=${ENV_NAME} host=${HOST} user=${SSH_USER_NAME} port=${SSH_PORT_VALUE} deploy_path=${DEPLOY_PATH_VALUE}"
echo "ensure_loki=${ENSURE_LOKI} loki_driver_version=${LOKI_DRIVER_VERSION}"
if [[ -n "${KEY_PATH}" ]]; then
  echo "key=${KEY_PATH}"
else
  echo "key=ssh-agent/default-ssh-config"
fi
if [[ -n "${GHCR_USER_VALUE}" && -n "${GHCR_TOKEN_VALUE}" ]]; then
  echo "ghcr_login=enabled user=${GHCR_USER_VALUE}"
else
  echo "ghcr_login=skipped (set GHCR_USER + GHCR_TOKEN to enable)"
fi
echo

ssh "${SSH_OPTS[@]}" "${SSH_USER_NAME}@${HOST}" \
  "DEPLOY_PATH='${DEPLOY_PATH_VALUE}' ENSURE_LOKI='${ENSURE_LOKI}' LOKI_DRIVER_VERSION='${LOKI_DRIVER_VERSION}' GHCR_USER='${GHCR_USER_VALUE}' GHCR_TOKEN='${GHCR_TOKEN_VALUE}' bash -s" <<'REMOTE_DEPLOY'
set -euo pipefail

cd "${DEPLOY_PATH}"

if [[ ! -f docker-compose.yml || ! -f docker-compose.prod.yml ]]; then
  echo "ERROR: docker-compose files are missing in ${DEPLOY_PATH}"
  exit 2
fi

if [[ "${ENSURE_LOKI}" == "1" ]]; then
  PLUGIN_REF=""
  if docker plugin inspect loki >/dev/null 2>&1; then
    PLUGIN_REF="loki"
  elif docker plugin inspect loki:latest >/dev/null 2>&1; then
    PLUGIN_REF="loki:latest"
  fi

  if [[ -n "${PLUGIN_REF}" ]]; then
    echo "Loki plugin already present (${PLUGIN_REF})."
    docker plugin enable "${PLUGIN_REF}" >/dev/null 2>&1 || true
  else
    echo "Installing loki docker plugin v${LOKI_DRIVER_VERSION}..."
    docker plugin install "grafana/loki-docker-driver:${LOKI_DRIVER_VERSION}" --alias loki --grant-all-permissions
  fi
fi

if [[ -n "${GHCR_USER:-}" && -n "${GHCR_TOKEN:-}" ]]; then
  echo "Logging into GHCR as ${GHCR_USER}..."
  echo "${GHCR_TOKEN}" | docker login ghcr.io -u "${GHCR_USER}" --password-stdin >/dev/null
fi

echo "Pulling images..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull

echo "Running migrations (best-effort)..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm --no-deps server node dist/index.mjs db:migrate || true

echo "Starting/updating services..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --remove-orphans --wait --wait-timeout 180

echo "Running containers:"
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
REMOTE_DEPLOY

echo
echo "Deploy command completed successfully."
