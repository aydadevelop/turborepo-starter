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

expand_path() {
  local p="$1"
  if [[ "${p}" == "~" ]]; then
    printf '%s\n' "${HOME}"
    return
  fi
  if [[ "${p}" == "~/"* ]]; then
    printf '%s\n' "${HOME}/${p#~/}"
    return
  fi
  printf '%s\n' "${p}"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Error: required command '$1' is not installed." >&2
    exit 1
  }
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

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

if [[ -z "${HOST}" ]]; then
  ip_file="${ROOT_DIR}/.vps/${ENV_NAME}.ip"
  if [[ -f "${ip_file}" ]]; then
    HOST="$(tr -d '[:space:]' < "${ip_file}")"
  fi
fi

if [[ -z "${HOST}" ]]; then
  echo "Error: SSH host is not set. Use --host or create .vps/${ENV_NAME}.ip" >&2
  exit 1
fi

if [[ ${#DEPLOY_PATHS[@]} -eq 0 ]]; then
  DEPLOY_PATHS+=("/srv/app")
fi

# Normalize and deduplicate deploy paths while preserving order.
declare -a UNIQUE_PATHS=()
for raw_path in "${DEPLOY_PATHS[@]}"; do
  normalized_path="$(expand_path "${raw_path}")"
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

if [[ -z "${KEY_PATH}" ]]; then
  if [[ -f "${HOME}/.ssh/deploy_${ENV_NAME}" ]]; then
    KEY_PATH="${HOME}/.ssh/deploy_${ENV_NAME}"
  else
    KEY_PATH="${HOME}/.ssh/id_rsa"
  fi
fi

KEY_PATH="$(expand_path "${KEY_PATH}")"
if [[ ! -f "${KEY_PATH}" ]]; then
  echo "Error: SSH key not found at '${KEY_PATH}'" >&2
  exit 1
fi

require_cmd ssh
require_cmd scp
require_cmd tar

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
