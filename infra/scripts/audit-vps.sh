#!/usr/bin/env bash
# audit-vps.sh — Validate VPS deploy prerequisites and runtime status over SSH.
#
# Usage examples:
#   bash infra/scripts/audit-vps.sh --env staging
#   bash infra/scripts/audit-vps.sh --env staging --deploy-path /srv/app-staging --domain staging.ayda.studio
#
# Defaults:
#   ENV=staging
#   HOST=.vps/<env>.ip
#   USER=deploy
#   PORT=22
#   KEY=~/.ssh/deploy_<env> (fallback: ~/.ssh/id_rsa)
#   DEPLOY_PATH=/srv/app
#
# Exit code:
#   0 = all critical checks passed
#   1 = one or more critical checks failed

set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: bash infra/scripts/audit-vps.sh [options]

Options:
  --env <staging|production|name>   Environment name (default: staging)
  --host <ip-or-hostname>           VPS SSH host (default: from .vps/<env>.ip)
  --user <ssh-user>                 SSH user (default: deploy)
  --port <ssh-port>                 SSH port (default: 22)
  --key <path>                      SSH private key path (default: ~/.ssh/deploy_<env>)
  --deploy-path <path>              Remote deploy path (default: /srv/app)
  --domain <fqdn>                   Public base domain to probe (default: staging.ayda.studio for staging)
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
DEPLOY_PATH_VALUE="${DEPLOY_PATH:-/srv/app}"
DOMAIN_VALUE="${DOMAIN:-}"

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
    --domain)
      DOMAIN_VALUE="${2:-}"
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

if [[ -z "${DOMAIN_VALUE}" ]]; then
  if [[ "${ENV_NAME}" == "staging" ]]; then
    DOMAIN_VALUE="staging.ayda.studio"
  fi
fi

require_cmd ssh
require_cmd curl

SSH_OPTS=(
  -i "${KEY_PATH}"
  -p "${SSH_PORT_VALUE}"
  -o BatchMode=yes
  -o ConnectTimeout=12
  -o StrictHostKeyChecking=accept-new
)

FAILURES=0
WARNINGS=0

pass() {
  echo "[PASS] $*"
}

warn() {
  echo "[WARN] $*"
  WARNINGS=$((WARNINGS + 1))
}

fail() {
  echo "[FAIL] $*"
  FAILURES=$((FAILURES + 1))
}

echo "== VPS Audit =="
echo "env=${ENV_NAME} host=${HOST} user=${SSH_USER_NAME} port=${SSH_PORT_VALUE} deploy_path=${DEPLOY_PATH_VALUE}"
echo "key=${KEY_PATH}"
echo

REMOTE_STATUS=0

set +e
ssh "${SSH_OPTS[@]}" "${SSH_USER_NAME}@${HOST}" "DEPLOY_PATH='${DEPLOY_PATH_VALUE}' bash -s" <<'REMOTE_AUDIT'
set -euo pipefail

echo "== Remote host info =="
echo "whoami: $(whoami)"
echo "host: $(hostname)"
echo "date(utc): $(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo
echo "== Docker =="
if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker is not installed"
  exit 20
fi
docker --version
docker compose version

echo
echo "== Docker Loki plugin =="
if docker plugin ls --format '{{.Name}}' | grep -qx 'loki'; then
  echo "loki plugin: installed"
else
  echo "WARN: loki plugin is missing"
fi

echo
echo "== Deploy path checks =="
TARGET_PATHS=("${DEPLOY_PATH}" "/srv/app" "/srv/app-staging")
SEEN=""
for path in "${TARGET_PATHS[@]}"; do
  [[ " ${SEEN} " == *" ${path} "* ]] && continue
  SEEN="${SEEN} ${path}"
  if [[ -d "${path}" ]]; then
    echo "[DIR] ${path}"
    for f in docker-compose.yml docker-compose.prod.yml .env; do
      if [[ -f "${path}/${f}" ]]; then
        echo "  [OK] ${f}"
      else
        echo "  [MISS] ${f}"
      fi
    done
  else
    echo "[MISS DIR] ${path}"
  fi
done

if [[ ! -f "${DEPLOY_PATH}/docker-compose.yml" || ! -f "${DEPLOY_PATH}/docker-compose.prod.yml" ]]; then
  echo "ERROR: compose files are missing in DEPLOY_PATH=${DEPLOY_PATH}"
  exit 30
fi

if [[ ! -f "${DEPLOY_PATH}/.env" ]]; then
  echo "ERROR: .env is missing in DEPLOY_PATH=${DEPLOY_PATH}"
  exit 31
fi

echo
echo "== .env key presence =="
MISSING_ENV=0
for key in DOMAIN ACME_EMAIL BETTER_AUTH_SECRET POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB SERVER_IMAGE ASSISTANT_IMAGE NOTIFICATIONS_IMAGE WEB_IMAGE; do
  if grep -q "^${key}=" "${DEPLOY_PATH}/.env"; then
    echo "  [OK] ${key}"
  else
    echo "  [MISS] ${key}"
    MISSING_ENV=1
  fi
done

echo
echo "== .env non-secret snapshot =="
grep -E '^(DOMAIN|ACME_EMAIL|NODE_ENV|SERVER_IMAGE|ASSISTANT_IMAGE|NOTIFICATIONS_IMAGE|WEB_IMAGE)=' "${DEPLOY_PATH}/.env" || true

if [[ "${MISSING_ENV}" -ne 0 ]]; then
  echo "ERROR: one or more required env keys are missing"
  exit 32
fi

echo
echo "== Compose config sanity =="
cd "${DEPLOY_PATH}"
docker compose -f docker-compose.yml -f docker-compose.prod.yml config -q
echo "docker compose config: OK"

echo
echo "== Compose services =="
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps

echo
echo "== Container health =="
ids="$(docker compose -f docker-compose.yml -f docker-compose.prod.yml ps -q || true)"
if [[ -z "${ids}" ]]; then
  echo "ERROR: no compose containers found"
  exit 33
fi

BAD_HEALTH=0
for id in ${ids}; do
  name="$(docker inspect --format '{{.Name}}' "${id}" | sed 's#^/##')"
  state="$(docker inspect --format '{{.State.Status}}' "${id}")"
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}}' "${id}")"
  image="$(docker inspect --format '{{.Config.Image}}' "${id}")"
  echo "  ${name}: state=${state} health=${health} image=${image}"

  if [[ "${state}" != "running" ]]; then
    BAD_HEALTH=1
  fi
  if [[ "${health}" != "n/a" && "${health}" != "healthy" ]]; then
    BAD_HEALTH=1
  fi
done

if [[ "${BAD_HEALTH}" -ne 0 ]]; then
  echo "ERROR: one or more containers are not healthy"
  exit 34
fi

echo
echo "== Host listeners (22/80/443/3110) =="
ss -ltn | grep -E ':(22|80|443|3110)\b' || true
REMOTE_AUDIT
REMOTE_STATUS=$?
set -e

if [[ "${REMOTE_STATUS}" -ne 0 ]]; then
  fail "Remote audit failed with exit code ${REMOTE_STATUS}"
else
  pass "Remote audit checks passed"
fi

if [[ -n "${DOMAIN_VALUE}" ]]; then
  echo
  echo "== Public endpoint probes =="

  if command -v dig >/dev/null 2>&1; then
    for fqdn in "${DOMAIN_VALUE}" "api.${DOMAIN_VALUE}" "assistant.${DOMAIN_VALUE}" "notifications.${DOMAIN_VALUE}" "grafana.${DOMAIN_VALUE}"; do
      ips="$(dig +short "${fqdn}" A | tr '\n' ' ' | sed 's/[[:space:]]*$//')"
      if [[ -n "${ips}" ]]; then
        echo "[DNS] ${fqdn} -> ${ips}"
      else
        warn "No A record resolved for ${fqdn}"
      fi
    done
  else
    warn "dig not found; skipping DNS checks"
  fi

  probe_code() {
    local url="$1"
    local code
    code="$(curl -k -sS -L -o /dev/null -w '%{http_code}' --max-time 15 "${url}" 2>/dev/null || true)"
    if [[ -z "${code}" ]]; then
      code="000"
    fi
    printf '%s' "${code}"
  }

  check_http_ok() {
    local url="$1"
    local code
    code="$(probe_code "${url}")"
    if [[ "${code}" == "000" ]]; then
      fail "${url} unreachable"
      return
    fi
    if [[ "${code}" -ge 500 ]]; then
      fail "${url} returned HTTP ${code}"
      return
    fi
    pass "${url} returned HTTP ${code}"
  }

  check_http_200() {
    local url="$1"
    local code
    code="$(probe_code "${url}")"
    if [[ "${code}" == "200" ]]; then
      pass "${url} returned HTTP 200"
    else
      fail "${url} returned HTTP ${code} (expected 200)"
    fi
  }

  check_http_ok "https://${DOMAIN_VALUE}/"
  check_http_200 "https://api.${DOMAIN_VALUE}/health"
  check_http_200 "https://assistant.${DOMAIN_VALUE}/health"
  check_http_200 "https://notifications.${DOMAIN_VALUE}/health"
  check_http_ok "https://grafana.${DOMAIN_VALUE}/"
else
  warn "No domain specified; skipping public endpoint probes"
fi

echo
if [[ "${FAILURES}" -ne 0 ]]; then
  echo "Audit result: FAILED (${FAILURES} failure(s), ${WARNINGS} warning(s))"
  exit 1
fi

echo "Audit result: PASSED (${WARNINGS} warning(s))"
