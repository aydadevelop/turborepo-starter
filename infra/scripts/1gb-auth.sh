#!/usr/bin/env bash
# 1gb-auth.sh — Authenticate with 1gb.ru API and get session token.
#
# Usage:
#   source infra/scripts/1gb-auth.sh
#   Creates $TOKEN in current shell for use by other scripts.
#
# Requires env vars (set in .env.1gb or pass before sourcing):
#   ONE_GB_LOGIN  — your 1gb.ru account login
#   ONE_GB_OTP    — API password from cabinet → «пароли на ресурсы»
#
# Auth flow (per https://www.1gb.ru/api-doc/):
#   1. GET /auth/start?login=... → ["salt"]
#   2. response = hex(md5(OTP + salt + "\n"))
#   3. GET /auth/login?login=...&salt=...&response=... → ["token"]
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

ONE_GB_LOGIN="${ONE_GB_LOGIN:-}"
ONE_GB_OTP="${ONE_GB_OTP:-}"
ONE_GB_TOKEN="${ONE_GB_TOKEN:-}"

# Use stored token directly if available
if [[ -n "${ONE_GB_TOKEN}" ]]; then
  export TOKEN="${ONE_GB_TOKEN}"
  echo "[1gb-auth] Using stored token." >&2
else
  [[ -n "${ONE_GB_LOGIN}" ]] || { echo "Error: ONE_GB_LOGIN not set" >&2; exit 1; }
  [[ -n "${ONE_GB_OTP}" ]]   || { echo "Error: ONE_GB_OTP not set (or set ONE_GB_TOKEN)" >&2; exit 1; }

  API_BASE="https://www.1gb.ru/api"

  # Step 1: Get salt
  echo "[1gb-auth] Getting salt for ${ONE_GB_LOGIN}..." >&2
  SALT=$(curl -sf "${API_BASE}/auth/start?login=${ONE_GB_LOGIN}" | jq -r '.[0]')

  [[ -n "${SALT}" && "${SALT}" != "null" ]] || {
    echo "Error: Failed to get salt from 1gb.ru" >&2
    exit 1
  }

  # Step 2: Compute response = md5(OTP + salt + "\n")
  RESPONSE=$(printf '%s%s\n' "${ONE_GB_OTP}" "${SALT}" | md5)

  # Step 3: Login and get token
  echo "[1gb-auth] Authenticating..." >&2
  AUTH_RESP=$(curl -sf "${API_BASE}/auth/login?login=${ONE_GB_LOGIN}&salt=${SALT}&response=${RESPONSE}")
  TOKEN=$(echo "${AUTH_RESP}" | jq -r '.[0]')

  [[ -n "${TOKEN}" && "${TOKEN}" != "null" && "${TOKEN}" != ERROR* ]] || {
    echo "Error: Failed to get token. Response: ${AUTH_RESP}" >&2
    exit 1
  }

  export TOKEN="${TOKEN}"
  echo "[1gb-auth] Token acquired." >&2
fi
