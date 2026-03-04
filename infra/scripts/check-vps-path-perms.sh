#!/usr/bin/env bash
# check-vps-path-perms.sh — Inspect remote deploy-path permissions over SSH.
#
# Usage:
#   bash infra/scripts/check-vps-path-perms.sh --env staging
#   bash infra/scripts/check-vps-path-perms.sh --env staging --path /srv/app --path /srv/app-staging

set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: bash infra/scripts/check-vps-path-perms.sh [options]

Options:
  --env <staging|production|name>   Environment name (default: staging)
  --host <ip-or-hostname>           VPS SSH host (default: from .vps/<env>.ip)
  --user <ssh-user>                 SSH user (default: deploy)
  --port <ssh-port>                 SSH port (default: 22)
  --key <path>                      SSH private key path (default: ~/.ssh/deploy_<env>)
  --path <absolute-path>            Remote path to inspect (repeatable)
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
PATHS=()

if [[ -n "${DEPLOY_PATH:-}" ]]; then
  PATHS+=("${DEPLOY_PATH}")
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
    --path)
      PATHS+=("${2:-}")
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

if [[ ${#PATHS[@]} -eq 0 ]]; then
  PATHS=("/srv/app" "/srv/app-staging")
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

PATHS_JOINED=""
for p in "${PATHS[@]}"; do
  if [[ -z "${PATHS_JOINED}" ]]; then
    PATHS_JOINED="${p}"
  else
    PATHS_JOINED="${PATHS_JOINED},${p}"
  fi
done

echo "== VPS Path Permissions =="
echo "env=${ENV_NAME} host=${HOST} user=${SSH_USER_NAME} port=${SSH_PORT_VALUE}"
echo "paths=${PATHS_JOINED}"
echo

ssh "${SSH_OPTS[@]}" "${SSH_USER_NAME}@${HOST}" "PATHS_CSV='${PATHS_JOINED}' bash -s" <<'REMOTE_PERMS'
set -euo pipefail

show_stat() {
  local p="$1"
  if [[ -e "${p}" ]]; then
    stat -c '%A %U:%G %n' "${p}"
  else
    echo "missing ${p}"
  fi
}

echo "== Identity =="
echo "whoami: $(whoami)"
id
echo

echo "== Parent directories =="
for p in / /srv /srv/app /srv/app-staging; do
  show_stat "${p}"
done
echo

can_write_dir() {
  local dir="$1"
  local probe="${dir}/.perm_probe_$$"
  if ( : > "${probe}" ) >/dev/null 2>&1; then
    rm -f "${probe}" || true
    echo "writable"
  else
    echo "not-writable"
  fi
}

IFS=',' read -r -a target_paths <<< "${PATHS_CSV}"
echo "== Path checks =="
for p in "${target_paths[@]}"; do
  parent="$(dirname "${p}")"
  echo "-- ${p} --"
  show_stat "${parent}"
  if [[ -d "${p}" ]]; then
    show_stat "${p}"
    echo "dir-write-test: $(can_write_dir "${p}")"
  else
    echo "path-missing: ${p}"
    parent_probe="${parent}/.create_probe_$$"
    if ( : > "${parent_probe}" ) >/dev/null 2>&1; then
      rm -f "${parent_probe}" || true
      echo "parent-write-test: writable (can create ${p})"
    else
      echo "parent-write-test: not-writable (cannot create ${p})"
    fi
  fi
  echo
done
REMOTE_PERMS
