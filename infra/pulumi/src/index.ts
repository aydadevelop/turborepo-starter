import * as pulumi from "@pulumi/pulumi";
import * as command from "@pulumi/command";
import * as tls from "@pulumi/tls";
import { OneGbVps } from "./onegb-vps";
import { VpsBootstrap } from "./vps-bootstrap";
import { DokkuApps } from "./dokku-apps";
import { DnsRecords } from "./dns";

const config = new pulumi.Config();
const vpsConfig = new pulumi.Config("vps");
const appConfig = new pulumi.Config("app");
const ghcrConfig = new pulumi.Config("ghcr");

const domain = config.require("domain");
const sshUser = vpsConfig.get("user") ?? "root";
const sshPort = Number(vpsConfig.get("sshPort") ?? "22");

// Helper: return secret or empty string for optional config
const optionalSecret = (key: string) =>
  appConfig.getSecret(key) ?? pulumi.output("");

// ── Step 0: Create VPS on 1gb.ru ────────────────────────────────────────────
const vps = new OneGbVps("staging-vps", {
  token: vpsConfig.getSecret("oneGbToken"),
  vcpu: 2,
  memoryMb: 4096,
  diskGb: 40,
});

// IP flows from VPS creation → connection → everything else
const vpsIp = vps.ip;

// ── Generate SSH keypair for server access ───────────────────────────────────
// This keypair is installed on the VPS during bootstrap and synced to CI.
// On a fresh 1gb.ru Ubuntu 24.04 VPS, root SSH password auth is blocked;
// we connect as ubuntu+password first, install this key, then use root+key.
const deployKey = new tls.PrivateKey("deploy-key", {
  algorithm: "ED25519",
});

// Main connection: root + generated private key (used after key installation)
const connection: command.types.input.remote.ConnectionArgs = {
  host: vpsIp,
  user: sshUser,
  port: sshPort,
  privateKey: deployKey.privateKeyOpenssh,
};

// ── Step 1: Bootstrap VPS (Docker, Dokku, UFW, fail2ban) ────────────────────
const bootstrap = new VpsBootstrap("vps", {
  connection,
  sshUser,
  initUser: "ubuntu",
  initPassword: vps.password,
  deployPublicKey: deployKey.publicKeyOpenssh,
}, { dependsOn: [vps] });

// ── Step 2: Configure Dokku apps ────────────────────────────────────────────
const apps = new DokkuApps("apps", {
  connection,
  domain,
  ghcrUser: ghcrConfig.require("user"),
  ghcrToken: ghcrConfig.requireSecret("token"),
  postgresPassword: appConfig.requireSecret("postgresPassword"),
  env: {
    BETTER_AUTH_SECRET: appConfig.requireSecret("betterAuthSecret"),
    BETTER_AUTH_URL: `https://${domain}`,
    SERVER_URL: `https://api.${domain}`,
    CORS_ORIGIN: `https://${domain}`,
    OPEN_ROUTER_API_KEY: optionalSecret("openRouterApiKey"),
    OPENAI_API_KEY: optionalSecret("openaiApiKey"),
    AI_MODEL: appConfig.get("aiModel") ?? "openai/gpt-4o-mini",
    SMTP_FROM: appConfig.get("smtpFrom") ?? `noreply@${domain}`,
    SMTP_USER: appConfig.get("smtpUser") ?? "",
    SMTP_PASS: optionalSecret("smtpPass"),
    TELEGRAM_BOT_TOKEN: optionalSecret("telegramBotToken"),
    TELEGRAM_BOT_USERNAME: appConfig.get("telegramBotUsername") ?? "",
    TELEGRAM_CHAT_ID: optionalSecret("telegramChatId"),
    GRAFANA_PASSWORD: appConfig.requireSecret("grafanaPassword"),
    GRAFANA_ALERT_EMAIL: appConfig.get("grafanaAlertEmail") ?? `ops@${domain}`,
  },
}, { dependsOn: [bootstrap] });

// ── Step 3: DNS records (Cloudflare) ────────────────────────────────────────
const dns = new DnsRecords("dns", { domain, vpsIp });

// ── Step 4: Sync deployment config to GitHub Actions secrets ────────────────
const sshKeyB64 = deployKey.privateKeyOpenssh.apply(k => Buffer.from(k).toString("base64"));
const ghRepo = config.get("ghRepo") ?? "aydadevelop/turborepo-starter";
new command.local.Command("sync-ci-secrets", {
  create: pulumi.interpolate`
    gh secret set SSH_HOST           --repo "${ghRepo}" --body "${vpsIp}" && \
    gh secret set SSH_USER           --repo "${ghRepo}" --body "${sshUser}" && \
    gh secret set SSH_PORT           --repo "${ghRepo}" --body "${sshPort}" && \
    gh secret set SSH_PRIVATE_KEY_B64 --repo "${ghRepo}" --body "${sshKeyB64}"
  `,
  triggers: [vpsIp, sshUser, String(sshPort), sshKeyB64],
}, { dependsOn: [bootstrap, apps, dns] });


// ── Exports ─────────────────────────────────────────────────────────────────
export const ssh = {
  host: vpsIp,
  user: sshUser,
  port: sshPort,
};
export const deployPublicKey = deployKey.publicKeyOpenssh;
export const appUrls = {
  web: `https://${domain}`,
  api: `https://api.${domain}`,
  assistant: `https://assistant.${domain}`,
  grafana: `https://grafana.${domain}`,
};
