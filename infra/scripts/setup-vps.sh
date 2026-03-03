#!/usr/bin/env bash
# setup-vps.sh — One-time VPS configuration after provisioning.
#
# Usage:
#   bash infra/scripts/setup-vps.sh <VPS_IP> [ENV]
#
#   ENV defaults to "staging". Pass "production" for prod.
#
# What it does:
#   1. Copies your local SSH public key → root access
#   2. Runs bootstrap-vps.sh remotely (installs Docker, firewall, deploy user)
#   3. Generates a dedicated deploy SSH keypair for GitHub Actions
#   4. Installs the deploy public key on the VPS
#   5. Prints all GitHub Actions secrets to set
#
# Requires:
#   - VPS root accessible via password (1gb.ru emails it on VPS creation)
#   - DOMAIN, ACME_EMAIL, GHCR_USER, GHCR_TOKEN env vars (or prompted)
#   - sshpass: brew install sshpass (for password-based first login)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

VPS_IP="${1:-}"
ENV="${2:-staging}"

[[ -n "${VPS_IP}" ]] || { echo "Usage: $0 <VPS_IP> [staging|production]" >&2; exit 1; }

# Prompt for required vars if not set
DOMAIN="${DOMAIN:-}"
if [[ -z "${DOMAIN}" ]]; then
  read -rp "DOMAIN (e.g. staging.example.com): " DOMAIN
fi
ACME_EMAIL="${ACME_EMAIL:-admin@${DOMAIN}}"
GHCR_USER="${GHCR_USER:-}"
if [[ -z "${GHCR_USER}" ]]; then
  read -rp "GHCR_USER (GitHub username/org): " GHCR_USER
fi
GHCR_TOKEN="${GHCR_TOKEN:-}"
if [[ -z "${GHCR_TOKEN}" ]]; then
  read -rsp "GHCR_TOKEN (GitHub PAT with read:packages): " GHCR_TOKEN
  echo
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_PUBKEY="${HOME}/.ssh/id_rsa.pub"
DEPLOY_KEY_PATH="${HOME}/.ssh/deploy_${ENV}"

echo ""
echo "═══════════════════════════════════════════════"
echo " Setting up ${ENV} VPS at ${VPS_IP}"
echo "═══════════════════════════════════════════════"
echo ""

# ── Step 1: Copy local public key to VPS root ─────────────────────────────────
echo "Step 1: Installing your local SSH key on the VPS..."
echo "  (You'll be prompted for the root password from the 1gb.ru welcome email)"
echo ""
ssh-copy-id -i "${LOCAL_PUBKEY}" -o StrictHostKeyChecking=no "root@${VPS_IP}"
echo "✓ Local SSH key installed — passwordless root access enabled"
echo ""

# ── Step 2: Run bootstrap remotely ───────────────────────────────────────────
echo "Step 2: Running bootstrap script on VPS..."
echo ""
ssh -o StrictHostKeyChecking=no "root@${VPS_IP}" \
  DEPLOY_USER=deploy \
  DEPLOY_PATH=/srv/app \
  DOMAIN="${DOMAIN}" \
  ACME_EMAIL="${ACME_EMAIL}" \
  GHCR_USER="${GHCR_USER}" \
  GHCR_TOKEN="${GHCR_TOKEN}" \
  bash -s < "${SCRIPT_DIR}/bootstrap-vps.sh"
echo ""
echo "✓ Bootstrap complete"
echo ""

# ── Step 3: Generate deploy SSH keypair ──────────────────────────────────────
echo "Step 3: Generating deploy SSH keypair for GitHub Actions..."
if [[ ! -f "${DEPLOY_KEY_PATH}" ]]; then
  ssh-keygen -t ed25519 -f "${DEPLOY_KEY_PATH}" -N "" -C "github-actions-${ENV}"
  echo "✓ Deploy keypair created at ${DEPLOY_KEY_PATH}"
else
  echo "  Deploy key already exists at ${DEPLOY_KEY_PATH} — reusing"
fi
echo ""

# ── Step 4: Install deploy public key on VPS ─────────────────────────────────
echo "Step 4: Installing deploy public key on VPS (deploy user)..."
DEPLOY_PUBKEY=$(cat "${DEPLOY_KEY_PATH}.pub")
ssh -o StrictHostKeyChecking=no "root@${VPS_IP}" bash -s <<EOF
  mkdir -p /home/deploy/.ssh
  chmod 700 /home/deploy/.ssh
  if ! grep -qF "${DEPLOY_PUBKEY}" /home/deploy/.ssh/authorized_keys 2>/dev/null; then
    echo "${DEPLOY_PUBKEY}" >> /home/deploy/.ssh/authorized_keys
    echo "  Added deploy public key"
  else
    echo "  Deploy public key already present"
  fi
  chmod 600 /home/deploy/.ssh/authorized_keys
  chown -R deploy:deploy /home/deploy/.ssh
EOF
echo "✓ Deploy key installed for 'deploy' user"
echo ""

# ── Step 5: Print GitHub Actions secrets ─────────────────────────────────────
echo "═══════════════════════════════════════════════"
echo " GitHub Actions Secrets — copy these now"
echo " gh secret set -e ${ENV^} <NAME>"
echo "═══════════════════════════════════════════════"
echo ""
echo "SSH_HOST=${VPS_IP}"
echo "SSH_USER=deploy"
echo "SSH_PORT=22"
echo "DEPLOY_PATH=/srv/app"
echo ""
echo "SSH_PRIVATE_KEY:"
cat "${DEPLOY_KEY_PATH}"
echo ""
echo "═══════════════════════════════════════════════"
echo ""
echo "To set secrets automatically, run:"
echo ""
echo "  ENV=${ENV^}"
echo "  VPS_IP=${VPS_IP}"
echo ""
cat <<'CMDS'
  gh secret set --env "${ENV}" SSH_HOST --body "${VPS_IP}"
  gh secret set --env "${ENV}" SSH_USER --body "deploy"
  gh secret set --env "${ENV}" SSH_PORT --body "22"
  gh secret set --env "${ENV}" DEPLOY_PATH --body "/srv/app"
  gh secret set --env "${ENV}" SSH_PRIVATE_KEY < "${DEPLOY_KEY_PATH}"
CMDS
echo ""
echo "✓ VPS setup complete! The server is ready for GitHub Actions deployment."
echo ""
echo "Next: push to main → GitHub Actions will build and deploy to ${VPS_IP}"
