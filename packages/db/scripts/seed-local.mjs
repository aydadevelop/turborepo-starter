#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
	existsSync,
	readdirSync,
	readFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { hashPassword } from "better-auth/crypto";
import pg from "pg";

const { Client } = pg;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const DEFAULT_ANCHOR_DATE = "2026-03-15";
const DEFAULT_SCENARIO = "baseline";

const MIGRATION_FILENAME_RE = /^\d+_.+\.sql$/;
const ANCHOR_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const TODO_ID_MIN = 900_000;
const TODO_ID_MAX = 900_999;

const DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/myapp";

const scenarioCatalog = {
	baseline:
		"Core starter data for auth/org, notifications, assistant chat, and todo.",
	full: "Alias of baseline starter data.",
};

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../..");
const dbPackageRoot = path.resolve(scriptDir, "..");

const isLikelySqliteMigration = (sqlText) =>
	sqlText.includes("AUTOINCREMENT") ||
	sqlText.includes("unixepoch(") ||
	/`[^`]+`/.test(sqlText);

const printHelp = () => {
	console.log(
		[
			"Usage: bun run db:seed -- [options]",
			"",
			"Options:",
			`  --scenario <name>           Scenario to seed (default: ${DEFAULT_SCENARIO})`,
			`  --anchor-date <YYYY-MM-DD>  Stable UTC anchor date (default: ${DEFAULT_ANCHOR_DATE})`,
			"  --append                    Do not clear prior seed namespace before writing",
			"  --database-url <url>        PostgreSQL connection string (default: DATABASE_URL env or localhost)",
			"  --list-scenarios            Print available scenario names",
			"  -h, --help                  Show this help message",
			"",
			"Examples:",
			"  bun run db:seed",
			"  bun run db:seed -- --scenario baseline",
			"  bun run db:seed -- --database-url postgresql://user:pass@host:5432/db",
		].join("\n")
	);
};

const printScenarios = () => {
	console.log("Available scenarios:");
	for (const [name, description] of Object.entries(scenarioCatalog)) {
		console.log(`- ${name}: ${description}`);
	}
};

const parseArgs = () => {
	const args = process.argv.slice(2);
	const result = {
		databaseUrl: null,
		scenario: DEFAULT_SCENARIO,
		anchorDate: DEFAULT_ANCHOR_DATE,
		append: false,
	};

	const flagHandlers = {
		"--database-url": (value) => {
			result.databaseUrl = value;
		},
		"--scenario": (value) => {
			result.scenario = value;
		},
		"--anchor-date": (value) => {
			result.anchorDate = value;
		},
		"--append": () => {
			result.append = true;
		},
		"--list-scenarios": () => {
			printScenarios();
			process.exit(0);
		},
		"--help": () => {
			printHelp();
			process.exit(0);
		},
		"-h": () => {
			printHelp();
			process.exit(0);
		},
	};

	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];
		const handler = flagHandlers[arg];
		if (!handler) {
			throw new Error(`Unknown argument: ${arg}`);
		}

		if (
			arg === "--append" ||
			arg === "--list-scenarios" ||
			arg === "--help" ||
			arg === "-h"
		) {
			handler();
			continue;
		}

		const value = args[i + 1];
		if (!value) {
			throw new Error(`Missing value for ${arg}`);
		}
		handler(value);
		i += 1;
	}

	if (!(result.scenario in scenarioCatalog)) {
		throw new Error(
			`Unknown scenario: ${result.scenario}. Use --list-scenarios to see valid values.`
		);
	}

	return {
		append: result.append,
		anchorDate: result.anchorDate,
		databaseUrl: result.databaseUrl,
		scenario: result.scenario,
	};
};

const quote = (identifier) => `"${identifier}"`;

const getMissingTables = async (client, tableNames) => {
	const result = await client.query(
		`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1)`,
		[tableNames]
	);
	const existing = new Set(result.rows.map((r) => r.table_name));
	return tableNames.filter((name) => !existing.has(name));
};

const isIgnorableMigrationError = (error) => {
	const message = String(error?.message ?? "");
	return (
		message.includes("already exists") ||
		message.includes("duplicate column name") ||
		message.includes("no such index") ||
		message.includes("no such table")
	);
};

const collectMigrationSqlFiles = (rootDir) => {
	const sqlFiles = [];
	const stack = [rootDir];

	while (stack.length > 0) {
		const currentDir = stack.pop();
		if (!currentDir) {
			continue;
		}

		for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
			const absolutePath = path.join(currentDir, entry.name);
			if (entry.isDirectory()) {
				stack.push(absolutePath);
				continue;
			}

			if (!entry.isFile()) {
				continue;
			}

			const isLegacySql = MIGRATION_FILENAME_RE.test(entry.name);
			const isFolderStyleSql = entry.name === "migration.sql";
			if (!(isLegacySql || isFolderStyleSql)) {
				continue;
			}

			sqlFiles.push(absolutePath);
		}
	}

	return sqlFiles.sort((left, right) =>
		left.localeCompare(right, undefined, { numeric: true })
	);
};

const applyMigrationsIfNeeded = async (client, requiredTables) => {
	const missingTables = await getMissingTables(client, requiredTables);
	if (missingTables.length === 0) {
		return;
	}

	const migrationsDir = path.resolve(scriptDir, "../src/migrations");
	const migrationFiles = collectMigrationSqlFiles(migrationsDir);

	for (const migrationPath of migrationFiles) {
		const rawSql = readFileSync(migrationPath, "utf8");
		if (isLikelySqliteMigration(rawSql)) {
			return;
		}

		const statements = rawSql
			.split("--> statement-breakpoint")
			.map((statement) => statement.trim())
			.filter(Boolean);

		for (const statement of statements) {
			try {
				await client.query(statement);
			} catch (error) {
				if (!isIgnorableMigrationError(error)) {
					throw error;
				}
			}
		}
	}
};

const pushSchemaWithDrizzle = (connectionString) => {
	try {
		execFileSync("bunx", ["drizzle-kit", "push", "--config", "drizzle.config.dev.ts"], {
			cwd: dbPackageRoot,
			stdio: "inherit",
			env: {
				...process.env,
				DATABASE_URL: connectionString,
			},
		});
	} catch (error) {
		const fallbackDrizzleKitBin = path.resolve(
			repoRoot,
			"node_modules/.bin/drizzle-kit"
		);
		if (!existsSync(fallbackDrizzleKitBin)) {
			throw error;
		}

		execFileSync(fallbackDrizzleKitBin, ["push", "--config", "drizzle.config.dev.ts"], {
			cwd: dbPackageRoot,
			stdio: "inherit",
			env: {
				...process.env,
				DATABASE_URL: connectionString,
			},
		});
	}
};

const ensureSchemaExists = async (client, connectionString) => {
	const requiredTables = [
		"organization",
		"user",
		"account",
		"session",
		"verification",
		"passkey",
		"member",
		"invitation",
		"user_consent",
		"notification_event",
		"notification_intent",
		"notification_delivery",
		"notification_preference",
		"notification_in_app",
		"todo",
		"assistant_chat",
		"assistant_message",
	];

	await applyMigrationsIfNeeded(client, requiredTables);

	let missingRequiredTables = await getMissingTables(client, requiredTables);
	if (missingRequiredTables.length > 0) {
		pushSchemaWithDrizzle(connectionString);
		missingRequiredTables = await getMissingTables(client, requiredTables);
	}

	if (missingRequiredTables.length > 0) {
		throw new Error(
			[
				`Missing required tables: ${missingRequiredTables.join(", ")}`,
				"Apply schema first with:",
				"  bun run db:push",
			].join("\n")
		);
	}
};

const parseAnchorDate = (value) => {
	if (!ANCHOR_DATE_RE.test(value)) {
		throw new Error("--anchor-date must use YYYY-MM-DD format");
	}
	const parsed = new Date(`${value}T00:00:00.000Z`);
	if (Number.isNaN(parsed.getTime())) {
		throw new Error("--anchor-date is not a valid date");
	}
	return parsed.getTime();
};

const toJson = (value) => JSON.stringify(value);

const withCommon = (rows, now) =>
	rows.map((row) => ({
		created_at: now,
		updated_at: now,
		...row,
	}));

const buildSeedData = ({
	anchorDate,
	scenario,
	adminPasswordHash,
	operatorPasswordHash,
}) => {
	const anchorDateMs = parseAnchorDate(anchorDate);
	const nowMs = anchorDateMs + 9 * HOUR_MS;
	const now = new Date(nowMs).toISOString();
	const inTwoDays = new Date(nowMs + 2 * DAY_MS).toISOString();

	const adminOrgId = "seed_org_admin";
	const starterOrgId = "seed_org_starter";
	const adminUserId = "seed_user_admin";
	const operatorUserId = "seed_user_operator";
	const memberUserId = "seed_user_member";

	const seed = {
		organizations: [
			{
				id: adminOrgId,
				name: "Admin",
				slug: "admin",
				logo: null,
				metadata: toJson({ seedNamespace: "seed" }),
				created_at: now,
			},
			{
				id: starterOrgId,
				name: "Starter Organization",
				slug: "starter-org",
				logo: null,
				metadata: toJson({ seedNamespace: "seed", tier: "pro" }),
				created_at: now,
			},
		],
		users: withCommon(
			[
				{
					id: adminUserId,
					name: "Admin",
					email: "admin@admin.com",
					email_verified: true,
					image: null,
					role: "admin",
				},
				{
					id: operatorUserId,
					name: "Operations User",
					email: "operator@example.com",
					email_verified: true,
					image: null,
					role: "user",
				},
				{
					id: memberUserId,
					name: "Member User",
					email: "member@example.com",
					email_verified: true,
					image: null,
					role: "user",
				},
			],
			now
		),
		accounts: withCommon(
			[
				{
					id: "seed_account_admin_credential",
					account_id: adminUserId,
					provider_id: "credential",
					user_id: adminUserId,
					password: adminPasswordHash,
				},
				{
					id: "seed_account_operator_credential",
					account_id: operatorUserId,
					provider_id: "credential",
					user_id: operatorUserId,
					password: operatorPasswordHash,
				},
			],
			now
		),
		members: [
			{
				id: "seed_member_admin",
				organization_id: adminOrgId,
				user_id: adminUserId,
				role: "org_owner",
				created_at: now,
			},
			{
				id: "seed_member_operator",
				organization_id: starterOrgId,
				user_id: operatorUserId,
				role: "manager",
				created_at: now,
			},
			{
				id: "seed_member_member",
				organization_id: starterOrgId,
				user_id: memberUserId,
				role: "member",
				created_at: now,
			},
		],
		invitations: [
			{
				id: "seed_invitation_pending",
				organization_id: starterOrgId,
				email: "invitee@example.com",
				role: "member",
				status: "pending",
				expires_at: inTwoDays,
				inviter_id: operatorUserId,
				created_at: now,
			},
		],
		consents: withCommon(
			[
				{
					id: "seed_consent_member_service",
					user_id: memberUserId,
					consent_type: "service_agreement",
					consent_version: "2026-02-14",
					consented_at: now,
					ip_address: "127.0.0.1",
					user_agent: "seed-local",
				},
			],
			now
		),
		notificationEvents: withCommon(
			[
				{
					id: "seed_notification_event_task_1",
					organization_id: starterOrgId,
					actor_user_id: operatorUserId,
					event_type: "task.recurring.tick",
					source_type: "task",
					source_id: "seed-task-1",
					idempotency_key: "seed:task:recurring:1",
					payload: toJson({
						recipients: [
							{
								userId: memberUserId,
								title: "Recurring reminder",
								body: "This is a seeded recurring reminder.",
								channels: ["in_app"],
								severity: "info",
							},
						],
					}),
					status: "processed",
					processing_started_at: now,
					processed_at: now,
					failure_reason: null,
				},
			],
			now
		),
		notificationIntents: withCommon(
			[
				{
					id: "seed_notification_intent_task_1",
					event_id: "seed_notification_event_task_1",
					organization_id: starterOrgId,
					recipient_user_id: memberUserId,
					channel: "in_app",
					template_key: "task.recurring.tick",
					title: "Recurring reminder",
					body: "This is a seeded recurring reminder.",
					metadata: toJson({ taskId: "seed-task-1", runNumber: 1 }),
					status: "sent",
					processed_at: now,
				},
			],
			now
		),
		notificationDeliveries: withCommon(
			[
				{
					id: "seed_notification_delivery_task_1",
					intent_id: "seed_notification_intent_task_1",
					organization_id: starterOrgId,
					provider: "in_app",
					provider_recipient: memberUserId,
					attempt: 1,
					status: "sent",
					provider_message_id: "seed-in-app-1",
					failure_reason: null,
					response_payload: null,
					sent_at: now,
				},
			],
			now
		),
		notificationInApp: withCommon(
			[
				{
					id: "seed_notification_in_app_1",
					event_id: "seed_notification_event_task_1",
					intent_id: "seed_notification_intent_task_1",
					organization_id: starterOrgId,
					user_id: memberUserId,
					title: "Recurring reminder",
					body: "This is a seeded recurring reminder.",
					cta_url: "/dashboard",
					severity: "info",
					metadata: toJson({ taskId: "seed-task-1" }),
					delivered_at: now,
					viewed_at: null,
				},
			],
			now
		),
		notificationPreferences: withCommon(
			[
				{
					id: "seed_notification_pref_member_global",
					user_id: memberUserId,
					organization_id: null,
					organization_scope_key: "global",
					event_type: "*",
					channel: "in_app",
					enabled: true,
					quiet_hours_start: null,
					quiet_hours_end: null,
					timezone: "UTC",
					created_by_user_id: adminUserId,
				},
			],
			now
		),
		todos: [
			{ id: 900_001, text: "Review org memberships", completed: false },
			{ id: 900_002, text: "Verify notification delivery", completed: false },
			{ id: 900_003, text: "Check recurring reminder pipeline", completed: true },
		],
		assistantChats: withCommon(
			[
				{
					id: "seed_chat_member_1",
					title: "Starter onboarding",
					user_id: memberUserId,
					visibility: "private",
				},
			],
			now
		),
		assistantMessages: withCommon(
			[
				{
					id: "seed_chat_message_member_1",
					chat_id: "seed_chat_member_1",
					role: "assistant",
					parts: toJson([
						{
							type: "text",
							text: "Welcome. This starter includes auth, notifications, payments, tasks, and todo flows.",
						},
					]),
					attachments: toJson([]),
				},
			],
			now
		),
	};

	if (scenario === "full") {
		seed.todos.push({
			id: 900_004,
			text: "Full scenario alias is active",
			completed: false,
		});
	}

	return seed;
};

const escapeSqlValue = (value) => {
	if (value === null || value === undefined) {
		return "NULL";
	}
	if (typeof value === "boolean") {
		return value ? "TRUE" : "FALSE";
	}
	if (typeof value === "number") {
		return String(value);
	}
	return `'${String(value).replace(/'/g, "''")}'`;
};

const upsertSql = (table, conflictColumns, row) => {
	const columns = Object.keys(row);
	const values = columns.map((column) => escapeSqlValue(row[column]));
	const updateColumns = columns.filter(
		(column) => !conflictColumns.includes(column)
	);

	return `INSERT INTO ${quote(table)} (${columns.map(quote).join(", ")}) VALUES (${values.join(", ")}) ON CONFLICT (${conflictColumns.map(quote).join(", ")}) DO UPDATE SET ${updateColumns.map((column) => `${quote(column)} = excluded.${quote(column)}`).join(", ")};`;
};

const collectSeedSql = (seed) => {
	const statements = [];

	for (const row of seed.organizations) {
		statements.push(upsertSql("organization", ["id"], row));
	}
	for (const row of seed.users) {
		statements.push(upsertSql("user", ["id"], row));
	}
	for (const row of seed.accounts) {
		statements.push(upsertSql("account", ["id"], row));
	}
	for (const row of seed.members) {
		statements.push(upsertSql("member", ["id"], row));
	}
	for (const row of seed.invitations) {
		statements.push(upsertSql("invitation", ["id"], row));
	}
	for (const row of seed.consents) {
		statements.push(upsertSql("user_consent", ["id"], row));
	}

	const rowGroups = [
		["notification_event", seed.notificationEvents],
		["notification_intent", seed.notificationIntents],
		["notification_delivery", seed.notificationDeliveries],
		["notification_in_app", seed.notificationInApp],
		["notification_preference", seed.notificationPreferences],
		["todo", seed.todos],
		["assistant_chat", seed.assistantChats],
		["assistant_message", seed.assistantMessages],
	];

	for (const [table, rows] of rowGroups) {
		for (const row of rows) {
			statements.push(upsertSql(table, ["id"], row));
		}
	}

	return statements;
};

const clearSeedNamespace = async (client) => {
	const prefixedTables = [
		"assistant_message",
		"assistant_chat",
		"notification_in_app",
		"notification_delivery",
		"notification_intent",
		"notification_event",
		"notification_preference",
		"user_consent",
		"invitation",
		"member",
		"account",
		"session",
		"passkey",
		"verification",
		"organization",
		"user",
	];

	for (const table of prefixedTables) {
		await client.query(
			`DELETE FROM ${quote(table)} WHERE ${quote("id")} LIKE 'seed_%'`
		);
	}

	await client.query(
		`DELETE FROM ${quote("todo")} WHERE ${quote("id")} >= $1 AND ${quote("id")} <= $2`,
		[TODO_ID_MIN, TODO_ID_MAX]
	);
};

const writeSeedData = async (client, seed) => {
	const statements = collectSeedSql(seed);
	for (const statement of statements) {
		await client.query(statement);
	}
};

const main = async () => {
	const options = parseArgs();
	const connectionString =
		options.databaseUrl ?? process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;

	const client = new Client({ connectionString });
	await client.connect();

	try {
		await ensureSchemaExists(client, connectionString);

		const adminPasswordHash = await hashPassword("admin");
		const operatorPasswordHash = await hashPassword("operator");

		const seed = buildSeedData({
			anchorDate: options.anchorDate,
			scenario: options.scenario,
			adminPasswordHash,
			operatorPasswordHash,
		});

		await client.query("BEGIN");
		try {
			if (!options.append) {
				await clearSeedNamespace(client);
			}
			await writeSeedData(client, seed);
			await client.query("COMMIT");
		} catch (error) {
			await client.query("ROLLBACK");
			throw error;
		}

		console.log(
			[
				`Seeded database: ${connectionString.replace(/\/\/.*@/, "//***@")}`,
				`Scenario: ${options.scenario}`,
				`Anchor date: ${options.anchorDate}`,
				`Organizations: ${seed.organizations.map((org) => org.slug).join(", ")}`,
				`Users: ${seed.users.length}, notifications: ${seed.notificationEvents.length}, todos: ${seed.todos.length}`,
				"Admin login: admin@admin.com / admin",
				"Operator login: operator@example.com / operator",
			].join("\n")
		);
	} finally {
		await client.end();
	}
};

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
