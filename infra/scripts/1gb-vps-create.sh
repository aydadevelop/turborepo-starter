#!/usr/bin/env bash
# 1gb-vps-create.sh — Create a VPS on 1gb.ru for staging/prod deployment.
#
# Usage:
#   bash infra/scripts/1gb-vps-create.sh staging
#   bash infra/scripts/1gb-vps-create.sh production
#
# Requires:
#   ONE_GB_LOGIN, ONE_GB_OTP in env or infra/.env.1gb
#
# Outputs:
#   1. IP address (stdout)
#   2. Server ID in .vps/{ENV}.id
#   3. Waits for SSH to be ready
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

ENV="${1:-staging}"
if [[ "${ENV}" != "staging" && "${ENV}" != "production" ]]; then
  echo "Usage: $0 <staging|production>" >&2
  exit 1
fi

# Load 1gb credentials
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../../infra/.env.1gb"
if [[ -f "${ENV_FILE}" ]]; then
  set -a
  source "${ENV_FILE}"
  set +a
fi

[[ -n "${ONE_GB_LOGIN:-}" && -n "${ONE_GB_OTP:-}" ]] || {
  echo "Error: ONE_GB_LOGIN and ONE_GB_OTP required" >&2
  echo "Copy infra/.env.1gb.example to infra/.env.1gb and fill in values" >&2
  exit 1
}

# Source auth script to get TOKEN
source "${SCRIPT_DIR}/1gb-auth.sh"

API_BASE="https://www.1gb.ru/api"
VDS_NAME="app-${ENV}-$(date +%s)"

echo "Creating VPS: ${VDS_NAME} (${ENV})" >&2

# VPS config: 2 vCPU, 4 GB RAM, 40 GB SSD, Ubuntu 24.04 (nv.lin.ubuntu2404v1)
CREATE_RESP=$(curl -sf "${API_BASE}/vds/create" \
  --get \
  --data-urlencode "_token_=${TOKEN}" \
  --data-urlencode "type=vds.dynamic.nv" \
  --data-urlencode "cr_hvcpu=2" \
  --data-urlencode "cr_hvmem=4096" \
  --data-urlencode "cr_hvdsk=40" \
  --data-urlencode "cr_ssd1=1" \
  --data-urlencode "template=nv.lin.ubuntu2404v1")

SERVER_ID=$(echo "${CREATE_RESP}" | jq -r '.[0]')
if [[ -z "${SERVER_ID}" || "${SERVER_ID}" == "null" || "${SERVER_ID}" == ERROR* ]]; then
  echo "Error: Failed to create VPS. Response: ${CREATE_RESP}" >&2
  exit 1
fi

echo "VPS created: ID=${SERVER_ID}" >&2
mkdir -p .vps
echo "${SERVER_ID}" > ".vps/${ENV}.id"

# Poll until ready (max 10 minutes, 5s intervals)
echo "Waiting for VPS to boot..." >&2
ATTEMPTS=0
MAX_ATTEMPTS=120

while [[ ${ATTEMPTS} -lt ${MAX_ATTEMPTS} ]]; do
  STATUS_RESP=$(curl -sf "${API_BASE}/vds/list?_token_=${TOKEN}&_key_=${SERVER_ID}")

  PENDING=$(echo "${STATUS_RESP}" | jq -r '.[0].pending_creation // "1"')

  # ip_sys1 is often empty for NV/KVM; use /vds/ip/list as authoritative source
  IP=""
  if [[ "${PENDING}" == "0" ]]; then
    IP=$(curl -sf "${API_BASE}/vds/ip/list?_token_=${TOKEN}&_key_=${SERVER_ID}" | jq -r '.[0].ip // empty')
  fi

  if [[ "${PENDING}" == "0" && -n "${IP}" && "${IP}" != "null" ]]; then
    echo "${IP}" > ".vps/${ENV}.ip"
    echo "VPS ready at ${IP}" >&2

    # Wait for SSH port
    echo "Waiting for SSH (port 22)..." >&2
    for i in {1..30}; do
      if nc -z "${IP}" 22 2>/dev/null; then
        echo "SSH ready!" >&2
        echo "${IP}"
        exit 0
      fi
      sleep 2
    done

    echo "SSH not yet ready — VPS may still be booting. IP: ${IP}" >&2
    echo "${IP}"
    exit 0
  fi

  echo "  Status: ${STATUS:-pending} (attempt $((ATTEMPTS+1))/${MAX_ATTEMPTS})" >&2
  ((ATTEMPTS++))
  sleep 5
done

echo "Error: VPS did not boot within 10 minutes" >&2
exit 1
