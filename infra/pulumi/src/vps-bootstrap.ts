import * as pulumi from "@pulumi/pulumi";
import * as command from "@pulumi/command";

interface VpsBootstrapArgs {
  /** Main connection used for all operations: root + SSH private key */
  connection: command.types.input.remote.ConnectionArgs;
  /** SSH user for the main connection (usually root) */
  sshUser: string;
  /** Initial SSH user with password access on a fresh VPS (e.g. ubuntu) */
  initUser: string;
  /** Password for the initial SSH user — used only for key installation */
  initPassword: pulumi.Input<string>;
  /** ED25519 public key to install in /root/.ssh/authorized_keys */
  deployPublicKey: pulumi.Input<string>;
}

/**
 * Bootstrap a fresh Ubuntu VPS with Docker, Dokku, UFW, and fail2ban.
 * All commands are idempotent — safe to re-run.
 * 1gb documentation https://www.1gb.ru/api.json
 */
export class VpsBootstrap extends pulumi.ComponentResource {
  public readonly ready: pulumi.Output<string>;
  public readonly sslhReady: pulumi.Output<string>;

  constructor(name: string, args: VpsBootstrapArgs, opts?: pulumi.ComponentResourceOptions) {
    super("myapp:infra:VpsBootstrap", name, {}, opts);

    const conn = args.connection;

    // ── Step 0: Install SSH key via ubuntu+password (mirrors setup-vps.sh) ──
    // Fresh 1gb.ru Ubuntu 24.04 VPS: root SSH password auth is blocked by
    // PermitRootLogin prohibit-password. Connect as ubuntu with password,
    // install the generated pubkey into /root/.ssh, then all further commands
    // use root + private key.
    const installKey = new command.remote.Command(`${name}-install-key`, {
      connection: {
        host: args.connection.host,
        user: args.initUser,
        port: args.connection.port,
        password: args.initPassword,
      },
      create: pulumi.interpolate`set -e
# Write the setup script to a temp file (avoids stdin conflict with sudo -S)
cat > /tmp/setup-root-key.sh << 'SETUPEOF'
#!/bin/bash
set -e
mkdir -p /root/.ssh && chmod 700 /root/.ssh
echo '${args.deployPublicKey}' >> /root/.ssh/authorized_keys
sort -u /root/.ssh/authorized_keys -o /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
# Enable root login via key (prohibit-password = key only, no password)
if grep -q '^PermitRootLogin' /etc/ssh/sshd_config; then
  sed -i 's/^PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
else
  echo 'PermitRootLogin prohibit-password' >> /etc/ssh/sshd_config
fi
systemctl restart ssh || systemctl restart sshd
echo "ssh-key-installed"
SETUPEOF
echo '${args.initPassword}' | sudo -S bash /tmp/setup-root-key.sh
rm -f /tmp/setup-root-key.sh
`,
    }, { parent: this });

    // ── Disk expand ───────────────────────────────────────────────────────
    // 1gb.ru VPS: root LV is only ~7.7G by default; a second 20G disk (vdb)
    // is attached but unused. Extend the VG + LV + fs to use it.
    const diskExpand = new command.remote.Command(`${name}-disk-expand`, {
      connection: conn,
      create: `
        if lsblk /dev/vdb &>/dev/null && ! pvs /dev/vdb &>/dev/null 2>&1; then
          pvcreate /dev/vdb
          vgextend ubuntu-vg /dev/vdb
          lvextend -l +100%FREE /dev/ubuntu-vg/ubuntu-lv
          resize2fs /dev/ubuntu-vg/ubuntu-lv
          echo "disk-expanded"
        else
          echo "disk-expand-skipped"
        fi
      `,
    }, { parent: this, dependsOn: [installKey] });

    // ── Docker ────────────────────────────────────────────────────────────
    const docker = new command.remote.Command(`${name}-docker`, {
      connection: conn,
      create: `
        if ! command -v docker &>/dev/null; then
          curl -fsSL https://get.docker.com | sh
        fi
        systemctl enable --now docker
        echo "docker-ok"
      `,
    }, { parent: this, dependsOn: [diskExpand] });

    // ── Dokku ─────────────────────────────────────────────────────────────
    const dokku = new command.remote.Command(`${name}-dokku`, {
      connection: conn,
      create: `
        if ! command -v dokku &>/dev/null && ! test -f /usr/bin/dokku; then
          systemctl stop unattended-upgrades 2>/dev/null || true
          while fuser /var/lib/dpkg/lock-frontend &>/dev/null 2>&1; do sleep 2; done
          wget -NP . https://dokku.com/install/v0.35.15/bootstrap.sh
          sudo DOKKU_TAG=v0.35.15 bash bootstrap.sh
          rm -f bootstrap.sh
        fi
        /usr/bin/dokku version || true
      `,
    }, { parent: this, dependsOn: [docker] });

    // ── Dokku plugins ─────────────────────────────────────────────────────
    const plugins = new command.remote.Command(`${name}-dokku-plugins`, {
      connection: conn,
      create: `
        # Postgres
        if ! dokku plugin:list | grep -q postgres; then
          sudo dokku plugin:install https://github.com/dokku/dokku-postgres.git postgres
        fi
        # Let's Encrypt
        if ! dokku plugin:list | grep -q letsencrypt; then
          sudo dokku plugin:install https://github.com/dokku/dokku-letsencrypt.git letsencrypt
        fi
        # Loki (log shipping)
        if ! docker plugin ls | grep -q loki; then
          docker plugin install grafana/loki-docker-driver:3.0.0 --alias loki --grant-all-permissions || true
        fi
        echo "plugins-ok"
      `,
    }, { parent: this, dependsOn: [dokku] });

    // ── UFW firewall ──────────────────────────────────────────────────────
    new command.remote.Command(`${name}-ufw`, {
      connection: conn,
      create: `
        if command -v ufw &>/dev/null; then
          ufw default deny incoming
          ufw default allow outgoing
          ufw allow 22/tcp
          ufw allow 80/tcp
          ufw allow 443/tcp
          ufw --force enable
        fi
        echo "ufw-ok"
      `,
    }, { parent: this, dependsOn: [installKey] });

    // ── fail2ban ──────────────────────────────────────────────────────────
    new command.remote.Command(`${name}-fail2ban`, {
      connection: conn,
      create: `
        if ! command -v fail2ban-client &>/dev/null; then
          apt-get install -y -q fail2ban
        fi
        systemctl enable --now fail2ban
        echo "fail2ban-ok"
      `,
    }, { parent: this, dependsOn: [installKey] });

    // ── SSH hardening ─────────────────────────────────────────────────────
    // Password auth is disabled (key-only). Root login kept as prohibit-password
    // (key auth only for root) since we connect as root with the generated key.
    new command.remote.Command(`${name}-ssh-harden`, {
      connection: conn,
      create: [
        `sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config`,
        `sed -i 's/^PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config`,
        `systemctl restart ssh || systemctl restart sshd`,
        `echo "ssh-hardened"`,
      ].join(" && "),
    }, { parent: this, dependsOn: [installKey] });

    // ── sslh: multiplex SSH + HTTPS on port 443 ───────────────────────────
    // GitHub Actions runners come from Azure IPs that some VPS providers
    // block on port 22. Port 443 is guaranteed open (HTTPS). sslh routes:
    //   SSH traffic  → 127.0.0.1:22   (sshd)
    //   TLS traffic  → 127.0.0.1:8443 (nginx, moved off 0.0.0.0:443)
    //
    // Ubuntu's apt sslh package (1.x) uses /etc/default/sslh for DAEMON_OPTS,
    // NOT a .cfg file. nginx app vhost configs are patched to 127.0.0.1:8443.
    const sslhSetup = new command.remote.Command(`${name}-sslh`, {
      connection: conn,
      create: `
        set -euo pipefail

        DEBIAN_FRONTEND=noninteractive apt-get install -y -q sslh

        # /etc/default/sslh is the correct config location for Ubuntu sslh 1.x
        printf 'DAEMON=/usr/sbin/sslh\nDAEMON_OPTS=--user sslh -p 0.0.0.0:443 --ssh 127.0.0.1:22 --tls 127.0.0.1:8443\n' \
          > /etc/default/sslh

        # Move nginx HTTPS listeners from 0.0.0.0:443 → 127.0.0.1:8443
        for f in /home/dokku/*/nginx.conf; do
          [ -f "$f" ] || continue
          sed -i 's/listen[[:space:]]\\+443 ssl/listen 127.0.0.1:8443 ssl/g' "$f"
          sed -i 's/listen[[:space:]]\\+\\[::]:443 ssl/listen [::1]:8443 ssl/g' "$f"
        done
        nginx -t && systemctl restart nginx

        systemctl enable sslh
        systemctl restart sslh
        sleep 2
        systemctl is-active sslh && echo "sslh-ok" || (journalctl -u sslh -n 20 >&2 && exit 1)
      `,
      update: `
        printf 'DAEMON=/usr/sbin/sslh\nDAEMON_OPTS=--user sslh -p 0.0.0.0:443 --ssh 127.0.0.1:22 --tls 127.0.0.1:8443\n' \
          > /etc/default/sslh
        systemctl restart sslh
        systemctl is-active sslh && echo "sslh-ok"
      `,
    }, { parent: this, dependsOn: [plugins] });

    this.sslhReady = sslhSetup.stdout;
    this.ready = plugins.stdout;
    this.registerOutputs({ ready: this.ready, sslhReady: this.sslhReady });
  }
}
