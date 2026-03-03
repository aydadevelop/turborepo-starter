#!/usr/bin/env bash
# cf-dns-staging.sh — Create/update Cloudflare DNS records for staging environment.
#
# Usage:
#   bash infra/scripts/cf-dns-staging.sh <VPS_IP>
#   # or auto-reads from .vps/staging.ip:
#   bash infra/scripts/cf-dns-staging.sh
#
# Requires (in infra/.env.cloudflare or env):
#   CF_API_TOKEN  — Cloudflare API token with Zone:DNS:Edit permission
#   CF_ZONE_ID    — Zone ID for ayda.studio (Cloudflare dashboard → zone overview)
#
# Creates A records (proxied=false, DNS-only) for:
#   staging.ayda.studio
#   api.staging.ayda.studio
#   assistant.staging.ayda.studio
#   notifications.staging.ayda.studio
#
# NOTE: Records are DNS-only (not proxied) — required for Traefik TLS challenge.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${SCRIPT_DIR}/../.."

# Load Cloudflare credentials
CF_ENV="${SCRIPT_DIR}/../.env.cloudflare"
if [[ -f "${CF_ENV}" ]]; then
  set -a; source "${CF_ENV}"; set +a
fi

CF_API_TOKEN="${CLOUDFLARE_API_TOKEN:-${CF_API_TOKEN:-}}"
CF_ZONE_ID="${CLOUDFLARE_ZONE_ID:-${CF_ZONE_ID:-}}"

[[ -n "${CF_API_TOKEN}" ]] || { echo "Error: CLOUDFLARE_API_TOKEN not set (add to infra/.env.cloudflare)" >&2; exit 1; }
[[ -n "${CF_ZONE_ID}" ]]   || { echo "Error: CLOUDFLARE_ZONE_ID not set (add to infra/.env.cloudflare)" >&2; exit 1; }

# Get VPS IP
VPS_IP="${1:-}"
if [[ -z "${VPS_IP}" ]]; then
  IP_FILE="${ROOT_DIR}/.vps/staging.ip"
  [[ -f "${IP_FILE}" ]] || { echo "Error: no IP given and .vps/staging.ip not found" >&2; exit 1; }
  VPS_IP="$(cat "${IP_FILE}")"
fi

echo "[cf-dns] VPS IP: ${VPS_IP}"
echo "[cf-dns] Zone:  ${CF_ZONE_ID}"

CF_API="https://api.cloudflare.com/client/v4"

# Subdomains to create (all → same VPS IP, DNS-only)
STAGING_BASE="staging.ayda.studio"
SUBDOMAINS=(
  "${STAGING_BASE}"
  "api.${STAGING_BASE}"
  "assistant.${STAGING_BASE}"
  "notifications.${STAGING_BASE}"
)

upsert_record() {
  local NAME="$1"
  local IP="$2"

  # Check if record already exists
  EXISTING=$(curl -sf -X GET "${CF_API}/zones/${CF_ZONE_ID}/dns_records?type=A&name=${NAME}" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -H "Content-Type: application/json")

  RECORD_ID=$(echo "${EXISTING}" | python3 -c "import json,sys; r=json.load(sys.stdin)['result']; print(r[0]['id'] if r else '')" 2>/dev/null || true)

  PAYLOAD=$(python3 -c "import json; print(json.dumps({'type':'A','name':'${NAME}','content':'${IP}','ttl':60,'proxied':False}))")

  if [[ -n "${RECORD_ID}" ]]; then
    # Update existing
    RESP=$(curl -sf -X PUT "${CF_API}/zones/${CF_ZONE_ID}/dns_records/${RECORD_ID}" \
      -H "Authorization: Bearer ${CF_API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data "${PAYLOAD}")
    SUCCESS=$(echo "${RESP}" | python3 -c "import json,sys; print(json.load(sys.stdin).get('success','false'))" 2>/dev/null)
    echo "[cf-dns] UPDATED  ${NAME} → ${IP} (success=${SUCCESS})"
  else
    # Create new
    RESP=$(curl -sf -X POST "${CF_API}/zones/${CF_ZONE_ID}/dns_records" \
      -H "Authorization: Bearer ${CF_API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data "${PAYLOAD}")
    SUCCESS=$(echo "${RESP}" | python3 -c "import json,sys; print(json.load(sys.stdin).get('success','false'))" 2>/dev/null)
    echo "[cf-dns] CREATED  ${NAME} → ${IP} (success=${SUCCESS})"
  fi
}

for SUB in "${SUBDOMAINS[@]}"; do
  upsert_record "${SUB}" "${VPS_IP}"
done

echo ""
echo "[cf-dns] Done! Records set (DNS-only, not proxied — required for Traefik TLS)."
echo ""
echo "Next: once VPS is ready, run:"
echo "  DOMAIN=staging.ayda.studio GHCR_USER=aydadevelop bash infra/scripts/setup-vps.sh ${VPS_IP} staging"
