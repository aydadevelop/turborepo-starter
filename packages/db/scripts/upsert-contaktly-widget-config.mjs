import { randomUUID } from "node:crypto";

import pg from "pg";

const { Client } = pg;

const DEFAULT_DATABASE_URL =
	"postgresql://postgres:postgres@127.0.0.1:5432/myapp";

export const upsertContaktlyWidgetConfig = async ({
	allowedDomains = null,
	bookingUrl,
	configId,
	organizationId = "seed_org_admin",
}) => {
	const connectionString =
		process.env.PLAYWRIGHT_DATABASE_URL ??
		process.env.DATABASE_URL ??
		DEFAULT_DATABASE_URL;

	const client = new Client({ connectionString });
	await client.connect();

	try {
		const allowedDomainsJson = allowedDomains
			? JSON.stringify(allowedDomains)
			: null;
		const existing = await client.query(
			[
				'SELECT "id" FROM "contaktly_workspace_config"',
				'WHERE "public_config_id" = $1 OR "organization_id" = $2',
				"LIMIT 1",
			].join(" "),
			[configId, organizationId]
		);

		if (existing.rowCount && existing.rows[0]?.id) {
			await client.query(
				[
					'UPDATE "contaktly_workspace_config"',
					'SET "organization_id" = $2,',
					'"public_config_id" = $1,',
					'"booking_url" = $3,',
					'"allowed_domains" = $4,',
					'"updated_at" = now()',
					'WHERE "id" = $5',
				].join(" "),
				[
					configId,
					organizationId,
					bookingUrl,
					allowedDomainsJson,
					existing.rows[0].id,
				]
			);
			return;
		}

		await client.query(
			[
				'INSERT INTO "contaktly_workspace_config" ("id", "organization_id", "public_config_id", "booking_url", "allowed_domains")',
				"VALUES ($1, $2, $3, $4, $5)",
			].join(" "),
			[
				randomUUID(),
				organizationId,
				configId,
				bookingUrl,
				allowedDomainsJson,
			]
		);
	} finally {
		await client.end();
	}
};
