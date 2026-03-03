#!/usr/bin/env bash
# bootstrap-vps.sh — Idempotent VPS setup for docker-compose deployments.
#
# Run once (or re-run safely at any time) on a fresh Ubuntu 22.04/24.04 VPS:
#   curl -fsSL https://raw.githubusercontent.com/YOUR_ORG/YOUR_REPO/main/infra/scripts/bootstrap-vps.sh | bash
#
# Or after cloning the repo:
#   bash infra/scripts/bootstrap-vps.sh
#
# Required env vars (set before running or export in shell):
#   DEPLOY_USER   — system user that will own and run the app (default: deploy)
#   DEPLOY_PATH   — directory for the app on the server (default: /srv/app)
#   GHCR_TOKEN    — GitHub PAT with read:packages scope (for docker pull from GHCR)
#   GHCR_USER     — GitHub username or org that owns the packages
#   DOMAIN        — primary domain, used for Traefik SSL (e.g. example.com)
#   ACME_EMAIL    — email for Let's Encrypt notifications
#
# What this script does (all steps are idempotent):
#   1. Install Docker + Compose plugin
#   2. Install Loki Docker log driver plugin
#   3. Create deploy user + add to docker group
#   4. Configure UFW firewall (80, 443, 22)
#   5. Login to GHCR
#   6. Create app directory + copy docker-compose files
#   7. Create .env template if absent
#   8. Enable Docker to start on boot
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-deploy}"
DEPLOY_PATH="${DEPLOY_PATH:-/srv/app}"
GHCR_TOKEN="${GHCR_TOKEN:-}"
GHCR_USER="${GHCR_USER:-}"
DOMAIN="${DOMAIN:-localhost}"
ACME_EMAIL="${ACME_EMAIL:-admin@${DOMAIN}}"
LOKI_DRIVER_VERSION="${LOKI_DRIVER_VERSION:-3.0.0}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "${GREEN}[bootstrap]${NC} $*"; }
warn()    { echo -e "${YELLOW}[bootstrap]${NC} $*"; }
error()   { echo -e "${RED}[bootstrap]${NC} $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || error "Run as root (sudo bash bootstrap-vps.sh)"
[[ "${DEPLOY_USER}" != "root" ]] || error "DEPLOY_USER cannot be 'root' — choose a non-root service user (e.g. deploy)"

# ── 0. Wait for dpkg lock (unattended-upgrades on fresh Ubuntu VMs) ───────────
info "Stopping unattended-upgrades and waiting for dpkg lock..."
systemctl stop unattended-upgrades 2>/dev/null || true
# Kill any lingering apt/dpkg processes
while fuser /var/lib/dpkg/lock-frontend &>/dev/null; do
  echo "  dpkg locked — waiting 2s..."
  sleep 2
done
info "dpkg lock free"

# ── 1. Docker ─────────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  info "Installing Docker..."
  # NOTE: piping to sh is the official Docker install method; review the script
  # at https://get.docker.com before running on sensitive systems.
  curl -fsSL https://get.docker.com | sh
else
  info "Docker already installed: $(docker --version)"
fi

systemctl enable --now docker

# ── 2. Loki Docker log driver ─────────────────────────────────────────────────
if ! docker plugin ls | grep -q "loki"; then
  info "Installing Loki Docker log driver v${LOKI_DRIVER_VERSION}..."
  docker plugin install \
    "grafana/loki-docker-driver:${LOKI_DRIVER_VERSION}" \
    --alias loki \
    --grant-all-permissions
else
  info "Loki log driver already installed"
fi

# ── 3. Deploy user ────────────────────────────────────────────────────────────
if ! id "${DEPLOY_USER}" &>/dev/null; then
  info "Creating user '${DEPLOY_USER}'..."
  useradd --system --create-home --shell /bin/bash "${DEPLOY_USER}"
fi
usermod -aG docker "${DEPLOY_USER}"
info "User '${DEPLOY_USER}' is in the docker group"

# ── 4. Firewall ───────────────────────────────────────────────────────────────
if command -v ufw &>/dev/null; then
  info "Configuring UFW..."
  # NOTE: We do NOT reset UFW — that would wipe any custom rules already in place.
  # Rules are added idempotently; re-running the script is safe.
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow 22/tcp   comment "SSH"
  ufw allow 80/tcp   comment "HTTP (Traefik)"
  ufw allow 443/tcp  comment "HTTPS (Traefik)"
  # Grafana — only via SSH tunnel in production; open here for initial setup
  ufw allow 3110/tcp comment "Grafana (close after initial setup)"
  ufw --force enable
  ufw status verbose
else
  warn "ufw not found — configure your firewall manually (allow 22, 80, 443)"
fi

# ── 4b. fail2ban (SSH brute-force protection) ─────────────────────────────────
if ! command -v fail2ban-client &>/dev/null; then
  info "Installing fail2ban..."
  apt-get install -y -q fail2ban
  # Default jail already protects SSH; enable and start.
  systemctl enable --now fail2ban
else
  info "fail2ban already installed: $(fail2ban-client --version 2>&1 | head -1)"
fi

# ── 5. GHCR login ─────────────────────────────────────────────────────────────
if [[ -n "${GHCR_TOKEN}" && -n "${GHCR_USER}" ]]; then
  info "Logging into GHCR as ${GHCR_USER}..."
  echo "${GHCR_TOKEN}" | docker login ghcr.io -u "${GHCR_USER}" --password-stdin
else
  warn "GHCR_TOKEN/GHCR_USER not set — skipping registry login."
  warn "Run manually: echo \$GHCR_TOKEN | docker login ghcr.io -u \$GHCR_USER --password-stdin"
fi

# ── 6. App directory ──────────────────────────────────────────────────────────
info "Setting up app directory at ${DEPLOY_PATH}..."
mkdir -p "${DEPLOY_PATH}"/{traefik,infra/grafana/provisioning/datasources}
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${DEPLOY_PATH}"

# Copy compose files from the repo if we're running inside it
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

for f in docker-compose.yml docker-compose.prod.yml; do
  if [[ -f "${REPO_ROOT}/${f}" ]]; then
    cp "${REPO_ROOT}/${f}" "${DEPLOY_PATH}/${f}"
    info "Copied ${f} to ${DEPLOY_PATH}"
  fi
done

# Copy Grafana provisioning
if [[ -d "${REPO_ROOT}/infra/grafana" ]]; then
  cp -r "${REPO_ROOT}/infra/grafana" "${DEPLOY_PATH}/infra/"
  info "Copied Grafana provisioning"
fi

# ── 7. .env template ──────────────────────────────────────────────────────────
ENV_FILE="${DEPLOY_PATH}/.env"
if [[ ! -f "${ENV_FILE}" ]]; then
  info "Creating .env template at ${ENV_FILE}..."
  cat > "${ENV_FILE}" <<ENV
# Generated by bootstrap-vps.sh — fill in all values before starting

# ── Registry images (set by deploy-docker.yml CI) ───────────────────────────
SERVER_IMAGE=ghcr.io/${GHCR_USER:-your-org}/your-repo/server:latest
ASSISTANT_IMAGE=ghcr.io/${GHCR_USER:-your-org}/your-repo/assistant:latest
NOTIFICATIONS_IMAGE=ghcr.io/${GHCR_USER:-your-org}/your-repo/notifications:latest
WEB_IMAGE=ghcr.io/${GHCR_USER:-your-org}/your-repo/web:latest

# ── App ──────────────────────────────────────────────────────────────────────
BETTER_AUTH_SECRET=change-me-to-a-long-random-secret
BETTER_AUTH_URL=https://${DOMAIN}
SERVER_URL=https://api.${DOMAIN}
CORS_ORIGIN=https://${DOMAIN}

# ── Database ─────────────────────────────────────────────────────────────────
POSTGRES_USER=postgres
POSTGRES_PASSWORD=change-me
POSTGRES_DB=myapp

# ── AI ───────────────────────────────────────────────────────────────────────
OPEN_ROUTER_API_KEY=
AI_MODEL=openai/gpt-4o-mini

# ── Email (SMTP) ─────────────────────────────────────────────────────────────
# In dev the smtp4dev container is used automatically (SMTP_HOST=smtp-server).
# In production, override these to use a real relay (SES, Postmark, SendGrid…)
SMTP_HOST=smtp-server
SMTP_PORT=25
# SMTP_USER=
# SMTP_PASS=
# SMTP_FROM=noreply@${DOMAIN}

# ── Traefik ──────────────────────────────────────────────────────────────────
DOMAIN=${DOMAIN}
ACME_EMAIL=${ACME_EMAIL}

# ── Observability ────────────────────────────────────────────────────────────
LOKI_URL=http://loki:3100/loki/api/v1/push
GRAFANA_PASSWORD=change-me
GRAFANA_PORT=3110

# ── Alerting ─────────────────────────────────────────────────────────────────
# Telegram: create a bot via @BotFather, then get the chat ID via:
#   curl https://api.telegram.org/bot<TOKEN>/getUpdates
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
# Email for critical alert fallback (uses the SMTP settings above)
GRAFANA_ALERT_EMAIL=ops@${DOMAIN}
ENV
  chown "${DEPLOY_USER}:${DEPLOY_USER}" "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
  warn ".env template created — edit ${ENV_FILE} before running docker compose!"
else
  info ".env already exists — skipping template creation"
fi

# ── 8. Traefik acme.json ──────────────────────────────────────────────────────
ACME_FILE="${DEPLOY_PATH}/traefik/acme.json"
if [[ ! -f "${ACME_FILE}" ]]; then
  touch "${ACME_FILE}"
  chmod 600 "${ACME_FILE}"
  chown "${DEPLOY_USER}:${DEPLOY_USER}" "${ACME_FILE}"
  info "Created traefik/acme.json for Let's Encrypt storage"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo
echo -e "${GREEN}✓ Bootstrap complete!${NC}"
echo
echo "Next steps:"
echo "  1. Edit ${DEPLOY_PATH}/.env — fill in all secrets"
echo "  2. Close Grafana port after initial setup: ufw delete allow 3110/tcp"
echo "  3. First deploy: cd ${DEPLOY_PATH} && docker compose -f docker-compose.yml -f docker-compose.prod.yml pull && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --wait"
echo "  4. Or just push to main — GHA will deploy automatically via SSH"
echo
echo "Tip: verify SSH key auth is enabled and disable password login:"
echo "  sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config"
echo "  sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config"
echo "  systemctl restart sshd   # only after confirming your SSH key works!"
echo
echo "Grafana: https://grafana.${DOMAIN}  (or http://<ip>:3110 temporarily)"
echo "smtp4dev UI (dev only):  http://<host>:5025"
