#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { hashPassword } from "better-auth/crypto";
import Database from "better-sqlite3";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const DEFAULT_ANCHOR_DATE = "2026-03-15";
const DEFAULT_SCENARIO = "baseline";

const MIGRATION_FILENAME_RE = /^\d+_.+\.sql$/;
const ANCHOR_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const TODO_ID_MIN = 900_000;
const TODO_ID_MAX = 900_999;

const APP_NAME = "my-app";
const DB_PREFIX = `${APP_NAME}-database`;
const DEFAULT_STAGE = "dev";

const scenarioCatalog = {
	baseline:
		"Core starter data for auth/org, notifications, assistant chat, and todo.",
	full: "Alias of baseline starter data.",
};

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../..");

const databaseHasTables = (databasePath, tableNames) => {
	const sqlite = new Database(databasePath, { readonly: true });
	try {
		for (const tableName of tableNames) {
			const exists = sqlite
				.prepare(
					"SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1"
				)
				.get(tableName);
			if (!exists) {
				return false;
			}
		}
		return true;
	} finally {
		sqlite.close();
	}
};

const findLocalD1Database = () => {
	const d1Dir = path.resolve(
		scriptDir,
		"../../../.alchemy/miniflare/v3/d1/miniflare-D1DatabaseObject"
	);

	if (!existsSync(d1Dir)) {
		throw new Error(
			`Local D1 directory not found: ${d1Dir}\n` +
				"Run `bun run dev` first so Miniflare creates the local D1 database."
		);
	}

	const sqliteFiles = readdirSync(d1Dir)
		.filter(
			(filename) =>
				filename.endsWith(".sqlite") &&
				!filename.includes("-wal") &&
				!filename.includes("-shm")
		)
		.map((filename) => {
			const absolutePath = path.join(d1Dir, filename);
			return {
				filename,
				absolutePath,
				mtimeMs: statSync(absolutePath).mtimeMs,
			};
		})
		.sort((a, b) => b.mtimeMs - a.mtimeMs);

	const latest = sqliteFiles[0];
	if (!latest) {
		throw new Error(
			`No sqlite file found in ${d1Dir}.\n` +
				"Run `bun run dev` first so Miniflare creates the local D1 database."
		);
	}

	const preferredDatabase = sqliteFiles.find((file) =>
		databaseHasTables(file.absolutePath, ["organization", "user"])
	);

	return (preferredDatabase ?? latest).absolutePath;
};

const printHelp = () => {
	console.log(
		[
			"Usage: bun run db:seed -- [options]",
			"",
			"Options:",
			"  --db <path>                 Seed a specific sqlite file (relative to repository root)",
			`  --scenario <name>           Scenario to seed (default: ${DEFAULT_SCENARIO})`,
			`  --anchor-date <YYYY-MM-DD>  Stable UTC anchor date (default: ${DEFAULT_ANCHOR_DATE})`,
			"  --append                    Do not clear prior seed namespace before writing",
			"  --remote                    Seed a remote D1 database via wrangler (requires --stage)",
			`  --stage <name>              Remote D1 stage name (default: ${DEFAULT_STAGE})`,
			"  --list-scenarios            Print available scenario names",
			"  -h, --help                  Show this help message",
			"",
			"Examples:",
			"  bun run db:seed",
			"  bun run db:seed -- --scenario baseline",
			"  bun run db:seed -- --db ./tmp/dev.sqlite --scenario full",
			"  bun run db:seed -- --remote --stage dev",
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
		dbPath: null,
		scenario: DEFAULT_SCENARIO,
		anchorDate: DEFAULT_ANCHOR_DATE,
		append: false,
		remote: false,
		stage: DEFAULT_STAGE,
	};

	const flagHandlers = {
		"--db": (value) => {
			result.dbPath = path.isAbsolute(value)
				? value
				: path.resolve(repoRoot, value);
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
		"--remote": () => {
			result.remote = true;
		},
		"--stage": (value) => {
			result.stage = value;
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
			arg === "--remote" ||
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

	if (result.remote && result.dbPath) {
		throw new Error("Cannot combine --remote with --db");
	}

	return {
		append: result.append,
		anchorDate: result.anchorDate,
		dbPath: result.dbPath,
		remote: result.remote,
		scenario: result.scenario,
		stage: result.stage,
	};
};

const quote = (identifier) => `"${identifier}"`;

const getMissingTables = (sqlite, tableNames) => {
	return tableNames.filter((tableName) => {
		const exists = sqlite
			.prepare(
				"SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1"
			)
			.get(tableName);

		return !exists;
	});
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

const applyMigrationsIfNeeded = (sqlite, requiredTables) => {
	const missingTables = getMissingTables(sqlite, requiredTables);
	if (missingTables.length === 0) {
		return;
	}

	const migrationsDir = path.resolve(scriptDir, "../src/migrations");
	const migrationFiles = collectMigrationSqlFiles(migrationsDir);

	for (const migrationPath of migrationFiles) {
		const rawSql = readFileSync(migrationPath, "utf8");
		const statements = rawSql
			.split("--> statement-breakpoint")
			.map((statement) => statement.trim())
			.filter(Boolean);

		for (const statement of statements) {
			try {
				sqlite.exec(statement);
			} catch (error) {
				if (!isIgnorableMigrationError(error)) {
					throw error;
				}
			}
		}
	}
};

const ensureSchemaExists = (sqlite) => {
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
		"yt_feed",
		"yt_video",
		"yt_transcript",
		"yt_cluster",
		"yt_signal",
	];

	applyMigrationsIfNeeded(sqlite, requiredTables);

	const missingRequiredTables = getMissingTables(sqlite, requiredTables);
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
	const now = anchorDateMs + 9 * HOUR_MS;
	const inTwoDays = now + 2 * DAY_MS;

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
					email_verified: 1,
					image: null,
					role: "admin",
				},
				{
					id: operatorUserId,
					name: "Operations User",
					email: "operator@example.com",
					email_verified: 1,
					image: null,
					role: "user",
				},
				{
					id: memberUserId,
					name: "Member User",
					email: "member@example.com",
					email_verified: 1,
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
					enabled: 1,
					quiet_hours_start: null,
					quiet_hours_end: null,
					timezone: "UTC",
					created_by_user_id: adminUserId,
				},
			],
			now
		),
		todos: [
			{ id: 900_001, text: "Review org memberships", completed: 0 },
			{ id: 900_002, text: "Verify notification delivery", completed: 0 },
			{ id: 900_003, text: "Check recurring reminder pipeline", completed: 1 },
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
			completed: 0,
		});
	}

	// ─── YouTube Seed Data ──────────────────────────────────────────────────

	const feedAlpha = "seed_yt_feed_alpha";
	const feedBeta = "seed_yt_feed_beta";

	seed.ytFeeds = [
		{
			id: feedAlpha,
			organization_id: starterOrgId,
			name: "Alpha Playtest Feedback",
			game_title: "Starforge Arena",
			search_query: "Starforge Arena playtest feedback",
			stop_words: "speedrun,montage,meme,compilation,shorts",
			published_after: "2026-01-01",
			game_version: "0.9.3",
			schedule_hint: "every 6h",
			status: "active",
			last_discovery_at: now - 2 * HOUR_MS,
			created_at: now - 7 * DAY_MS,
			updated_at: now,
		},
		{
			id: feedBeta,
			organization_id: starterOrgId,
			name: "Beta Bug Reports",
			game_title: "Starforge Arena",
			search_query: "Starforge Arena bug glitch",
			stop_words: "shorts,unrelated",
			published_after: null,
			game_version: "0.9.3-beta",
			schedule_hint: "every 12h",
			status: "active",
			last_discovery_at: null,
			created_at: now - 3 * DAY_MS,
			updated_at: now,
		},
	];

	const video1 = "seed_yt_video_1";
	const video2 = "seed_yt_video_2";
	const video3 = "seed_yt_video_3";
	const video4 = "seed_yt_video_4";
	const video5 = "seed_yt_video_5";

	const channelGameTester = "UCseed1GameTester42xxxxxxxx";
	const channelIndieReviewer = "UCseed2IndieReviewerxxxxxxx";
	const channelPCGaming = "UCseed3PCGamingProxxxxxxxx";
	const channelBugHunter = "UCseed4BugHunterMaxxxxxxxx";
	const channelCasual = "UCseed5CasualGamerSarahxxx";

	seed.ytUploaderChannels = [
		{ id: channelGameTester, name: "GameTester42", created_at: now, updated_at: now },
		{ id: channelIndieReviewer, name: "IndieReviewer", created_at: now, updated_at: now },
		{ id: channelPCGaming, name: "PCGamingPro", created_at: now, updated_at: now },
		{ id: channelBugHunter, name: "BugHunterMax", created_at: now, updated_at: now },
		{ id: channelCasual, name: "CasualGamerSarah", created_at: now, updated_at: now },
	];

	seed.ytVideos = [
		{
			id: video1,
			feed_id: feedAlpha,
			organization_id: starterOrgId,
			youtube_video_id: "abc123fake1",
			title: "Starforge Arena Alpha - First Impressions & Bugs Found",
			uploader_channel_id: channelGameTester,
			description:
				"My first playtest session with Starforge Arena alpha build. Found several issues including a wall clip bug.",
			duration: "PT23M15S",
			published_at: "2026-02-10",
			thumbnail_url: null,
			tags: toJson(["starforge", "playtest", "alpha", "bugs"]),
			view_count: 1523,
			status: "ingested",
			ingested_at: now - 5 * DAY_MS,
			created_at: now - 6 * DAY_MS,
			updated_at: now - 5 * DAY_MS,
		},
		{
			id: video2,
			feed_id: feedAlpha,
			organization_id: starterOrgId,
			youtube_video_id: "def456fake2",
			title: "STARFORGE ARENA: The UI Is Confusing (Playtest Feedback)",
			uploader_channel_id: channelIndieReviewer,
			description: "Detailed UI/UX feedback for Starforge Arena playtest.",
			duration: "PT15M42S",
			published_at: "2026-02-12",
			thumbnail_url: null,
			tags: toJson(["starforge", "UI", "UX", "feedback"]),
			view_count: 876,
			status: "ingested",
			ingested_at: now - 4 * DAY_MS,
			created_at: now - 5 * DAY_MS,
			updated_at: now - 4 * DAY_MS,
		},
		{
			id: video3,
			feed_id: feedAlpha,
			organization_id: starterOrgId,
			youtube_video_id: "ghi789fake3",
			title: "Starforge Arena - Great Combat But Performance Issues",
			uploader_channel_id: channelPCGaming,
			description:
				"Performance analysis of Starforge Arena. FPS drops in multiplayer.",
			duration: "PT31M08S",
			published_at: "2026-02-15",
			thumbnail_url: null,
			tags: toJson(["starforge", "performance", "FPS", "multiplayer"]),
			view_count: 2341,
			status: "ingested",
			ingested_at: now - 2 * DAY_MS,
			created_at: now - 3 * DAY_MS,
			updated_at: now - 2 * DAY_MS,
		},
		{
			id: video4,
			feed_id: feedBeta,
			organization_id: starterOrgId,
			youtube_video_id: "jkl012fake4",
			title: "Starforge Arena Beta - Matchmaking is BROKEN",
			uploader_channel_id: channelBugHunter,
			description: "Matchmaking bugs in the beta. Queue times and disconnects.",
			duration: "PT12M55S",
			published_at: "2026-02-18",
			thumbnail_url: null,
			tags: toJson(["starforge", "beta", "matchmaking", "bugs"]),
			view_count: 432,
			status: "candidate",
			created_at: now - 1 * DAY_MS,
			updated_at: now - 1 * DAY_MS,
		},
		{
			id: video5,
			feed_id: feedAlpha,
			organization_id: starterOrgId,
			youtube_video_id: "mno345fake5",
			title: "I Love Starforge Arena But The Tutorial Needs Work",
			uploader_channel_id: channelCasual,
			description: "Positive review with tutorial improvement suggestions.",
			duration: "PT8M20S",
			published_at: "2026-02-19",
			thumbnail_url: null,
			tags: toJson(["starforge", "tutorial", "review"]),
			view_count: 654,
			status: "approved",
			reviewed_by_user_id: operatorUserId,
			reviewed_at: now - 12 * HOUR_MS,
			created_at: now - 1 * DAY_MS,
			updated_at: now - 12 * HOUR_MS,
		},
	];

	const transcript1 = "seed_yt_transcript_1";
	const transcript2 = "seed_yt_transcript_2";
	const transcript3 = "seed_yt_transcript_3";

	seed.ytTranscripts = [
		{
			id: transcript1,
			video_id: video1,
			organization_id: starterOrgId,
			source: "youtube_captions",
			language: "en",
			full_text:
				"so I just started playing Starforge Arena and immediately noticed you can clip through the wall on the left side of spawn point. Also the health bar is really hard to see when you're in combat. The minimap icons overlap each other which is super confusing. But overall the combat feels really tight and responsive.",
			token_count: 58,
			created_at: now - 5 * DAY_MS,
			updated_at: now - 5 * DAY_MS,
		},
		{
			id: transcript2,
			video_id: video2,
			organization_id: starterOrgId,
			source: "youtube_captions",
			language: "en",
			full_text:
				"The main menu is clean but once you get into the settings the options are all over the place. Graphics settings don't have tooltips so I have no idea what half of them do. The inventory UI doesn't show item stats on hover which is really frustrating. Also the font size in chat is way too small.",
			token_count: 55,
			created_at: now - 4 * DAY_MS,
			updated_at: now - 4 * DAY_MS,
		},
		{
			id: transcript3,
			video_id: video3,
			organization_id: starterOrgId,
			source: "youtube_captions",
			language: "en",
			full_text:
				"Performance wise this game needs a lot of work. In single player I get about 120 FPS which is fine but the moment I join a multiplayer match it drops to 30-40 FPS. There are massive frame drops during ability effects. Also the game crashed twice during my 3 hour session with an out of memory error. The loading screen between matches takes about 45 seconds which is way too long.",
			token_count: 72,
			created_at: now - 2 * DAY_MS,
			updated_at: now - 2 * DAY_MS,
		},
	];

	const cluster1 = "seed_yt_cluster_wall_clip";
	const cluster2 = "seed_yt_cluster_ui_confusion";
	const cluster3 = "seed_yt_cluster_perf_mp";
	const cluster4 = "seed_yt_cluster_crash_oom";

	seed.ytClusters = [
		{
			id: cluster1,
			organization_id: starterOrgId,
			title: "Wall clip exploit at spawn point",
			summary:
				"Players can clip through the left wall near the spawn point, allowing out-of-bounds access.",
			state: "acknowledged",
			type: "exploit",
			severity: "high",
			signal_count: 3,
			unique_authors: 2,
			impact_score: 18,
			component: "Collision",
			first_seen_version: "0.9.3",
			versions_affected: toJson(["0.9.3"]),
			created_at: now - 5 * DAY_MS,
			updated_at: now - 1 * DAY_MS,
		},
		{
			id: cluster2,
			organization_id: starterOrgId,
			title: "UI elements hard to read and confusing",
			summary:
				"Multiple reports of unclear UI: health bar visibility, minimap icon overlap, missing tooltips, small chat font.",
			state: "in_progress",
			type: "ux_friction",
			severity: "medium",
			signal_count: 6,
			unique_authors: 3,
			impact_score: 27,
			component: "UI",
			first_seen_version: "0.9.3",
			versions_affected: toJson(["0.9.3", "0.9.3-beta"]),
			external_issue_url: "https://linear.app/starforge/issue/SF-142",
			external_issue_id: "SF-142",
			created_at: now - 4 * DAY_MS,
			updated_at: now,
		},
		{
			id: cluster3,
			organization_id: starterOrgId,
			title: "Severe FPS drops in multiplayer matches",
			summary:
				"Frame rate drops from 120 to 30-40 FPS when joining multiplayer. Worse during ability effects.",
			state: "open",
			type: "performance",
			severity: "critical",
			signal_count: 4,
			unique_authors: 2,
			impact_score: 32,
			component: "Rendering",
			first_seen_version: "0.9.3",
			versions_affected: toJson(["0.9.3"]),
			created_at: now - 2 * DAY_MS,
			updated_at: now,
		},
		{
			id: cluster4,
			organization_id: starterOrgId,
			title: "Game crashes with out of memory error",
			summary:
				"Multiple crash reports with OOM errors during extended play sessions (2-3 hours).",
			state: "open",
			type: "crash",
			severity: "critical",
			signal_count: 2,
			unique_authors: 1,
			impact_score: 10,
			component: "Memory",
			first_seen_version: "0.9.3",
			versions_affected: toJson(["0.9.3"]),
			created_at: now - 2 * DAY_MS,
			updated_at: now,
		},
	];

	seed.ytSignals = [
		{
			id: "seed_yt_signal_1",
			transcript_id: transcript1,
			video_id: video1,
			organization_id: starterOrgId,
			type: "exploit",
			severity: "high",
			text: "You can clip through the wall on the left side of spawn point",
			context_before:
				"so I just started playing Starforge Arena and immediately noticed",
			context_after:
				"Also the health bar is really hard to see when you're in combat",
			timestamp_start: 45,
			timestamp_end: 58,
			confidence: 92,
			component: "Collision",
			game_version: "0.9.3",
			cluster_id: cluster1,
			vectorized: 1,
			created_at: now - 5 * DAY_MS,
			updated_at: now - 5 * DAY_MS,
		},
		{
			id: "seed_yt_signal_2",
			transcript_id: transcript1,
			video_id: video1,
			organization_id: starterOrgId,
			type: "ux_friction",
			severity: "medium",
			text: "The health bar is really hard to see when you're in combat",
			context_before:
				"you can clip through the wall on the left side of spawn point. Also",
			context_after:
				"The minimap icons overlap each other which is super confusing",
			timestamp_start: 62,
			timestamp_end: 71,
			confidence: 87,
			component: "UI",
			game_version: "0.9.3",
			cluster_id: cluster2,
			vectorized: 1,
			created_at: now - 5 * DAY_MS,
			updated_at: now - 5 * DAY_MS,
		},
		{
			id: "seed_yt_signal_3",
			transcript_id: transcript1,
			video_id: video1,
			organization_id: starterOrgId,
			type: "confusion",
			severity: "medium",
			text: "The minimap icons overlap each other which is super confusing",
			context_before:
				"The health bar is really hard to see when you're in combat.",
			context_after: "But overall the combat feels really tight and responsive",
			timestamp_start: 75,
			timestamp_end: 83,
			confidence: 85,
			component: "UI",
			game_version: "0.9.3",
			cluster_id: cluster2,
			vectorized: 1,
			created_at: now - 5 * DAY_MS,
			updated_at: now - 5 * DAY_MS,
		},
		{
			id: "seed_yt_signal_4",
			transcript_id: transcript1,
			video_id: video1,
			organization_id: starterOrgId,
			type: "praise",
			severity: "info",
			text: "The combat feels really tight and responsive",
			context_before:
				"The minimap icons overlap each other which is super confusing. But overall",
			context_after: null,
			timestamp_start: 88,
			timestamp_end: 95,
			confidence: 90,
			component: "Combat",
			game_version: "0.9.3",
			cluster_id: null,
			vectorized: 1,
			created_at: now - 5 * DAY_MS,
			updated_at: now - 5 * DAY_MS,
		},
		{
			id: "seed_yt_signal_5",
			transcript_id: transcript2,
			video_id: video2,
			organization_id: starterOrgId,
			type: "ux_friction",
			severity: "medium",
			text: "Graphics settings don't have tooltips so I have no idea what half of them do",
			context_before:
				"once you get into the settings the options are all over the place.",
			context_after: "The inventory UI doesn't show item stats on hover",
			timestamp_start: 120,
			timestamp_end: 135,
			confidence: 88,
			component: "UI",
			game_version: "0.9.3",
			cluster_id: cluster2,
			vectorized: 1,
			created_at: now - 4 * DAY_MS,
			updated_at: now - 4 * DAY_MS,
		},
		{
			id: "seed_yt_signal_6",
			transcript_id: transcript2,
			video_id: video2,
			organization_id: starterOrgId,
			type: "ux_friction",
			severity: "medium",
			text: "The inventory UI doesn't show item stats on hover which is really frustrating",
			context_before: "Graphics settings don't have tooltips.",
			context_after: "Also the font size in chat is way too small",
			timestamp_start: 240,
			timestamp_end: 258,
			confidence: 91,
			component: "UI",
			game_version: "0.9.3",
			cluster_id: cluster2,
			vectorized: 1,
			created_at: now - 4 * DAY_MS,
			updated_at: now - 4 * DAY_MS,
		},
		{
			id: "seed_yt_signal_7",
			transcript_id: transcript3,
			video_id: video3,
			organization_id: starterOrgId,
			type: "performance",
			severity: "critical",
			text: "The moment I join a multiplayer match it drops to 30-40 FPS",
			context_before: "In single player I get about 120 FPS which is fine but",
			context_after: "There are massive frame drops during ability effects",
			timestamp_start: 180,
			timestamp_end: 198,
			confidence: 95,
			component: "Rendering",
			game_version: "0.9.3",
			cluster_id: cluster3,
			vectorized: 1,
			created_at: now - 2 * DAY_MS,
			updated_at: now - 2 * DAY_MS,
		},
		{
			id: "seed_yt_signal_8",
			transcript_id: transcript3,
			video_id: video3,
			organization_id: starterOrgId,
			type: "performance",
			severity: "high",
			text: "Massive frame drops during ability effects",
			context_before: "it drops to 30-40 FPS. There are",
			context_after: "Also the game crashed twice during my 3 hour session",
			timestamp_start: 205,
			timestamp_end: 215,
			confidence: 93,
			component: "Rendering",
			game_version: "0.9.3",
			cluster_id: cluster3,
			vectorized: 1,
			created_at: now - 2 * DAY_MS,
			updated_at: now - 2 * DAY_MS,
		},
		{
			id: "seed_yt_signal_9",
			transcript_id: transcript3,
			video_id: video3,
			organization_id: starterOrgId,
			type: "crash",
			severity: "critical",
			text: "The game crashed twice during my 3 hour session with an out of memory error",
			context_before:
				"There are massive frame drops during ability effects. Also",
			context_after:
				"The loading screen between matches takes about 45 seconds",
			timestamp_start: 220,
			timestamp_end: 240,
			confidence: 97,
			component: "Memory",
			game_version: "0.9.3",
			cluster_id: cluster4,
			vectorized: 0,
			created_at: now - 2 * DAY_MS,
			updated_at: now - 2 * DAY_MS,
		},
		{
			id: "seed_yt_signal_10",
			transcript_id: transcript3,
			video_id: video3,
			organization_id: starterOrgId,
			type: "performance",
			severity: "medium",
			text: "The loading screen between matches takes about 45 seconds which is way too long",
			context_before: "with an out of memory error.",
			context_after: null,
			timestamp_start: 250,
			timestamp_end: 262,
			confidence: 86,
			component: "Loading",
			game_version: "0.9.3",
			cluster_id: cluster3,
			vectorized: 0,
			created_at: now - 2 * DAY_MS,
			updated_at: now - 2 * DAY_MS,
		},
	];

	return seed;
};

const escapeSqlValue = (value) => {
	if (value === null || value === undefined) {
		return "NULL";
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

	// YouTube tables
	const ytGroups = [
		["yt_uploader_channel", seed.ytUploaderChannels],
		["yt_feed", seed.ytFeeds],
		["yt_video", seed.ytVideos],
		["yt_transcript", seed.ytTranscripts],
		["yt_cluster", seed.ytClusters],
		["yt_signal", seed.ytSignals],
	];

	for (const [table, rows] of ytGroups) {
		if (!rows) {
			continue;
		}
		for (const row of rows) {
			statements.push(upsertSql(table, ["id"], row));
		}
	}

	return statements;
};

const clearSeedNamespace = (sqlite) => {
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
		sqlite
			.prepare(`DELETE FROM ${quote(table)} WHERE ${quote("id")} LIKE 'seed_%'`)
			.run();
	}

	// Clear YouTube seed data
	for (const ytTable of [
		"yt_signal",
		"yt_transcript",
		"yt_video",
		"yt_cluster",
		"yt_feed",
	]) {
		try {
			sqlite
				.prepare(
					`DELETE FROM ${quote(ytTable)} WHERE ${quote("id")} LIKE 'seed_%'`
				)
				.run();
		} catch {
			// Table may not exist yet
		}
	}

	sqlite
		.prepare(
			`DELETE FROM ${quote("todo")} WHERE ${quote("id")} >= ? AND ${quote("id")} <= ?`
		)
		.run(TODO_ID_MIN, TODO_ID_MAX);
};

const writeSeedData = (sqlite, seed) => {
	const statements = collectSeedSql(seed);
	for (const statement of statements) {
		sqlite.exec(statement);
	}
};

const collectClearSql = () => {
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

	const statements = [];
	for (const table of prefixedTables) {
		statements.push(
			`DELETE FROM ${quote(table)} WHERE ${quote("id")} LIKE 'seed_%';`
		);
	}
	statements.push(
		`DELETE FROM ${quote("todo")} WHERE ${quote("id")} >= ${TODO_ID_MIN} AND ${quote("id")} <= ${TODO_ID_MAX};`
	);
	return statements;
};

const runWrangler = (args) => {
	const result = spawnSync("bunx", ["wrangler", ...args], {
		stdio: "inherit",
		env: process.env,
		cwd: path.resolve(repoRoot, "apps/server"),
	});

	if (result.error) {
		throw result.error;
	}
	if ((result.status ?? 1) !== 0) {
		throw new Error(`wrangler exited with code ${result.status}`);
	}
};

const seedRemote = async (options) => {
	const dbName = `${DB_PREFIX}-${options.stage}`;
	const adminPasswordHash = await hashPassword("admin");
	const operatorPasswordHash = await hashPassword("operator");

	const seed = buildSeedData({
		anchorDate: options.anchorDate,
		scenario: options.scenario,
		adminPasswordHash,
		operatorPasswordHash,
	});

	const allStatements = [];
	if (!options.append) {
		allStatements.push(...collectClearSql());
	}
	allStatements.push(...collectSeedSql(seed));

	const tmpDir = path.resolve(repoRoot, "tmp");
	mkdirSync(tmpDir, { recursive: true });
	const sqlPath = path.resolve(tmpDir, `seed-remote-${options.stage}.sql`);
	writeFileSync(sqlPath, allStatements.join("\n"), "utf8");

	console.log(
		`[seed] Generated ${allStatements.length} statements -> ${sqlPath}`
	);
	console.log(`[seed] Executing against remote D1: ${dbName}`);

	runWrangler([
		"d1",
		"execute",
		dbName,
		"--remote",
		"--file",
		sqlPath,
		"--yes",
	]);

	console.log(
		[
			`Seeded remote database: ${dbName}`,
			`Scenario: ${options.scenario}`,
			`Anchor date: ${options.anchorDate}`,
			`Organizations: ${seed.organizations.map((org) => org.slug).join(", ")}`,
			`Users: ${seed.users.length}, notifications: ${seed.notificationEvents.length}, todos: ${seed.todos.length}`,
			"Admin login: admin@admin.com / admin",
			"Operator login: operator@example.com / operator",
		].join("\n")
	);
};

const main = async () => {
	const options = parseArgs();

	if (options.remote) {
		await seedRemote(options);
		return;
	}

	const resolvedDbPath = options.dbPath ?? findLocalD1Database();
	const parentDir = path.dirname(resolvedDbPath);
	if (!existsSync(parentDir)) {
		mkdirSync(parentDir, { recursive: true });
	}

	const sqlite = new Database(resolvedDbPath);

	try {
		sqlite.pragma("foreign_keys = ON");
		ensureSchemaExists(sqlite);

		const adminPasswordHash = await hashPassword("admin");
		const operatorPasswordHash = await hashPassword("operator");

		const seed = buildSeedData({
			anchorDate: options.anchorDate,
			scenario: options.scenario,
			adminPasswordHash,
			operatorPasswordHash,
		});

		sqlite.transaction(() => {
			if (!options.append) {
				clearSeedNamespace(sqlite);
			}
			writeSeedData(sqlite, seed);
		})();

		console.log(
			[
				`Seeded local database: ${resolvedDbPath}`,
				`Scenario: ${options.scenario}`,
				`Anchor date: ${options.anchorDate}`,
				`Organizations: ${seed.organizations.map((org) => org.slug).join(", ")}`,
				`Users: ${seed.users.length}, notifications: ${seed.notificationEvents.length}, todos: ${seed.todos.length}`,
				"Admin login: admin@admin.com / admin",
				"Operator login: operator@example.com / operator",
			].join("\n")
		);
	} finally {
		sqlite.close();
	}
};

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
