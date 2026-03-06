import * as command from "@pulumi/command";
import * as pulumi from "@pulumi/pulumi";

/** App definition for Dokku */
interface AppDef {
	buildArg?: string;
	domain: string;
	extraEnv?: Record<string, pulumi.Input<string>>;
	name: string;
	port: number;
}

interface DokkuAppsArgs {
	connection: command.types.input.remote.ConnectionArgs;
	domain: string;
	env: Record<string, pulumi.Input<string>>;
	ghcrToken: pulumi.Input<string>;
	ghcrUser: string;
	postgresPassword: pulumi.Input<string>;
}

/**
 * Configure all Dokku apps, Postgres, Let's Encrypt, and Grafana/Loki.
 */
export class DokkuApps extends pulumi.ComponentResource {
	public readonly dbUrl: pulumi.Output<string>;

	constructor(
		name: string,
		args: DokkuAppsArgs,
		opts?: pulumi.ComponentResourceOptions
	) {
		super("myapp:infra:DokkuApps", name, {}, opts);

		const conn = args.connection;
		const domain = args.domain;

		// ── GHCR login via Dokku registry config ─────────────────────────────
		// Must use `dokku registry:login` — Dokku runs pulls as the `dokku` user
		// and cannot see root's /root/.docker/config.json (docker login).
		const ghcrLogin = new command.remote.Command(
			`${name}-ghcr-login`,
			{
				connection: conn,
				create: pulumi.interpolate`dokku registry:login ghcr.io "${args.ghcrUser}" "${args.ghcrToken}"`,
				// Re-run on every `pulumi up` so the token stays fresh
				triggers: [args.ghcrToken],
			},
			{ parent: this }
		);

		// ── Postgres database ─────────────────────────────────────────────────
		const db = new command.remote.Command(
			`${name}-postgres`,
			{
				connection: conn,
				create: pulumi.interpolate`
        if ! dokku postgres:exists myapp-db 2>/dev/null; then
          export POSTGRES_IMAGE="pgvector/pgvector" POSTGRES_IMAGE_VERSION="pg18"
          dokku postgres:create myapp-db || true
        fi
        echo "db-ok"
      `,
			},
			{ parent: this, protect: true }
		);

		// ── Global Dokku domain ───────────────────────────────────────────────
		const globalDomain = new command.remote.Command(
			`${name}-global-domain`,
			{
				connection: conn,
				create: `dokku domains:set-global ${domain}`,
			},
			{ parent: this }
		);

		// ── Let's Encrypt email ───────────────────────────────────────────────
		const letsencrypt = new command.remote.Command(
			`${name}-letsencrypt-email`,
			{
				connection: conn,
				create: `dokku letsencrypt:set --global email admin@${domain}`,
			},
			{ parent: this }
		);

		// ── App definitions ───────────────────────────────────────────────────
		const apps: AppDef[] = [
			{
				name: "web",
				domain,
				port: 3000,
				extraEnv: {
					ORIGIN: `https://${domain}`,
					INTERNAL_SERVER_URL: "http://server.web1:3000",
					INTERNAL_ASSISTANT_URL: "http://assistant.web1:3001",
					// Public env vars — exposed to the browser via SvelteKit
					PUBLIC_SERVER_URL: `https://api.${domain}`,
					PUBLIC_ASSISTANT_URL: `https://assistant.${domain}`,
				},
			},
			{
				name: "server",
				domain: `api.${domain}`,
				port: 3000,
				buildArg: "server",
			},
			{
				name: "assistant",
				domain: `assistant.${domain}`,
				port: 3001,
				buildArg: "assistant",
				extraEnv: {
					SERVER_URL: "http://server.web1:3000",
				},
			},
			{
				name: "notifications",
				domain: `notifications.${domain}`,
				port: 3002,
				buildArg: "notifications",
				extraEnv: {
					SERVER_URL: "http://server.web1:3000",
					SMTP_HOST: "smtp.web1",
					SMTP_PORT: "25",
				},
			},
		];

		// ── Create & configure each app ───────────────────────────────────────
		const appResources: command.remote.Command[] = [];

		for (const app of apps) {
			// Create app
			const create = new command.remote.Command(
				`${name}-app-${app.name}`,
				{
					connection: conn,
					create: `dokku apps:create ${app.name} 2>/dev/null || true && echo "created"`,
				},
				{ parent: this, dependsOn: [globalDomain] }
			);

			// Set domain
			const setDomain = new command.remote.Command(
				`${name}-domain-${app.name}`,
				{
					connection: conn,
					create: `dokku domains:set ${app.name} ${app.domain}`,
				},
				{ parent: this, dependsOn: [create] }
			);

			// Set port mapping
			const setPort = new command.remote.Command(
				`${name}-port-${app.name}`,
				{
					connection: conn,
					create: `dokku ports:set ${app.name} http:80:${app.port} https:443:${app.port}`,
				},
				{ parent: this, dependsOn: [create] }
			);

			// Set build args (--file is not needed: git:from-image generates its own Dockerfile)
			const dockerOpts = new command.remote.Command(
				`${name}-docker-${app.name}`,
				{
					connection: conn,
					create: app.buildArg
						? `dokku docker-options:add ${app.name} build "--build-arg APP=${app.buildArg}"`
						: "true",
				},
				{ parent: this, dependsOn: [create] }
			);

			// Install per-app nginx sigil so HTTPS listens on 127.0.0.1:8443 (sslh target)
			// instead of 0.0.0.0:443 (which conflicts with sslh). This survives Dokku upgrades
			// because per-app sigil files take precedence over the core plugin template.
			// See: https://github.com/dokku/dokku/issues/3444
			const installSigil = new command.remote.Command(
				`${name}-sigil-${app.name}`,
				{
					connection: conn,
					create: `
          SIGIL=/var/lib/dokku/core-plugins/available/nginx-vhosts/templates/nginx.conf.sigil
          cp "$SIGIL" /home/dokku/${app.name}/nginx.conf.sigil
          chown dokku:dokku /home/dokku/${app.name}/nginx.conf.sigil
          chmod 644 /home/dokku/${app.name}/nginx.conf.sigil
          echo "sigil-${app.name}-installed"
        `,
					// On update: re-copy in case Dokku was upgraded (which would reset the core sigil
					// to its default; the per-app copy is unaffected but stays current with the patched version)
					update: `
          SIGIL=/var/lib/dokku/core-plugins/available/nginx-vhosts/templates/nginx.conf.sigil
          cp "$SIGIL" /home/dokku/${app.name}/nginx.conf.sigil
          chown dokku:dokku /home/dokku/${app.name}/nginx.conf.sigil
          chmod 644 /home/dokku/${app.name}/nginx.conf.sigil
          dokku proxy:build-config ${app.name} 2>/dev/null || true
          echo "sigil-${app.name}-updated"
        `,
				},
				{ parent: this, dependsOn: [create, setPort] }
			);

			// Link Postgres
			const linkDb = new command.remote.Command(
				`${name}-db-link-${app.name}`,
				{
					connection: conn,
					create: `dokku postgres:link myapp-db ${app.name} 2>/dev/null || true`,
				},
				{ parent: this, dependsOn: [create, db] }
			);

			// Set environment variables
			const mergedEnv: Record<string, pulumi.Input<string>> = {
				PORT: String(app.port),
				NODE_ENV: "production",
				...args.env,
				...app.extraEnv,
			};

			// Build env string from merged config
			const envString = pulumi
				.all(
					Object.entries(mergedEnv).map(([k, v]) =>
						pulumi.output(v).apply((val) => `${k}=${val}`)
					)
				)
				.apply((pairs) => pairs.join(" "));

			const setEnv = new command.remote.Command(
				`${name}-env-${app.name}`,
				{
					connection: conn,
					create: pulumi.interpolate`dokku config:set --no-restart ${app.name} ${envString}`,
				},
				{ parent: this, dependsOn: [create] }
			);

			// SSL via Let's Encrypt — depends on installSigil so the cert-issuance nginx
			// config rebuild uses the sslh-compatible template (listen 127.0.0.1:8443)
			const ssl = new command.remote.Command(
				`${name}-ssl-${app.name}`,
				{
					connection: conn,
					create: `dokku letsencrypt:enable ${app.name} 2>/dev/null || true`,
				},
				{ parent: this, dependsOn: [setDomain, letsencrypt, installSigil] }
			);

			appResources.push(ssl);
		}

		// ── Observability: Loki + Grafana (Docker containers) ─────────────────
		const loki = new command.remote.Command(
			`${name}-loki`,
			{
				connection: conn,
				create: `
        if ! docker ps -a --format '{{.Names}}' | grep -q '^loki$'; then
          docker run -d --name loki --restart unless-stopped \
            -v loki_data:/loki \
            -p 127.0.0.1:3100:3100 \
            --network dokku \
            grafana/loki:3.4.2 \
            -config.file=/etc/loki/local-config.yaml
        fi
        echo "loki-ok"
      `,
			},
			{ parent: this }
		);

		const grafana = new command.remote.Command(
			`${name}-grafana`,
			{
				connection: conn,
				create: pulumi.interpolate`
        if ! docker ps -a --format '{{.Names}}' | grep -q '^grafana$'; then
          docker run -d --name grafana --restart unless-stopped \
            -v grafana_data:/var/lib/grafana \
            -e GF_SECURITY_ADMIN_PASSWORD="${args.env.GRAFANA_PASSWORD}" \
            -e GF_USERS_ALLOW_SIGN_UP=false \
            -e GF_ALERTING_ENABLED=true \
            -e GF_UNIFIED_ALERTING_ENABLED=true \
            -e GF_SMTP_ENABLED=true \
            -e GF_SMTP_HOST=smtp.web1:25 \
            -e GF_SMTP_FROM_NAME="Grafana Alerts" \
            -e GF_SMTP_SKIP_VERIFY=true \
            --network dokku \
            grafana/grafana:11.6.0
        fi
        echo "grafana-ok"
      `,
			},
			{ parent: this, dependsOn: [loki] }
		);

		// ── smtp4dev (staging mail capture) ───────────────────────────────────
		const smtp = new command.remote.Command(
			`${name}-smtp`,
			{
				connection: conn,
				create: `
        if ! docker ps -a --format '{{.Names}}' | grep -q '^smtp$'; then
          docker run -d --name smtp --restart unless-stopped \
            -e ServerOptions__Urls="http://*:80" \
            -e ServerOptions__TcpPort=25 \
            -e ServerOptions__HostName=smtp \
            -p 127.0.0.1:5025:80 \
            --network dokku \
            rnwood/smtp4dev:v3
        fi
        echo "smtp-ok"
      `,
			},
			{ parent: this }
		);

		// Get the DATABASE_URL from Dokku
		this.dbUrl = db.stdout.apply(() => "linked-via-dokku");

		this.registerOutputs({ dbUrl: this.dbUrl });
	}
}
