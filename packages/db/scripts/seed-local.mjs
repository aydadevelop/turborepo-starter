#!/usr/bin/env node

import { parseArgs } from "node:util";
import process from "node:process";

import { hashPassword } from "better-auth/crypto";
import pg from "pg";

import { CLEANUP_TABLES } from "./cleanup-tables.mjs";

const { Client } = pg;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const DEFAULT_ANCHOR_DATE = "2026-03-15";
const ANCHOR_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TODO_ID_MIN = 900_000;
const TODO_ID_MAX = 900_999;
const DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/myapp";

const quote = (identifier) => `"${identifier}"`;

const parseCliArgs = () => {
	const { values } = parseArgs({
		options: {
			"anchor-date": { type: "string", default: DEFAULT_ANCHOR_DATE },
			append: { type: "boolean", default: false },
			"database-url": { type: "string" },
			help: { type: "boolean", short: "h" },
		},
		strict: true,
	});

	if (values.help) {
		console.log(
			[
				"Usage: bun run db:seed -- [options]",
				"",
				"Options:",
				`  --anchor-date <YYYY-MM-DD>  Stable UTC anchor date (default: ${DEFAULT_ANCHOR_DATE})`,
				"  --append                    Do not clear prior seed namespace before writing",
				"  --database-url <url>        PostgreSQL connection string (default: DATABASE_URL env or localhost)",
				"  -h, --help                  Show this help message",
			].join("\n")
		);
		process.exit(0);
	}

	return {
		anchorDate: values["anchor-date"],
		append: values.append ?? false,
		databaseUrl: values["database-url"] ?? null,
	};
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

const buildSeedData = ({ anchorDate, adminPasswordHash, operatorPasswordHash }) => {
	const anchorDateMs = parseAnchorDate(anchorDate);
	const nowMs = anchorDateMs + 9 * HOUR_MS;
	const now = new Date(nowMs).toISOString();
	const inTwoDays = new Date(nowMs + 2 * DAY_MS).toISOString();

	const adminOrgId = "seed_org_admin";
	const starterOrgId = "seed_org_starter";
	const adminUserId = "seed_user_admin";
	const operatorUserId = "seed_user_operator";
	const memberUserId = "seed_user_member";

	return {
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
};

const upsert = async (client, table, conflictColumns, row) => {
	const columns = Object.keys(row);
	const values = Object.values(row);
	const placeholders = columns.map((_, i) => `$${i + 1}`);
	const updateColumns = columns.filter((c) => !conflictColumns.includes(c));

	const sql = [
		`INSERT INTO ${quote(table)} (${columns.map(quote).join(", ")})`,
		`VALUES (${placeholders.join(", ")})`,
		`ON CONFLICT (${conflictColumns.map(quote).join(", ")})`,
		`DO UPDATE SET ${updateColumns.map((c) => `${quote(c)} = EXCLUDED.${quote(c)}`).join(", ")}`,
	].join(" ");

	await client.query(sql, values);
};

const clearSeedNamespace = async (client) => {
	for (const table of CLEANUP_TABLES) {
		await client.query(
			`DELETE FROM ${quote(table)} WHERE ${quote("id")} LIKE $1`,
			["seed_%"]
		);
	}

	await client.query(
		`DELETE FROM ${quote("user")} WHERE ${quote("id")} LIKE $1`,
		["seed_%"]
	);

	await client.query(
		`DELETE FROM ${quote("todo")} WHERE ${quote("id")} >= $1 AND ${quote("id")} <= $2`,
		[TODO_ID_MIN, TODO_ID_MAX]
	);
};

const writeSeedData = async (client, seed) => {
	const tableRows = [
		["organization", seed.organizations],
		["user", seed.users],
		["account", seed.accounts],
		["member", seed.members],
		["invitation", seed.invitations],
		["user_consent", seed.consents],
		["notification_event", seed.notificationEvents],
		["notification_intent", seed.notificationIntents],
		["notification_delivery", seed.notificationDeliveries],
		["notification_in_app", seed.notificationInApp],
		["notification_preference", seed.notificationPreferences],
		["todo", seed.todos],
		["assistant_chat", seed.assistantChats],
		["assistant_message", seed.assistantMessages],
	];

	for (const [table, rows] of tableRows) {
		for (const row of rows) {
			await upsert(client, table, ["id"], row);
		}
	}
};

const main = async () => {
	const options = parseCliArgs();
	const connectionString =
		options.databaseUrl ?? process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;

	const client = new Client({ connectionString });
	await client.connect();

	try {
		const adminPasswordHash = await hashPassword("admin");
		const operatorPasswordHash = await hashPassword("operator");

		const seed = buildSeedData({
			anchorDate: options.anchorDate,
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
