#!/usr/bin/env bash
# cleanup-vps-docker.sh — Reclaim Docker disk space on VPS over SSH.
#
# Usage:
#   bash infra/scripts/cleanup-vps-docker.sh --env staging
#   bash infra/scripts/cleanup-vps-docker.sh --env staging --include-volumes

set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: bash infra/scripts/cleanup-vps-docker.sh [options]

Options:
  --env <staging|production|name>   Environment name (default: staging)
  --host <ip-or-hostname>           VPS SSH host (default: from .vps/<env>.ip)
  --user <ssh-user>                 SSH user (default: deploy)
  --port <ssh-port>                 SSH port (default: 22)
  --key <path>                      SSH private key path (default: ~/.ssh/deploy_<env>)
  --include-volumes                 Also prune dangling volumes
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
INCLUDE_VOLUMES="0"

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
    --include-volumes)
      INCLUDE_VOLUMES="1"
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

SSH_OPTS=(
  -i "${KEY_PATH}"
  -p "${SSH_PORT_VALUE}"
  -o BatchMode=yes
  -o ConnectTimeout=12
  -o StrictHostKeyChecking=accept-new
)

echo "== VPS Docker Cleanup =="
echo "env=${ENV_NAME} host=${HOST} user=${SSH_USER_NAME} port=${SSH_PORT_VALUE} include_volumes=${INCLUDE_VOLUMES}"
echo

ssh "${SSH_OPTS[@]}" "${SSH_USER_NAME}@${HOST}" "INCLUDE_VOLUMES='${INCLUDE_VOLUMES}' bash -s" <<'REMOTE_CLEANUP'
set -euo pipefail

echo "Disk usage before:"
df -h
echo

echo "Docker usage before:"
docker system df || true
echo

echo "Pruning stopped containers..."
docker container prune -f || true
echo "Pruning unused images..."
docker image prune -af || true
echo "Pruning unused build cache..."
docker builder prune -af || true
echo "Pruning unused networks..."
docker network prune -f || true
if [[ "${INCLUDE_VOLUMES}" == "1" ]]; then
  echo "Pruning unused volumes..."
  docker volume prune -f || true
fi

echo
echo "Docker usage after:"
docker system df || true
echo
echo "Disk usage after:"
df -h
REMOTE_CLEANUP

echo
echo "Cleanup complete."
