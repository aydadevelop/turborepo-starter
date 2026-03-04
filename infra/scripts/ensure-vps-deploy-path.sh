#!/usr/bin/env bash
# ensure-vps-deploy-path.sh — Create/fix deploy path ownership via admin SSH user.
#
# Usage examples:
#   bash infra/scripts/ensure-vps-deploy-path.sh --env staging --path /srv/app-staging --admin-user ubuntu --admin-key ~/.ssh/id_rsa
#   bash infra/scripts/ensure-vps-deploy-path.sh --host 1.2.3.4 --path /srv/app --admin-user root --admin-key ~/.ssh/id_ed25519

set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: bash infra/scripts/ensure-vps-deploy-path.sh [options]

Options:
  --env <staging|production|name>   Environment name (default: staging)
  --host <ip-or-hostname>           VPS SSH host (default: from .vps/<env>.ip)
  --port <ssh-port>                 SSH port (default: 22)
  --path <absolute-path>            Deploy path to ensure (required)
  --deploy-user <user>              Runtime deploy owner user (default: deploy)
  --admin-user <user>               SSH admin user that can sudo (required)
  --admin-key <path>                SSH key for admin user (required)
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
SSH_PORT_VALUE="${SSH_PORT:-22}"
DEPLOY_PATH_VALUE=""
DEPLOY_USER_VALUE="${DEPLOY_USER:-deploy}"
ADMIN_USER_VALUE="${ADMIN_USER:-}"
ADMIN_KEY_VALUE="${ADMIN_KEY_PATH:-}"

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
    --port)
      SSH_PORT_VALUE="${2:-}"
      shift 2
      ;;
    --path)
      DEPLOY_PATH_VALUE="${2:-}"
      shift 2
      ;;
    --deploy-user)
      DEPLOY_USER_VALUE="${2:-}"
      shift 2
      ;;
    --admin-user)
      ADMIN_USER_VALUE="${2:-}"
      shift 2
      ;;
    --admin-key)
      ADMIN_KEY_VALUE="${2:-}"
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

[[ -n "${HOST}" ]] || { echo "Error: missing --host (or .vps/${ENV_NAME}.ip)." >&2; exit 1; }
[[ -n "${DEPLOY_PATH_VALUE}" ]] || { echo "Error: missing required --path." >&2; exit 1; }
[[ -n "${ADMIN_USER_VALUE}" ]] || { echo "Error: missing required --admin-user." >&2; exit 1; }
[[ -n "${ADMIN_KEY_VALUE}" ]] || { echo "Error: missing required --admin-key." >&2; exit 1; }

ADMIN_KEY_VALUE="$(expand_path "${ADMIN_KEY_VALUE}")"
[[ -f "${ADMIN_KEY_VALUE}" ]] || { echo "Error: admin key not found: ${ADMIN_KEY_VALUE}" >&2; exit 1; }

require_cmd ssh

SSH_OPTS=(
  -i "${ADMIN_KEY_VALUE}"
  -p "${SSH_PORT_VALUE}"
  -o BatchMode=yes
  -o ConnectTimeout=12
  -o StrictHostKeyChecking=accept-new
)

echo "== Ensure VPS Deploy Path =="
echo "host=${HOST} admin_user=${ADMIN_USER_VALUE} deploy_user=${DEPLOY_USER_VALUE} path=${DEPLOY_PATH_VALUE}"
echo

ssh "${SSH_OPTS[@]}" "${ADMIN_USER_VALUE}@${HOST}" \
  "DEPLOY_PATH='${DEPLOY_PATH_VALUE}' DEPLOY_USER='${DEPLOY_USER_VALUE}' bash -s" <<'REMOTE_ENSURE'
set -euo pipefail

run_root() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

run_root mkdir -p "${DEPLOY_PATH}/infra" "${DEPLOY_PATH}/traefik"
run_root touch "${DEPLOY_PATH}/traefik/acme.json"
run_root chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${DEPLOY_PATH}"
run_root chmod 755 "${DEPLOY_PATH}"
run_root chmod 600 "${DEPLOY_PATH}/traefik/acme.json"

echo "Result:"
stat -c '%A %U:%G %n' "${DEPLOY_PATH}"
stat -c '%A %U:%G %n' "${DEPLOY_PATH}/traefik/acme.json"
REMOTE_ENSURE

echo
echo "Deploy path ensured."
