import * as command from "@pulumi/command";
import * as pulumi from "@pulumi/pulumi";
import * as tls from "@pulumi/tls";
import { DnsRecords } from "./dns";
import { DokkuApps } from "./dokku-apps";
import { OneGbVps } from "./onegb-vps";
import { StorageResources } from "./storage";
import { SupportEmailRouting } from "./support-email-routing";
import { VpsBootstrap } from "./vps-bootstrap";

const config = new pulumi.Config();
const vpsConfig = new pulumi.Config("vps");
const appConfig = new pulumi.Config("app");
const ghcrConfig = new pulumi.Config("ghcr");
const dnsConfig = new pulumi.Config("dns");
const storageConfig = new pulumi.Config("storage");
const supportEmailConfig = new pulumi.Config("supportEmail");

const domain = config.require("domain");
const sshUser = vpsConfig.get("user") ?? "root";
const sshPort = Number(vpsConfig.get("sshPort") ?? "22");
const zoneId = dnsConfig.require("zoneId");
const storageEnabled = storageConfig.getBoolean("enabled") ?? false;
const supportEmailEnabled = supportEmailConfig.getBoolean("enabled") ?? false;
const requireSupportEmailValue = (
	value: string | undefined,
	key: string,
): string => {
	if (!value || value.length === 0) {
		throw new Error(
			`supportEmail.${key} is required when supportEmail.enabled is true.`,
		);
	}

	return value;
};
const requireStorageValue = (
	value: string | undefined,
	key: string,
): string => {
	if (!value || value.length === 0) {
		throw new Error(`storage.${key} is required when storage.enabled is true.`);
	}

	return value;
};

const requireStorageSecret = (
	value: pulumi.Output<string> | undefined,
	key: string,
): pulumi.Output<string> => {
	if (!value) {
		throw new Error(`storage.${key} is required when storage.enabled is true.`);
	}

	return value;
};

const storageAccountId = storageEnabled
	? requireStorageValue(
			storageConfig.get("cloudflareAccountId") ??
				process.env.CLOUDFLARE_ACCOUNT_ID,
			"cloudflareAccountId",
		)
	: (storageConfig.get("cloudflareAccountId") ??
		process.env.CLOUDFLARE_ACCOUNT_ID ??
		"");
const storageBucketName =
	storageConfig.get("publicBucketName") ??
	`${domain.replace(/\./g, "-")}-listing-public-v1`;
const storagePublicDomain =
	storageConfig.get("publicDomain") ?? `media.${domain}`;
const supportEmailWorkerScriptName = supportEmailEnabled
	? requireSupportEmailValue(
			supportEmailConfig.get("workerScriptName"),
			"workerScriptName",
		)
	: (supportEmailConfig.get("workerScriptName") ?? "");
const supportEmailLocalPart = supportEmailConfig.get("localPart") ?? "support";

// Helper: return secret or empty string for optional config
const optionalSecret = (key: string) =>
	appConfig.getSecret(key) ?? pulumi.output("");

const storageS3AccessKeyId = storageEnabled
	? requireStorageSecret(
			storageConfig.getSecret("s3AccessKeyId"),
			"s3AccessKeyId",
		)
	: pulumi.output("");
const storageS3SecretAccessKey = storageEnabled
	? requireStorageSecret(
			storageConfig.getSecret("s3SecretAccessKey"),
			"s3SecretAccessKey",
		)
	: pulumi.output("");

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
const bootstrap = new VpsBootstrap(
	"vps",
	{
		connection,
		sshUser,
		initUser: "ubuntu",
		initPassword: vps.password,
		deployPublicKey: deployKey.publicKeyOpenssh,
	},
	{ dependsOn: [vps] },
);

// ── Step 2: Configure Dokku apps ────────────────────────────────────────────
const apps = new DokkuApps(
	"apps",
	{
		connection,
		domain,
		ghcrUser: ghcrConfig.require("user"),
		ghcrToken: ghcrConfig.requireSecret("token"),
		postgresPassword: appConfig.requireSecret("postgresPassword"),
		env: {
			BETTER_AUTH_SECRET: appConfig.requireSecret("betterAuthSecret"),
			// BETTER_AUTH_URL must point to the API server (where better-auth is hosted),
			// not the web frontend. Used as better-auth baseURL across all services.
			BETTER_AUTH_URL: `https://api.${domain}`,
			SERVER_URL: `https://api.${domain}`,
			CORS_ORIGIN: `https://${domain},https://api.${domain},https://assistant.${domain},https://notifications.${domain}`,
			OPEN_ROUTER_API_KEY: optionalSecret("openRouterApiKey"),
			OPENAI_API_KEY: optionalSecret("openaiApiKey"),
			AI_MODEL: appConfig.get("aiModel") ?? "openai/gpt-5-nano:nitro",
			SMTP_FROM: appConfig.get("smtpFrom") ?? `noreply@${domain}`,
			SMTP_USER: appConfig.get("smtpUser") ?? "",
			SMTP_PASS: optionalSecret("smtpPass"),
			TELEGRAM_BOT_TOKEN: optionalSecret("telegramBotToken"),
			TELEGRAM_BOT_USERNAME: appConfig.get("telegramBotUsername") ?? "",
			TELEGRAM_CHAT_ID: optionalSecret("telegramChatId"),
			GRAFANA_PASSWORD: appConfig.requireSecret("grafanaPassword"),
			GRAFANA_ALERT_EMAIL:
				appConfig.get("grafanaAlertEmail") ?? `ops@${domain}`,
			STORAGE_BACKEND: storageEnabled ? "s3" : "local-file",
			STORAGE_PUBLIC_BASE_URL: storageEnabled
				? pulumi.interpolate`https://${storagePublicDomain}`
				: "",
			STORAGE_LOCAL_DIR:
				storageConfig.get("localDir") ??
				"/var/lib/myapp/storage/listing-public-v1",
			STORAGE_S3_ENDPOINT: storageEnabled
				? `https://${storageAccountId}.r2.cloudflarestorage.com`
				: "",
			STORAGE_S3_REGION: storageConfig.get("region") ?? "auto",
			STORAGE_S3_BUCKET: storageEnabled ? storageBucketName : "",
			STORAGE_S3_ACCESS_KEY_ID: storageS3AccessKeyId,
			STORAGE_S3_SECRET_ACCESS_KEY: storageS3SecretAccessKey,
			STORAGE_S3_FORCE_PATH_STYLE: storageEnabled ? "0" : "1",
			STORAGE_SIGNED_URL_TTL_SECONDS:
				storageConfig.get("signedUrlTtlSeconds") ?? "900",
		},
	},
	{ dependsOn: [bootstrap] },
);

// ── Step 3: DNS records (Cloudflare) ────────────────────────────────────────
const dns = new DnsRecords("dns", { domain, vpsIp });

const storage = storageEnabled
	? new StorageResources(
			"storage",
			{
				accountId: storageAccountId,
				bucketName: storageBucketName,
				publicDomain: storagePublicDomain,
				zoneId,
			},
			{ dependsOn: [dns] },
		)
	: undefined;

const supportEmailRouting = supportEmailEnabled
	? new SupportEmailRouting(
			"support-email",
			{
				domain,
				localPart: supportEmailLocalPart,
				workerScriptName: supportEmailWorkerScriptName,
				zoneId,
			},
			{ dependsOn: [dns] },
		)
	: undefined;

// ── Step 4: Sync deployment config to GitHub Actions secrets ────────────────
const sshKeyB64 = deployKey.privateKeyOpenssh.apply((k) =>
	Buffer.from(k).toString("base64"),
);
const ghRepo = config.get("ghRepo") ?? "aydadevelop/turborepo-starter";
new command.local.Command(
	"sync-ci-secrets",
	{
		create: pulumi.interpolate`
    gh secret set SSH_HOST            --repo "${ghRepo}" --body "${vpsIp}" && \\
    gh secret set SSH_USER            --repo "${ghRepo}" --body "${sshUser}" && \\
    gh secret set SSH_PORT            --repo "${ghRepo}" --body "${sshPort}" && \\
    gh secret set SSH_PRIVATE_KEY_B64 --repo "${ghRepo}" --body "${sshKeyB64}" && \\
    gh secret set SSH_PRIVATE_KEY     --repo "${ghRepo}" --body "${deployKey.privateKeyOpenssh}" && \\
    gh secret set SSH_HOST_KEY        --repo "${ghRepo}" --body "$(ssh-keyscan -p 443 -t ed25519 ${vpsIp} 2>/dev/null)" && \\
    echo "${deployKey.publicKeyOpenssh}" | ssh -i /tmp/vps_key -o StrictHostKeyChecking=no root@${vpsIp} 'dokku ssh-keys:add github-actions 2>/dev/null || true'
  `,
		triggers: [vpsIp, sshUser, String(sshPort), sshKeyB64],
	},
	{ dependsOn: [bootstrap, apps, dns] },
);

// ── Exports ─────────────────────────────────────────────────────────────────
export const ssh = {
	host: vpsIp,
	user: sshUser,
	port: sshPort,
};
export const deployPublicKey = deployKey.publicKeyOpenssh;
export const deployPrivateKeyB64 = pulumi.secret(sshKeyB64);
export const appUrls = {
	web: `https://${domain}`,
	api: `https://api.${domain}`,
	assistant: `https://assistant.${domain}`,
	grafana: `https://grafana.${domain}`,
};
export const storagePublicUrl = storage?.publicBaseUrl ?? pulumi.output("");
export const supportEmailAddress =
	supportEmailRouting?.address ?? pulumi.output("");
export const supportEmailDnsStatus =
	supportEmailRouting?.dnsStatus ?? pulumi.output("");
