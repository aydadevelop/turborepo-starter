#!/usr/bin/env node

import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const DEFAULT_ANCHOR_DATE = "2026-03-15";
const DEFAULT_SCENARIO = "baseline";

// Top-level regex constants for performance and linting
const MIGRATION_FILENAME_RE = /^\d+_.+\.sql$/;
const ANCHOR_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const TODO_ID_MIN = 900_000;
const TODO_ID_MAX = 900_999;

const scenarioCatalog = {
	baseline:
		"Core demo data for boats, pricing, bookings, support, and telegram callbacks.",
	"booking-pressure":
		"Adds overlap pressure, cancellation/dispute/refund lifecycle rows, and payment failures.",
	"pricing-intersections":
		"Adds stacked pricing-rule intersections for cross-midnight, weekend, duration, and passenger cases.",
	"support-escalation":
		"Adds escalated/closed ticket cases with multichannel inbound and failed callback paths.",
	full: "Combines booking-pressure, pricing-intersections, and support-escalation overlays.",
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
				"Run `npm run dev` first so Miniflare creates the local D1 database."
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
				"Run `npm run dev` first so Miniflare creates the local D1 database."
		);
	}

	const preferredDatabase = sqliteFiles.find((file) =>
		databaseHasTables(file.absolutePath, ["organization", "boat"])
	);

	return (preferredDatabase ?? latest).absolutePath;
};

const printHelp = () => {
	console.log(
		[
			"Usage: npm run db:seed -- [options]",
			"",
			"Options:",
			"  --db <path>                 Seed a specific sqlite file (relative to repository root)",
			`  --scenario <name>           Scenario to seed (default: ${DEFAULT_SCENARIO})`,
			`  --anchor-date <YYYY-MM-DD>  Stable UTC anchor date (default: ${DEFAULT_ANCHOR_DATE})`,
			"  --append                    Do not clear prior seed namespace before writing",
			"  --list-scenarios            Print available scenario names",
			"  -h, --help                  Show this help message",
			"",
			"Examples:",
			"  npm run db:seed",
			"  npm run db:seed -- --scenario booking-pressure",
			"  npm run db:seed -- --scenario pricing-intersections",
			"  npm run db:seed -- --scenario full --anchor-date 2026-06-01",
			"  npm run db:seed -- --db ./tmp/dev.sqlite --scenario support-escalation",
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

		// Flags that don't take a value
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
		i += 1; // skip value
	}

	if (!(result.scenario in scenarioCatalog)) {
		throw new Error(
			`Unknown scenario: ${result.scenario}. Use --list-scenarios to see valid values.`
		);
	}

	return {
		append: result.append,
		anchorDate: result.anchorDate,
		dbPath: result.dbPath,
		scenario: result.scenario,
	};
};

const quote = (identifier) => `"${identifier}"`;

const upsertRow = (sqlite, table, conflictColumns, row) => {
	const columns = Object.keys(row);
	const values = columns.map((column) => row[column]);
	const updateColumns = columns.filter(
		(column) => !conflictColumns.includes(column)
	);

	if (updateColumns.length === 0) {
		throw new Error(
			`Cannot upsert ${table}: no columns left to update for conflict target ${conflictColumns.join(", ")}`
		);
	}

	const statement = `
		INSERT INTO ${quote(table)} (${columns.map(quote).join(", ")})
		VALUES (${columns.map(() => "?").join(", ")})
		ON CONFLICT (${conflictColumns.map(quote).join(", ")})
		DO UPDATE SET ${updateColumns
			.map((column) => `${quote(column)} = excluded.${quote(column)}`)
			.join(", ")};
	`;

	sqlite.prepare(statement).run(...values);
};

const upsertMany = (sqlite, table, rows) => {
	for (const row of rows) {
		upsertRow(sqlite, table, ["id"], row);
	}
};

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
		message.includes("no such index")
	);
};

const applyMigrationsIfNeeded = (sqlite, requiredTables) => {
	const missingTables = getMissingTables(sqlite, requiredTables);
	if (missingTables.length === 0) {
		return;
	}

	const migrationsDir = path.resolve(scriptDir, "../src/migrations");
	const migrationFiles = readdirSync(migrationsDir)
		.filter((filename) => MIGRATION_FILENAME_RE.test(filename))
		.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
		.map((filename) => path.resolve(migrationsDir, filename));

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
		"member",
		"boat_dock",
		"boat",
		"boat_asset",
		"boat_amenity",
		"boat_calendar_connection",
		"boat_availability_block",
		"boat_pricing_profile",
		"boat_pricing_rule",
		"booking",
		"booking_calendar_link",
		"booking_discount_code",
		"booking_discount_application",
		"booking_payment_attempt",
		"booking_cancellation_request",
		"booking_dispute",
		"booking_refund",
		"support_ticket",
		"support_ticket_message",
		"inbound_message",
		"telegram_notification",
		"telegram_webhook_event",
		"todo",
	];

	applyMigrationsIfNeeded(sqlite, requiredTables);

	const missingRequiredTables = getMissingTables(sqlite, requiredTables);
	if (missingRequiredTables.length > 0) {
		throw new Error(
			[
				`Missing required tables: ${missingRequiredTables.join(", ")}`,
				"Apply schema first with:",
				"  npm run db:push",
			].join("\n")
		);
	}

	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS "passkey" (
			"id" text PRIMARY KEY NOT NULL,
			"name" text,
			"public_key" text NOT NULL,
			"user_id" text NOT NULL,
			"credential_id" text NOT NULL,
			"counter" integer NOT NULL,
			"device_type" text NOT NULL,
			"backed_up" integer DEFAULT false NOT NULL,
			"transports" text,
			"aaguid" text,
			"created_at" integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
			FOREIGN KEY ("user_id") REFERENCES "user"("id") ON UPDATE no action ON DELETE cascade
		);
		CREATE INDEX IF NOT EXISTS "passkey_userId_idx" ON "passkey" ("user_id");
		CREATE UNIQUE INDEX IF NOT EXISTS "passkey_credential_id_unique" ON "passkey" ("credential_id");
	`);
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

const buildBaselineSeedData = ({ anchorDateMs }) => {
	const atUtc = (dayOffset, hour, minute = 0) =>
		anchorDateMs + dayOffset * DAY_MS + hour * HOUR_MS + minute * 60 * 1000;
	const now = atUtc(0, 9);

	const organizationId = "seed_org_demo_marina";
	const userOwnerId = "seed_user_owner_alex";
	const userManagerId = "seed_user_manager_olga";
	const userAgentId = "seed_user_agent_nina";
	const userCustomerId = "seed_user_customer_ivan";

	const dockNorthId = "seed_dock_demo_north";
	const dockSouthId = "seed_dock_demo_south";

	const boatAuroraId = "seed_boat_aurora";
	const boatOdysseyId = "seed_boat_odyssey";
	const boatNightShiftId = "seed_boat_night_shift";

	const bookingConfirmedId = "seed_booking_aurora_confirmed";
	const bookingPendingId = "seed_booking_odyssey_pending";
	const bookingCompletedId = "seed_booking_aurora_completed";

	const ticketOpenId = "seed_ticket_open_route_help";
	const ticketResolvedId = "seed_ticket_resolved_feedback";
	const inboundOpenId = "seed_inbound_telegram_open_1001";

	const seed = {
		now,
		atUtc,
		organization: {
			id: organizationId,
			name: "Seed Demo Marina",
			slug: "seed-demo-marina",
			logo: null,
			metadata: toJson({
				seedNamespace: "seed",
				timezone: "Europe/Moscow",
			}),
			created_at: now,
		},
		users: withCommon(
			[
				{
					id: userOwnerId,
					name: "Alex Owner",
					email: "owner+seed@boat.local",
					email_verified: 1,
					image: null,
				},
				{
					id: userManagerId,
					name: "Olga Manager",
					email: "manager+seed@boat.local",
					email_verified: 1,
					image: null,
				},
				{
					id: userAgentId,
					name: "Nina Agent",
					email: "agent+seed@boat.local",
					email_verified: 1,
					image: null,
				},
				{
					id: userCustomerId,
					name: "Ivan Petrov",
					email: "customer+seed@boat.local",
					email_verified: 1,
					image: null,
				},
			],
			now
		),
		members: [
			{
				id: "seed_member_owner_alex",
				organization_id: organizationId,
				user_id: userOwnerId,
				role: "org_owner",
				created_at: now,
			},
			{
				id: "seed_member_manager_olga",
				organization_id: organizationId,
				user_id: userManagerId,
				role: "manager",
				created_at: now,
			},
			{
				id: "seed_member_agent_nina",
				organization_id: organizationId,
				user_id: userAgentId,
				role: "agent",
				created_at: now,
			},
		],
		docks: withCommon(
			[
				{
					id: dockNorthId,
					organization_id: organizationId,
					name: "North Pier",
					slug: "seed-north-pier",
					description: "Primary departure dock",
					address: "River Embankment 10, Saint Petersburg",
					latitude: 59.9386,
					longitude: 30.3141,
					is_active: 1,
				},
				{
					id: dockSouthId,
					organization_id: organizationId,
					name: "South Marina",
					slug: "seed-south-marina",
					description: "Backup departure dock",
					address: "Canal Street 25, Saint Petersburg",
					latitude: 59.9275,
					longitude: 30.3017,
					is_active: 1,
				},
			],
			now
		),
		boats: [
			{
				id: boatAuroraId,
				organization_id: organizationId,
				dock_id: dockNorthId,
				name: "Aurora 8",
				slug: "seed-aurora-8",
				description: "Fast city cruise motor boat",
				type: "motor",
				passenger_capacity: 8,
				crew_capacity: 1,
				minimum_hours: 1,
				minimum_notice_minutes: 120,
				working_hours_start: 8,
				working_hours_end: 23,
				timezone: "Europe/Moscow",
				status: "active",
				is_active: 1,
				approved_at: now - 20 * DAY_MS,
				archived_at: null,
				metadata: toJson({ tags: ["city", "family"] }),
				created_at: now - 30 * DAY_MS,
				updated_at: now,
			},
			{
				id: boatOdysseyId,
				organization_id: organizationId,
				dock_id: dockSouthId,
				name: "Odyssey 12",
				slug: "seed-odyssey-12",
				description: "Comfort yacht for events",
				type: "yacht",
				passenger_capacity: 12,
				crew_capacity: 2,
				minimum_hours: 2,
				minimum_notice_minutes: 180,
				working_hours_start: 10,
				working_hours_end: 22,
				timezone: "Europe/Moscow",
				status: "active",
				is_active: 1,
				approved_at: now - 20 * DAY_MS,
				archived_at: null,
				metadata: toJson({ tags: ["vip", "night"] }),
				created_at: now - 30 * DAY_MS,
				updated_at: now,
			},
			{
				id: boatNightShiftId,
				organization_id: organizationId,
				dock_id: dockNorthId,
				name: "Night Shift 10",
				slug: "seed-night-shift-10",
				description: "Late-night city tour boat with cross-midnight window",
				type: "motor",
				passenger_capacity: 10,
				crew_capacity: 2,
				minimum_hours: 2,
				minimum_notice_minutes: 90,
				working_hours_start: 18,
				working_hours_end: 4,
				timezone: "Europe/Moscow",
				status: "active",
				is_active: 1,
				approved_at: now - 20 * DAY_MS,
				archived_at: null,
				metadata: toJson({ tags: ["night", "party"] }),
				created_at: now - 30 * DAY_MS,
				updated_at: now,
			},
		],
		assets: withCommon(
			[
				{
					id: "seed_asset_aurora_hero",
					boat_id: boatAuroraId,
					asset_type: "image",
					purpose: "gallery",
					storage_key: "seed/boats/aurora/hero.jpg",
					file_name: "aurora-hero.jpg",
					mime_type: "image/jpeg",
					size_bytes: 325_000,
					uploaded_by_user_id: userManagerId,
					sort_order: 0,
					is_primary: 1,
					review_status: "approved",
					review_note: null,
				},
				{
					id: "seed_asset_aurora_side",
					boat_id: boatAuroraId,
					asset_type: "image",
					purpose: "gallery",
					storage_key: "seed/boats/aurora/side.jpg",
					file_name: "aurora-side.jpg",
					mime_type: "image/jpeg",
					size_bytes: 298_000,
					uploaded_by_user_id: userAgentId,
					sort_order: 1,
					is_primary: 0,
					review_status: "approved",
					review_note: null,
				},
				{
					id: "seed_asset_odyssey_doc",
					boat_id: boatOdysseyId,
					asset_type: "document",
					purpose: "registration",
					storage_key: "seed/boats/odyssey/registration.pdf",
					file_name: "odyssey-registration.pdf",
					mime_type: "application/pdf",
					size_bytes: 102_400,
					uploaded_by_user_id: userManagerId,
					sort_order: 0,
					is_primary: 1,
					review_status: "approved",
					review_note: null,
				},
				{
					id: "seed_asset_night_shift_hero",
					boat_id: boatNightShiftId,
					asset_type: "image",
					purpose: "gallery",
					storage_key: "seed/boats/night-shift/hero.jpg",
					file_name: "night-shift-hero.jpg",
					mime_type: "image/jpeg",
					size_bytes: 341_000,
					uploaded_by_user_id: userAgentId,
					sort_order: 0,
					is_primary: 1,
					review_status: "approved",
					review_note: null,
				},
			],
			now
		),
		amenities: withCommon(
			[
				{
					id: "seed_amenity_aurora_wifi",
					boat_id: boatAuroraId,
					key: "wifi",
					label: "Wi-Fi",
					is_enabled: 1,
					value: "free",
				},
				{
					id: "seed_amenity_aurora_audio",
					boat_id: boatAuroraId,
					key: "audio_system",
					label: "Bluetooth audio",
					is_enabled: 1,
					value: "jbl-500w",
				},
				{
					id: "seed_amenity_odyssey_cabin",
					boat_id: boatOdysseyId,
					key: "heated_cabin",
					label: "Heated cabin",
					is_enabled: 1,
					value: "yes",
				},
				{
					id: "seed_amenity_night_shift_led",
					boat_id: boatNightShiftId,
					key: "led_lights",
					label: "LED party lights",
					is_enabled: 1,
					value: "rgb",
				},
			],
			now
		),
		calendarConnections: withCommon(
			[
				{
					id: "seed_calendar_aurora_primary",
					boat_id: boatAuroraId,
					provider: "google",
					external_calendar_id: "seed-aurora-bookings@demo.local",
					sync_token: null,
					watch_channel_id: null,
					watch_resource_id: null,
					watch_expires_at: null,
					last_synced_at: now,
					sync_status: "idle",
					last_error: null,
					is_primary: 1,
				},
				{
					id: "seed_calendar_odyssey_primary",
					boat_id: boatOdysseyId,
					provider: "google",
					external_calendar_id: "seed-odyssey-bookings@demo.local",
					sync_token: null,
					watch_channel_id: null,
					watch_resource_id: null,
					watch_expires_at: null,
					last_synced_at: now,
					sync_status: "idle",
					last_error: null,
					is_primary: 1,
				},
				{
					id: "seed_calendar_night_shift_primary",
					boat_id: boatNightShiftId,
					provider: "google",
					external_calendar_id: "seed-night-shift-bookings@demo.local",
					sync_token: null,
					watch_channel_id: null,
					watch_resource_id: null,
					watch_expires_at: null,
					last_synced_at: now,
					sync_status: "idle",
					last_error: null,
					is_primary: 1,
				},
			],
			now
		),
		availabilityBlocks: withCommon(
			[
				{
					id: "seed_block_odyssey_maintenance",
					boat_id: boatOdysseyId,
					calendar_connection_id: null,
					source: "maintenance",
					external_ref: "seed-maintenance-odyssey",
					starts_at: atUtc(3, 9),
					ends_at: atUtc(3, 13),
					reason: "Engine diagnostics",
					created_by_user_id: userManagerId,
					is_active: 1,
				},
			],
			now
		),
		pricingProfiles: withCommon(
			[
				{
					id: "seed_pricing_aurora_base",
					boat_id: boatAuroraId,
					name: "Base 2026",
					currency: "RUB",
					base_hourly_price_cents: 150_000,
					minimum_hours: 1,
					deposit_percentage: 20,
					service_fee_percentage: 5,
					affiliate_fee_percentage: 5,
					tax_percentage: 0,
					acquiring_fee_percentage: 2,
					valid_from: now - 10 * DAY_MS,
					valid_to: null,
					is_default: 1,
					created_by_user_id: userManagerId,
					archived_at: null,
				},
				{
					id: "seed_pricing_odyssey_base",
					boat_id: boatOdysseyId,
					name: "Base 2026",
					currency: "RUB",
					base_hourly_price_cents: 240_000,
					minimum_hours: 2,
					deposit_percentage: 25,
					service_fee_percentage: 7,
					affiliate_fee_percentage: 5,
					tax_percentage: 0,
					acquiring_fee_percentage: 2,
					valid_from: now - 10 * DAY_MS,
					valid_to: null,
					is_default: 1,
					created_by_user_id: userManagerId,
					archived_at: null,
				},
				{
					id: "seed_pricing_night_shift_base",
					boat_id: boatNightShiftId,
					name: "Night Shift 2026",
					currency: "RUB",
					base_hourly_price_cents: 190_000,
					minimum_hours: 2,
					deposit_percentage: 30,
					service_fee_percentage: 7,
					affiliate_fee_percentage: 5,
					tax_percentage: 0,
					acquiring_fee_percentage: 2,
					valid_from: now - 10 * DAY_MS,
					valid_to: null,
					is_default: 1,
					created_by_user_id: userManagerId,
					archived_at: null,
				},
			],
			now
		),
		pricingRules: withCommon(
			[
				{
					id: "seed_pricing_rule_aurora_weekend",
					boat_id: boatAuroraId,
					pricing_profile_id: "seed_pricing_aurora_base",
					name: "Weekend surcharge",
					rule_type: "weekend_surcharge",
					condition_json: toJson({ weekendDays: [0, 6] }),
					adjustment_type: "percentage",
					adjustment_value: 15,
					priority: 100,
					is_active: 1,
				},
				{
					id: "seed_pricing_rule_aurora_evening",
					boat_id: boatAuroraId,
					pricing_profile_id: "seed_pricing_aurora_base",
					name: "Evening surcharge",
					rule_type: "time_window",
					condition_json: toJson({ startHour: 19, endHour: 23 }),
					adjustment_type: "percentage",
					adjustment_value: 20,
					priority: 90,
					is_active: 1,
				},
				{
					id: "seed_pricing_rule_odyssey_long",
					boat_id: boatOdysseyId,
					pricing_profile_id: "seed_pricing_odyssey_base",
					name: "4h+ discount",
					rule_type: "duration_discount",
					condition_json: toJson({ minHours: 4 }),
					adjustment_type: "percentage",
					adjustment_value: 10,
					priority: 80,
					is_active: 1,
				},
				{
					id: "seed_pricing_rule_odyssey_evening",
					boat_id: boatOdysseyId,
					pricing_profile_id: "seed_pricing_odyssey_base",
					name: "Prime-time surcharge",
					rule_type: "time_window",
					condition_json: toJson({ startHour: 18, endHour: 22 }),
					adjustment_type: "percentage",
					adjustment_value: 18,
					priority: 90,
					is_active: 1,
				},
				{
					id: "seed_pricing_rule_night_shift_night",
					boat_id: boatNightShiftId,
					pricing_profile_id: "seed_pricing_night_shift_base",
					name: "Deep-night surcharge",
					rule_type: "time_window",
					condition_json: toJson({ startHour: 22, endHour: 6 }),
					adjustment_type: "percentage",
					adjustment_value: 25,
					priority: 100,
					is_active: 1,
				},
			],
			now
		),
		discountCodes: withCommon(
			[
				{
					id: "seed_discount_early10",
					organization_id: organizationId,
					code: "SEED_EARLY10",
					name: "Early booking 10%",
					description: "Valid for early reservations",
					discount_type: "percentage",
					discount_value: 10,
					max_discount_cents: 60_000,
					minimum_subtotal_cents: 100_000,
					valid_from: now - 7 * DAY_MS,
					valid_to: now + 180 * DAY_MS,
					usage_limit: 500,
					usage_count: 1,
					per_customer_limit: 5,
					applies_to_boat_id: null,
					is_active: 1,
					created_by_user_id: userManagerId,
					metadata: toJson({ campaign: "seed-spring-2026" }),
				},
				{
					id: "seed_discount_vip5000",
					organization_id: organizationId,
					code: "SEED_VIP5000",
					name: "VIP flat discount",
					description: "Flat 5,000 RUB for Odyssey",
					discount_type: "fixed_cents",
					discount_value: 500_000,
					max_discount_cents: null,
					minimum_subtotal_cents: 200_000,
					valid_from: now - 7 * DAY_MS,
					valid_to: now + 180 * DAY_MS,
					usage_limit: null,
					usage_count: 0,
					per_customer_limit: null,
					applies_to_boat_id: boatOdysseyId,
					is_active: 1,
					created_by_user_id: userManagerId,
					metadata: toJson({ campaign: "seed-vip-2026" }),
				},
			],
			now
		),
		bookings: withCommon(
			[
				{
					id: bookingConfirmedId,
					organization_id: organizationId,
					boat_id: boatAuroraId,
					customer_user_id: userCustomerId,
					created_by_user_id: userManagerId,
					source: "web",
					status: "confirmed",
					payment_status: "paid",
					calendar_sync_status: "linked",
					starts_at: atUtc(1, 10),
					ends_at: atUtc(1, 13),
					passengers: 6,
					contact_name: "Ivan Petrov",
					contact_phone: "+79991234567",
					contact_email: "customer+seed@boat.local",
					timezone: "Europe/Moscow",
					base_price_cents: 450_000,
					discount_amount_cents: 45_000,
					total_price_cents: 405_000,
					currency: "RUB",
					notes: "Birthday route",
					special_requests: "Need champagne glasses",
					external_ref: "seed-web-order-1001",
					cancelled_at: null,
					cancelled_by_user_id: null,
					cancellation_reason: null,
					refund_amount_cents: null,
					metadata: toJson({ channel: "web", scenario: "baseline" }),
				},
				{
					id: bookingPendingId,
					organization_id: organizationId,
					boat_id: boatOdysseyId,
					customer_user_id: userCustomerId,
					created_by_user_id: userManagerId,
					source: "telegram",
					status: "pending",
					payment_status: "unpaid",
					calendar_sync_status: "linked",
					starts_at: atUtc(2, 18),
					ends_at: atUtc(2, 22),
					passengers: 10,
					contact_name: "Ivan Petrov",
					contact_phone: "+79991234567",
					contact_email: "customer+seed@boat.local",
					timezone: "Europe/Moscow",
					base_price_cents: 960_000,
					discount_amount_cents: 0,
					total_price_cents: 960_000,
					currency: "RUB",
					notes: "Corporate event",
					special_requests: null,
					external_ref: "seed-tg-lead-2204",
					cancelled_at: null,
					cancelled_by_user_id: null,
					cancellation_reason: null,
					refund_amount_cents: null,
					metadata: toJson({ channel: "telegram", scenario: "baseline" }),
				},
				{
					id: bookingCompletedId,
					organization_id: organizationId,
					boat_id: boatAuroraId,
					customer_user_id: userCustomerId,
					created_by_user_id: userManagerId,
					source: "partner",
					status: "completed",
					payment_status: "paid",
					calendar_sync_status: "linked",
					starts_at: atUtc(-3, 11),
					ends_at: atUtc(-3, 14),
					passengers: 5,
					contact_name: "Ivan Petrov",
					contact_phone: "+79991234567",
					contact_email: "customer+seed@boat.local",
					timezone: "Europe/Moscow",
					base_price_cents: 420_000,
					discount_amount_cents: 0,
					total_price_cents: 420_000,
					currency: "RUB",
					notes: null,
					special_requests: null,
					external_ref: "seed-partner-order-77",
					cancelled_at: null,
					cancelled_by_user_id: null,
					cancellation_reason: null,
					refund_amount_cents: null,
					metadata: toJson({ channel: "partner", scenario: "baseline" }),
				},
			],
			now
		),
		bookingCalendarLinks: withCommon(
			[
				{
					id: "seed_booking_link_aurora_confirmed",
					booking_id: bookingConfirmedId,
					boat_calendar_connection_id: "seed_calendar_aurora_primary",
					provider: "google",
					external_calendar_id: "seed-aurora-bookings@demo.local",
					external_event_id: "seed-evt-aurora-1001",
					ical_uid: "seed-evt-aurora-1001@demo.local",
					external_event_version: "1",
					synced_at: now,
					sync_error: null,
				},
				{
					id: "seed_booking_link_odyssey_pending",
					booking_id: bookingPendingId,
					boat_calendar_connection_id: "seed_calendar_odyssey_primary",
					provider: "google",
					external_calendar_id: "seed-odyssey-bookings@demo.local",
					external_event_id: "seed-evt-odyssey-2204",
					ical_uid: "seed-evt-odyssey-2204@demo.local",
					external_event_version: "1",
					synced_at: now,
					sync_error: null,
				},
				{
					id: "seed_booking_link_aurora_completed",
					booking_id: bookingCompletedId,
					boat_calendar_connection_id: "seed_calendar_aurora_primary",
					provider: "google",
					external_calendar_id: "seed-aurora-bookings@demo.local",
					external_event_id: "seed-evt-aurora-legacy-77",
					ical_uid: "seed-evt-aurora-legacy-77@demo.local",
					external_event_version: "4",
					synced_at: now - 2 * DAY_MS,
					sync_error: null,
				},
			],
			now
		),
		discountApplications: [
			{
				id: "seed_discount_application_booking_aurora_confirmed",
				booking_id: bookingConfirmedId,
				discount_code_id: "seed_discount_early10",
				code: "SEED_EARLY10",
				discount_type: "percentage",
				discount_value: 10,
				applied_amount_cents: 45_000,
				applied_at: now,
				created_at: now,
				updated_at: now,
			},
		],
		paymentAttempts: withCommon(
			[
				{
					id: "seed_payment_attempt_confirmed_captured",
					booking_id: bookingConfirmedId,
					organization_id: organizationId,
					requested_by_user_id: userManagerId,
					provider: "manual",
					idempotency_key: "seed-pay-confirmed-1",
					provider_intent_id: "seed-intent-confirmed-1",
					status: "captured",
					amount_cents: 405_000,
					currency: "RUB",
					failure_reason: null,
					metadata: toJson({ source: "seed-baseline" }),
					processed_at: now,
				},
			],
			now
		),
		cancellationRequests: [],
		disputes: [],
		refunds: [],
		supportTickets: withCommon(
			[
				{
					id: ticketOpenId,
					organization_id: organizationId,
					booking_id: bookingPendingId,
					customer_user_id: userCustomerId,
					created_by_user_id: userAgentId,
					assigned_to_user_id: userManagerId,
					resolved_by_user_id: null,
					source: "telegram",
					status: "pending_operator",
					priority: "high",
					subject: "Need pickup confirmation",
					description: "Customer asks for exact pier and captain contact",
					due_at: atUtc(2, 16),
					resolved_at: null,
					closed_at: null,
					metadata: toJson({ lane: "ops" }),
				},
				{
					id: ticketResolvedId,
					organization_id: organizationId,
					booking_id: bookingCompletedId,
					customer_user_id: userCustomerId,
					created_by_user_id: userAgentId,
					assigned_to_user_id: userManagerId,
					resolved_by_user_id: userManagerId,
					source: "web",
					status: "resolved",
					priority: "normal",
					subject: "Route feedback",
					description: "Customer requested post-trip invoice details",
					due_at: atUtc(-2, 15),
					resolved_at: atUtc(-2, 16),
					closed_at: null,
					metadata: toJson({ lane: "aftercare" }),
				},
			],
			now
		),
		supportMessages: withCommon(
			[
				{
					id: "seed_ticket_message_open_customer",
					ticket_id: ticketOpenId,
					organization_id: organizationId,
					author_user_id: userCustomerId,
					channel: "telegram",
					body: "Can you confirm exact pickup location?",
					attachments_json: null,
					is_internal: 0,
				},
				{
					id: "seed_ticket_message_open_operator",
					ticket_id: ticketOpenId,
					organization_id: organizationId,
					author_user_id: userAgentId,
					channel: "internal",
					body: "Escalating to manager for final berth assignment.",
					attachments_json: null,
					is_internal: 1,
				},
				{
					id: "seed_ticket_message_resolved",
					ticket_id: ticketResolvedId,
					organization_id: organizationId,
					author_user_id: userManagerId,
					channel: "web",
					body: "Invoice sent to your email. Thanks for feedback!",
					attachments_json: null,
					is_internal: 0,
				},
			],
			now
		),
		inboundMessages: withCommon(
			[
				{
					id: inboundOpenId,
					organization_id: organizationId,
					ticket_id: ticketOpenId,
					channel: "telegram",
					external_message_id: "seed-tg-1001",
					external_thread_id: "seed-chat-500",
					external_sender_id: "seed-user-500",
					sender_display_name: "Ivan Petrov",
					dedupe_key: "seed:telegram:1001:500",
					normalized_text: "can you confirm exact pickup location",
					payload: toJson({ text: "Can you confirm exact pickup location?" }),
					status: "processed",
					error_message: null,
					received_at: atUtc(0, 12),
					processed_at: atUtc(0, 12),
				},
			],
			now
		),
		telegramNotifications: withCommon(
			[
				{
					id: "seed_notification_ticket_open_sent",
					organization_id: organizationId,
					ticket_id: ticketOpenId,
					requested_by_user_id: userAgentId,
					template_key: "support.reply",
					recipient_chat_id: "500",
					idempotency_key: "seed-notif-open-1",
					payload: toJson({ text: "Manager will confirm in 10 minutes" }),
					status: "sent",
					provider_message_id: "seed-msg-9001",
					failure_reason: null,
					attempt_count: 1,
					sent_at: atUtc(0, 12),
				},
			],
			now
		),
		telegramWebhookEvents: withCommon(
			[
				{
					id: "seed_webhook_event_5001001",
					organization_id: organizationId,
					inbound_message_id: inboundOpenId,
					update_id: 5_001_001,
					event_type: "message",
					chat_id: "500",
					payload: toJson({ message: { text: "Need pickup confirmation" } }),
					status: "processed",
					error_message: null,
					received_at: atUtc(0, 12),
					processed_at: atUtc(0, 12),
				},
			],
			now
		),
		todos: [
			{ id: 900_001, text: "Review pending support tickets", completed: 0 },
			{ id: 900_002, text: "Verify calendar links health", completed: 0 },
			{ id: 900_003, text: "Check booking overlap alerts", completed: 1 },
		],
	};

	return seed;
};

const applyBookingPressureScenario = (seed) => {
	const { atUtc, now } = seed;
	const organizationId = seed.organization.id;
	const userManagerId = "seed_user_manager_olga";
	const userCustomerId = "seed_user_customer_ivan";

	seed.bookings.push(
		{
			id: "seed_booking_aurora_overlap_confirmed",
			organization_id: organizationId,
			boat_id: "seed_boat_aurora",
			customer_user_id: userCustomerId,
			created_by_user_id: userManagerId,
			source: "api",
			status: "confirmed",
			payment_status: "partially_paid",
			calendar_sync_status: "linked",
			starts_at: atUtc(1, 12),
			ends_at: atUtc(1, 15),
			passengers: 4,
			contact_name: "Ivan Petrov",
			contact_phone: "+79991234567",
			contact_email: "customer+seed@boat.local",
			timezone: "Europe/Moscow",
			base_price_cents: 360_000,
			discount_amount_cents: 0,
			total_price_cents: 360_000,
			currency: "RUB",
			notes: "Intentional overlap for stress checks",
			special_requests: null,
			external_ref: "seed-api-overlap-1",
			cancelled_at: null,
			cancelled_by_user_id: null,
			cancellation_reason: null,
			refund_amount_cents: null,
			metadata: toJson({ scenario: "booking-pressure" }),
			created_at: now,
			updated_at: now,
		},
		{
			id: "seed_booking_odyssey_cancelled",
			organization_id: organizationId,
			boat_id: "seed_boat_odyssey",
			customer_user_id: userCustomerId,
			created_by_user_id: userManagerId,
			source: "web",
			status: "cancelled",
			payment_status: "refunded",
			calendar_sync_status: "detached",
			starts_at: atUtc(-1, 18),
			ends_at: atUtc(-1, 21),
			passengers: 9,
			contact_name: "Ivan Petrov",
			contact_phone: "+79991234567",
			contact_email: "customer+seed@boat.local",
			timezone: "Europe/Moscow",
			base_price_cents: 840_000,
			discount_amount_cents: 0,
			total_price_cents: 840_000,
			currency: "RUB",
			notes: "Cancelled by customer",
			special_requests: null,
			external_ref: "seed-web-cancelled-1",
			cancelled_at: atUtc(-2, 12),
			cancelled_by_user_id: userCustomerId,
			cancellation_reason: "Weather concerns",
			refund_amount_cents: 500_000,
			metadata: toJson({ scenario: "booking-pressure" }),
			created_at: now,
			updated_at: now,
		}
	);

	seed.bookingCalendarLinks.push(
		{
			id: "seed_booking_link_aurora_overlap",
			booking_id: "seed_booking_aurora_overlap_confirmed",
			boat_calendar_connection_id: "seed_calendar_aurora_primary",
			provider: "google",
			external_calendar_id: "seed-aurora-bookings@demo.local",
			external_event_id: "seed-evt-aurora-overlap-1",
			ical_uid: "seed-evt-aurora-overlap-1@demo.local",
			external_event_version: "1",
			synced_at: now,
			sync_error: null,
			created_at: now,
			updated_at: now,
		},
		{
			id: "seed_booking_link_odyssey_cancelled",
			booking_id: "seed_booking_odyssey_cancelled",
			boat_calendar_connection_id: "seed_calendar_odyssey_primary",
			provider: "google",
			external_calendar_id: "seed-odyssey-bookings@demo.local",
			external_event_id: "seed-evt-odyssey-cancelled-1",
			ical_uid: "seed-evt-odyssey-cancelled-1@demo.local",
			external_event_version: "2",
			synced_at: now,
			sync_error: null,
			created_at: now,
			updated_at: now,
		}
	);

	seed.paymentAttempts.push(
		{
			id: "seed_payment_attempt_pending_failed",
			booking_id: "seed_booking_odyssey_pending",
			organization_id: organizationId,
			requested_by_user_id: userManagerId,
			provider: "manual",
			idempotency_key: "seed-pay-pending-failed-1",
			provider_intent_id: "seed-intent-pending-failed-1",
			status: "failed",
			amount_cents: 960_000,
			currency: "RUB",
			failure_reason: "3DS timeout",
			metadata: toJson({ scenario: "booking-pressure" }),
			processed_at: atUtc(0, 13),
			created_at: now,
			updated_at: now,
		},
		{
			id: "seed_payment_attempt_pending_requires_action",
			booking_id: "seed_booking_odyssey_pending",
			organization_id: organizationId,
			requested_by_user_id: userManagerId,
			provider: "manual",
			idempotency_key: "seed-pay-pending-action-1",
			provider_intent_id: "seed-intent-pending-action-1",
			status: "requires_action",
			amount_cents: 960_000,
			currency: "RUB",
			failure_reason: null,
			metadata: toJson({ scenario: "booking-pressure" }),
			processed_at: atUtc(0, 14),
			created_at: now,
			updated_at: now,
		}
	);

	seed.cancellationRequests.push({
		id: "seed_cancellation_request_pending",
		booking_id: "seed_booking_odyssey_pending",
		organization_id: organizationId,
		requested_by_user_id: userCustomerId,
		reason: "Schedule conflict",
		status: "requested",
		reviewed_by_user_id: null,
		reviewed_at: null,
		review_note: null,
		requested_at: atUtc(0, 15),
		created_at: now,
		updated_at: now,
	});

	seed.disputes.push({
		id: "seed_dispute_completed_service",
		booking_id: "seed_booking_aurora_completed",
		organization_id: organizationId,
		raised_by_user_id: userCustomerId,
		status: "under_review",
		reason_code: "service_quality",
		details: "Customer claims route duration was shorter than planned.",
		resolution: null,
		resolved_by_user_id: null,
		resolved_at: null,
		created_at: now,
		updated_at: now,
	});

	seed.refunds.push({
		id: "seed_refund_completed_requested",
		booking_id: "seed_booking_aurora_completed",
		organization_id: organizationId,
		requested_by_user_id: userCustomerId,
		approved_by_user_id: null,
		processed_by_user_id: null,
		status: "requested",
		amount_cents: 90_000,
		currency: "RUB",
		reason: "Partial service mismatch",
		provider: "manual",
		external_refund_id: "seed-refund-aurora-1",
		failure_reason: null,
		metadata: toJson({ scenario: "booking-pressure" }),
		requested_at: atUtc(0, 16),
		approved_at: null,
		processed_at: null,
		created_at: now,
		updated_at: now,
	});
};

const applySupportEscalationScenario = (seed) => {
	const { atUtc, now } = seed;
	const organizationId = seed.organization.id;
	const userManagerId = "seed_user_manager_olga";
	const userAgentId = "seed_user_agent_nina";
	const userCustomerId = "seed_user_customer_ivan";

	seed.supportTickets.push(
		{
			id: "seed_ticket_escalated_payment",
			organization_id: organizationId,
			booking_id: "seed_booking_odyssey_pending",
			customer_user_id: userCustomerId,
			created_by_user_id: userAgentId,
			assigned_to_user_id: userManagerId,
			resolved_by_user_id: null,
			source: "telegram",
			status: "escalated",
			priority: "urgent",
			subject: "Payment keeps failing",
			description:
				"Customer reports repeated payment attempts failing in checkout.",
			due_at: atUtc(0, 18),
			resolved_at: null,
			closed_at: null,
			metadata: toJson({ scenario: "support-escalation", lane: "payments" }),
			created_at: now,
			updated_at: now,
		},
		{
			id: "seed_ticket_closed_old",
			organization_id: organizationId,
			booking_id: "seed_booking_aurora_completed",
			customer_user_id: userCustomerId,
			created_by_user_id: userAgentId,
			assigned_to_user_id: userManagerId,
			resolved_by_user_id: userManagerId,
			source: "email",
			status: "closed",
			priority: "low",
			subject: "Receipt copy",
			description: "Customer asked for another copy of receipt.",
			due_at: atUtc(-2, 10),
			resolved_at: atUtc(-2, 11),
			closed_at: atUtc(-2, 12),
			metadata: toJson({ scenario: "support-escalation", lane: "archive" }),
			created_at: now,
			updated_at: now,
		}
	);

	seed.supportMessages.push(
		{
			id: "seed_ticket_message_escalated_customer",
			ticket_id: "seed_ticket_escalated_payment",
			organization_id: organizationId,
			author_user_id: userCustomerId,
			channel: "telegram",
			body: "I was charged but booking is still pending.",
			attachments_json: null,
			is_internal: 0,
			created_at: now,
			updated_at: now,
		},
		{
			id: "seed_ticket_message_escalated_internal",
			ticket_id: "seed_ticket_escalated_payment",
			organization_id: organizationId,
			author_user_id: userManagerId,
			channel: "internal",
			body: "Escalated to payment ops; waiting provider callback reconciliation.",
			attachments_json: null,
			is_internal: 1,
			created_at: now,
			updated_at: now,
		},
		{
			id: "seed_ticket_message_closed_reply",
			ticket_id: "seed_ticket_closed_old",
			organization_id: organizationId,
			author_user_id: userManagerId,
			channel: "email",
			body: "Receipt copy attached and case closed.",
			attachments_json: toJson([
				{ type: "pdf", key: "seed/receipts/copy.pdf" },
			]),
			is_internal: 0,
			created_at: now,
			updated_at: now,
		}
	);

	seed.inboundMessages.push(
		{
			id: "seed_inbound_telegram_escalated_1002",
			organization_id: organizationId,
			ticket_id: "seed_ticket_escalated_payment",
			channel: "telegram",
			external_message_id: "seed-tg-1002",
			external_thread_id: "seed-chat-500",
			external_sender_id: "seed-user-500",
			sender_display_name: "Ivan Petrov",
			dedupe_key: "seed:telegram:1002:500",
			normalized_text: "i was charged but booking is still pending",
			payload: toJson({ text: "I was charged but booking is still pending." }),
			status: "processed",
			error_message: null,
			received_at: atUtc(0, 17),
			processed_at: atUtc(0, 17),
			created_at: now,
			updated_at: now,
		},
		{
			id: "seed_inbound_sputnik_failed_2001",
			organization_id: organizationId,
			ticket_id: null,
			channel: "sputnik",
			external_message_id: "seed-sputnik-2001",
			external_thread_id: "seed-thread-77",
			external_sender_id: "seed-mailbox",
			sender_display_name: "Marketing Bot",
			dedupe_key: "seed:sputnik:2001:77",
			normalized_text: "partner webhook malformed",
			payload: toJson({ subject: "Malformed callback" }),
			status: "failed",
			error_message: "Schema mismatch",
			received_at: atUtc(0, 18),
			processed_at: atUtc(0, 18),
			created_at: now,
			updated_at: now,
		}
	);

	seed.telegramNotifications.push(
		{
			id: "seed_notification_escalated_failed",
			organization_id: organizationId,
			ticket_id: "seed_ticket_escalated_payment",
			requested_by_user_id: userManagerId,
			template_key: "payment.failed",
			recipient_chat_id: "500",
			idempotency_key: "seed-notif-escalated-1",
			payload: toJson({ text: "We are investigating your payment issue." }),
			status: "failed",
			provider_message_id: null,
			failure_reason: "429 rate limit",
			attempt_count: 3,
			sent_at: null,
			created_at: now,
			updated_at: now,
		},
		{
			id: "seed_notification_escalated_queued",
			organization_id: organizationId,
			ticket_id: "seed_ticket_escalated_payment",
			requested_by_user_id: userManagerId,
			template_key: "support.reply",
			recipient_chat_id: "500",
			idempotency_key: "seed-notif-escalated-2",
			payload: toJson({ text: "Ops team will update shortly." }),
			status: "queued",
			provider_message_id: null,
			failure_reason: null,
			attempt_count: 0,
			sent_at: null,
			created_at: now,
			updated_at: now,
		}
	);

	seed.telegramWebhookEvents.push(
		{
			id: "seed_webhook_event_5001002",
			organization_id: organizationId,
			inbound_message_id: "seed_inbound_telegram_escalated_1002",
			update_id: 5_001_002,
			event_type: "message",
			chat_id: "500",
			payload: toJson({ message: { text: "I was charged but still pending" } }),
			status: "processed",
			error_message: null,
			received_at: atUtc(0, 17),
			processed_at: atUtc(0, 17),
			created_at: now,
			updated_at: now,
		},
		{
			id: "seed_webhook_event_5001003",
			organization_id: organizationId,
			inbound_message_id: null,
			update_id: 5_001_003,
			event_type: "callback_query",
			chat_id: "500",
			payload: toJson({ callback_query: { data: "retry" } }),
			status: "failed",
			error_message: "Invalid callback payload",
			received_at: atUtc(0, 19),
			processed_at: atUtc(0, 19),
			created_at: now,
			updated_at: now,
		}
	);
};

const applyPricingIntersectionsScenario = (seed) => {
	const { now } = seed;

	seed.pricingRules.push(
		{
			id: "seed_pricing_rule_night_shift_warmup",
			boat_id: "seed_boat_night_shift",
			pricing_profile_id: "seed_pricing_night_shift_base",
			name: "Evening warmup surcharge",
			rule_type: "time_window",
			condition_json: toJson({
				startHour: 18,
				startMinute: 0,
				endHour: 22,
				endMinute: 0,
			}),
			adjustment_type: "percentage",
			adjustment_value: 12,
			priority: 90,
			is_active: 1,
			created_at: now,
			updated_at: now,
		},
		{
			id: "seed_pricing_rule_night_shift_peak",
			boat_id: "seed_boat_night_shift",
			pricing_profile_id: "seed_pricing_night_shift_base",
			name: "Midnight peak surcharge",
			rule_type: "time_window",
			condition_json: toJson({
				startHour: 23,
				startMinute: 30,
				endHour: 2,
				endMinute: 30,
			}),
			adjustment_type: "percentage",
			adjustment_value: 18,
			priority: 110,
			is_active: 1,
			created_at: now,
			updated_at: now,
		},
		{
			id: "seed_pricing_rule_night_shift_weekend",
			boat_id: "seed_boat_night_shift",
			pricing_profile_id: "seed_pricing_night_shift_base",
			name: "Weekend nightlife surcharge",
			rule_type: "weekend_surcharge",
			condition_json: toJson({ weekendDays: [0, 6] }),
			adjustment_type: "percentage",
			adjustment_value: 10,
			priority: 80,
			is_active: 1,
			created_at: now,
			updated_at: now,
		},
		{
			id: "seed_pricing_rule_night_shift_long",
			boat_id: "seed_boat_night_shift",
			pricing_profile_id: "seed_pricing_night_shift_base",
			name: "Long night cruise discount",
			rule_type: "duration_discount",
			condition_json: toJson({ minHours: 5 }),
			adjustment_type: "percentage",
			adjustment_value: -8,
			priority: 70,
			is_active: 1,
			created_at: now,
			updated_at: now,
		},
		{
			id: "seed_pricing_rule_night_shift_group",
			boat_id: "seed_boat_night_shift",
			pricing_profile_id: "seed_pricing_night_shift_base",
			name: "Large group surcharge",
			rule_type: "passenger_surcharge",
			condition_json: toJson({ includedPassengers: 6 }),
			adjustment_type: "fixed_cents",
			adjustment_value: 20_000,
			priority: 60,
			is_active: 1,
			created_at: now,
			updated_at: now,
		}
	);

	seed.todos.push({
		id: 900_004,
		text: "Check stacked pricing intersections for Night Shift",
		completed: 0,
	});
};

const buildSeedData = ({ anchorDate, scenario }) => {
	const anchorDateMs = parseAnchorDate(anchorDate);
	const seed = buildBaselineSeedData({ anchorDateMs });

	if (scenario === "booking-pressure" || scenario === "full") {
		applyBookingPressureScenario(seed);
	}

	if (scenario === "pricing-intersections" || scenario === "full") {
		applyPricingIntersectionsScenario(seed);
	}

	if (scenario === "support-escalation" || scenario === "full") {
		applySupportEscalationScenario(seed);
	}

	return seed;
};

const clearSeedNamespace = (sqlite) => {
	const prefixedTables = [
		"telegram_webhook_event",
		"inbound_message",
		"telegram_notification",
		"support_ticket_message",
		"support_ticket",
		"booking_refund",
		"booking_dispute",
		"booking_cancellation_request",
		"booking_payment_attempt",
		"booking_discount_application",
		"booking_calendar_link",
		"booking",
		"booking_discount_code",
		"boat_pricing_rule",
		"boat_pricing_profile",
		"boat_availability_block",
		"boat_calendar_connection",
		"boat_amenity",
		"boat_asset",
		"boat",
		"boat_dock",
		"member",
		"organization",
		"user",
	];

	for (const table of prefixedTables) {
		sqlite
			.prepare(`DELETE FROM ${quote(table)} WHERE ${quote("id")} LIKE 'seed_%'`)
			.run();
	}

	// Cleanup legacy demo namespace from previous seed iterations.
	sqlite
		.prepare(`DELETE FROM ${quote("organization")} WHERE ${quote("id")} = ?`)
		.run("org_demo_marina");
	for (const legacyUserId of [
		"user_owner_alex",
		"user_manager_olga",
		"user_customer_ivan",
	]) {
		sqlite
			.prepare(`DELETE FROM ${quote("user")} WHERE ${quote("id")} = ?`)
			.run(legacyUserId);
	}

	sqlite
		.prepare(
			`DELETE FROM ${quote("todo")} WHERE ${quote("id")} >= ? AND ${quote("id")} <= ?`
		)
		.run(TODO_ID_MIN, TODO_ID_MAX);
};

const writeSeedData = (sqlite, seed) => {
	upsertRow(sqlite, "organization", ["id"], seed.organization);
	upsertMany(sqlite, "user", seed.users);
	upsertMany(sqlite, "member", seed.members);
	upsertMany(sqlite, "boat_dock", seed.docks);

	const rowGroups = [
		["boat", seed.boats],
		["boat_asset", seed.assets],
		["boat_amenity", seed.amenities],
		["boat_calendar_connection", seed.calendarConnections],
		["boat_availability_block", seed.availabilityBlocks],
		["boat_pricing_profile", seed.pricingProfiles],
		["boat_pricing_rule", seed.pricingRules],
		["booking_discount_code", seed.discountCodes],
		["booking", seed.bookings],
		["booking_calendar_link", seed.bookingCalendarLinks],
		["booking_discount_application", seed.discountApplications],
		["booking_payment_attempt", seed.paymentAttempts],
		["booking_cancellation_request", seed.cancellationRequests],
		["booking_dispute", seed.disputes],
		["booking_refund", seed.refunds],
		["support_ticket", seed.supportTickets],
		["support_ticket_message", seed.supportMessages],
		["inbound_message", seed.inboundMessages],
		["telegram_notification", seed.telegramNotifications],
		["telegram_webhook_event", seed.telegramWebhookEvents],
		["todo", seed.todos],
	];

	for (const [table, rows] of rowGroups) {
		upsertMany(sqlite, table, rows);
	}
};

const main = () => {
	const options = parseArgs();
	const resolvedDbPath = options.dbPath ?? findLocalD1Database();
	const parentDir = path.dirname(resolvedDbPath);
	if (!existsSync(parentDir)) {
		mkdirSync(parentDir, { recursive: true });
	}
	const sqlite = new Database(resolvedDbPath);

	try {
		sqlite.pragma("foreign_keys = ON");
		ensureSchemaExists(sqlite);

		const seed = buildSeedData({
			anchorDate: options.anchorDate,
			scenario: options.scenario,
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
				`Organization: ${seed.organization.slug}`,
				`Users: ${seed.users.length}, boats: ${seed.boats.length}, bookings: ${seed.bookings.length}, pricing rules: ${seed.pricingRules.length}`,
				`Support tickets: ${seed.supportTickets.length}, inbound: ${seed.inboundMessages.length}, telegram webhook events: ${seed.telegramWebhookEvents.length}`,
			].join("\n")
		);
	} finally {
		sqlite.close();
	}
};

main();
