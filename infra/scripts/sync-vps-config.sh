#!/usr/bin/env bash
# sync-vps-config.sh — Upload deploy config files to VPS in an idempotent way.
#
# Usage examples:
#   bash infra/scripts/sync-vps-config.sh --env staging --deploy-path /srv/app-staging
#   bash infra/scripts/sync-vps-config.sh --env staging --deploy-path /srv/app --deploy-path /srv/app-staging
#
# Files synced:
#   - docker-compose.yml
#   - docker-compose.prod.yml
#   - infra/grafana/** (provisioning)
#   - creates traefik/acme.json if missing

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=infra/scripts/lib/vps-common.sh
source "${SCRIPT_DIR}/lib/vps-common.sh"
ROOT_DIR="$(vps_repo_root_from_script_dir "${SCRIPT_DIR}")"

usage() {
  cat <<'USAGE'
Usage: bash infra/scripts/sync-vps-config.sh [options]

Options:
  --env <staging|production|name>   Environment name (default: staging)
  --host <ip-or-hostname>           VPS SSH host (default: from .vps/<env>.ip)
  --user <ssh-user>                 SSH user (default: deploy)
  --port <ssh-port>                 SSH port (default: 22)
  --key <path>                      SSH private key path (default: ~/.ssh/deploy_<env>)
  --deploy-path <path>              Remote deploy path (repeatable, default: /srv/app)
  -h, --help                        Show help
USAGE
}

ENV_NAME="staging"
HOST="${SSH_HOST:-}"
SSH_USER_NAME="${SSH_USER:-deploy}"
SSH_PORT_VALUE="${SSH_PORT:-22}"
KEY_PATH="${SSH_KEY_PATH:-}"
DEPLOY_PATHS=()

if [[ -n "${DEPLOY_PATH:-}" ]]; then
  DEPLOY_PATHS+=("${DEPLOY_PATH}")
fi

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
      DEPLOY_PATHS+=("${2:-}")
      shift 2
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

if [[ ${#DEPLOY_PATHS[@]} -eq 0 ]]; then
  DEPLOY_PATHS+=("/srv/app")
fi

# Normalize and deduplicate deploy paths while preserving order.
declare -a UNIQUE_PATHS=()
for raw_path in "${DEPLOY_PATHS[@]}"; do
  normalized_path="$(vps_expand_path "${raw_path}")"
  if [[ -z "${normalized_path}" ]]; then
    continue
  fi

  seen="0"
  for existing_path in "${UNIQUE_PATHS[@]-}"; do
    if [[ "${existing_path}" == "${normalized_path}" ]]; then
      seen="1"
      break
    fi
  done

  if [[ "${seen}" == "0" ]]; then
    UNIQUE_PATHS+=("${normalized_path}")
  fi
done
DEPLOY_PATHS=("${UNIQUE_PATHS[@]}")

KEY_PATH="$(vps_resolve_key_path "${KEY_PATH}" "${ENV_NAME}")"
vps_require_cmd ssh
vps_require_cmd scp
vps_require_cmd tar

if [[ ! -f "${ROOT_DIR}/docker-compose.yml" || ! -f "${ROOT_DIR}/docker-compose.prod.yml" ]]; then
  echo "Error: docker compose files not found in repo root." >&2
  exit 1
fi
if [[ ! -d "${ROOT_DIR}/infra/grafana" ]]; then
  echo "Error: infra/grafana directory not found." >&2
  exit 1
fi

SSH_OPTS=(
  -i "${KEY_PATH}"
  -p "${SSH_PORT_VALUE}"
  -o BatchMode=yes
  -o ConnectTimeout=12
  -o StrictHostKeyChecking=accept-new
)

SCP_OPTS=(
  -i "${KEY_PATH}"
  -P "${SSH_PORT_VALUE}"
  -o BatchMode=yes
  -o ConnectTimeout=12
  -o StrictHostKeyChecking=accept-new
)

echo "== VPS Config Sync =="
echo "env=${ENV_NAME} host=${HOST} user=${SSH_USER_NAME} port=${SSH_PORT_VALUE}"
echo "key=${KEY_PATH}"
echo "paths=${DEPLOY_PATHS[*]}"
echo

for path in "${DEPLOY_PATHS[@]}"; do
  echo "-- syncing ${path} --"

  if ! ssh "${SSH_OPTS[@]}" "${SSH_USER_NAME}@${HOST}" "mkdir -p '${path}' '${path}/infra' '${path}/traefik' && touch '${path}/traefik/acme.json' && chmod 600 '${path}/traefik/acme.json'"; then
    echo "ERROR: failed to prepare deploy path '${path}' on ${HOST}." >&2
    echo "Hint: ensure '${SSH_USER_NAME}' has write permission, or set DEPLOY_PATH to an existing writable directory (e.g. /srv/app)." >&2
    exit 1
  fi

  if ! scp "${SCP_OPTS[@]}" \
    "${ROOT_DIR}/docker-compose.yml" \
    "${ROOT_DIR}/docker-compose.prod.yml" \
    "${SSH_USER_NAME}@${HOST}:${path}/"; then
    echo "ERROR: failed to upload docker-compose files to '${path}'." >&2
    exit 1
  fi

  if ! tar -C "${ROOT_DIR}/infra" -czf - grafana | \
    ssh "${SSH_OPTS[@]}" "${SSH_USER_NAME}@${HOST}" "rm -rf '${path}/infra/grafana' && mkdir -p '${path}/infra' && tar -xzf - -C '${path}/infra'"; then
    echo "ERROR: failed to sync Grafana provisioning files to '${path}/infra/grafana'." >&2
    exit 1
  fi

  ssh "${SSH_OPTS[@]}" "${SSH_USER_NAME}@${HOST}" "ls -la '${path}' | sed -n '1,20p'; ls -la '${path}/infra/grafana' | sed -n '1,20p'"
done

echo
echo "Sync complete."
