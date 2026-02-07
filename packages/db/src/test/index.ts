import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import {
	type BetterSQLite3Database,
	drizzle,
} from "drizzle-orm/better-sqlite3";

import {
	account,
	invitation,
	member,
	organization,
	session,
	user,
	verification,
} from "../schema/auth";
import {
	boat,
	boatAmenity,
	boatAsset,
	boatAvailabilityBlock,
	boatAvailabilityRule,
	boatCalendarConnection,
	boatDock,
	boatPricingProfile,
	boatPricingRule,
} from "../schema/boat";
import { todo } from "../schema/todo";

const schema = {
	account,
	boat,
	boatAmenity,
	boatAsset,
	boatAvailabilityBlock,
	boatAvailabilityRule,
	boatCalendarConnection,
	boatDock,
	boatPricingProfile,
	boatPricingRule,
	invitation,
	member,
	organization,
	session,
	todo,
	user,
	verification,
};

export type TestDatabase = BetterSQLite3Database<typeof schema>;

export const createTestDatabase = (): {
	db: TestDatabase;
	close: () => void;
} => {
	const sqlite = new Database(":memory:");
	sqlite.pragma("journal_mode = WAL");

	const db = drizzle(sqlite, { schema });

	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS user (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			email TEXT NOT NULL UNIQUE,
			email_verified INTEGER NOT NULL DEFAULT 0,
			image TEXT,
			created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
			updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
		);

		CREATE TABLE IF NOT EXISTS session (
			id TEXT PRIMARY KEY,
			expires_at INTEGER NOT NULL,
			token TEXT NOT NULL UNIQUE,
			created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
			updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
			ip_address TEXT,
			user_agent TEXT,
			active_organization_id TEXT,
			user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
		);
		CREATE INDEX IF NOT EXISTS session_userId_idx ON session(user_id);

		CREATE TABLE IF NOT EXISTS account (
			id TEXT PRIMARY KEY,
			account_id TEXT NOT NULL,
			provider_id TEXT NOT NULL,
			user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
			access_token TEXT,
			refresh_token TEXT,
			id_token TEXT,
			access_token_expires_at INTEGER,
			refresh_token_expires_at INTEGER,
			scope TEXT,
			password TEXT,
			created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
			updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
		);
		CREATE INDEX IF NOT EXISTS account_userId_idx ON account(user_id);

		CREATE TABLE IF NOT EXISTS verification (
			id TEXT PRIMARY KEY,
			identifier TEXT NOT NULL,
			value TEXT NOT NULL,
			expires_at INTEGER NOT NULL,
			created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
			updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
		);
		CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification(identifier);

		CREATE TABLE IF NOT EXISTS organization (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			slug TEXT NOT NULL UNIQUE,
			logo TEXT,
			metadata TEXT,
			created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
		);

		CREATE TABLE IF NOT EXISTS member (
			id TEXT PRIMARY KEY,
			organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
			user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
			role TEXT NOT NULL DEFAULT 'member',
			created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
			UNIQUE(organization_id, user_id)
		);
		CREATE INDEX IF NOT EXISTS member_organizationId_idx ON member(organization_id);
		CREATE INDEX IF NOT EXISTS member_userId_idx ON member(user_id);

		CREATE TABLE IF NOT EXISTS invitation (
			id TEXT PRIMARY KEY,
			organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
			email TEXT NOT NULL,
			role TEXT,
			status TEXT NOT NULL DEFAULT 'pending',
			expires_at INTEGER NOT NULL,
			inviter_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
			created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
		);
		CREATE INDEX IF NOT EXISTS invitation_organizationId_idx ON invitation(organization_id);
		CREATE INDEX IF NOT EXISTS invitation_email_idx ON invitation(email);
		CREATE INDEX IF NOT EXISTS invitation_status_idx ON invitation(status);
		CREATE INDEX IF NOT EXISTS invitation_inviterId_idx ON invitation(inviter_id);

		CREATE TABLE IF NOT EXISTS boat_dock (
			id TEXT PRIMARY KEY,
			organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
			name TEXT NOT NULL,
			slug TEXT NOT NULL,
			description TEXT,
			address TEXT,
			latitude REAL,
			longitude REAL,
			is_active INTEGER NOT NULL DEFAULT 1,
			created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
			updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
			UNIQUE(organization_id, slug)
		);
		CREATE INDEX IF NOT EXISTS boat_dock_organizationId_idx ON boat_dock(organization_id);

		CREATE TABLE IF NOT EXISTS boat (
			id TEXT PRIMARY KEY,
			organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
			dock_id TEXT REFERENCES boat_dock(id) ON DELETE SET NULL,
			name TEXT NOT NULL,
			slug TEXT NOT NULL,
			description TEXT,
			type TEXT NOT NULL DEFAULT 'other',
			passenger_capacity INTEGER NOT NULL DEFAULT 1,
			crew_capacity INTEGER NOT NULL DEFAULT 0,
			minimum_hours INTEGER NOT NULL DEFAULT 1,
			minimum_notice_minutes INTEGER NOT NULL DEFAULT 0,
			working_hours_start INTEGER NOT NULL DEFAULT 9,
			working_hours_end INTEGER NOT NULL DEFAULT 21,
			timezone TEXT NOT NULL DEFAULT 'UTC',
			status TEXT NOT NULL DEFAULT 'draft',
			is_active INTEGER NOT NULL DEFAULT 1,
			approved_at INTEGER,
			archived_at INTEGER,
			metadata TEXT,
			created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
			updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
			UNIQUE(organization_id, slug)
		);
		CREATE INDEX IF NOT EXISTS boat_organizationId_idx ON boat(organization_id);
		CREATE INDEX IF NOT EXISTS boat_status_idx ON boat(status);
		CREATE INDEX IF NOT EXISTS boat_dockId_idx ON boat(dock_id);

		CREATE TABLE IF NOT EXISTS boat_amenity (
			id TEXT PRIMARY KEY,
			boat_id TEXT NOT NULL REFERENCES boat(id) ON DELETE CASCADE,
			key TEXT NOT NULL,
			label TEXT,
			is_enabled INTEGER NOT NULL DEFAULT 1,
			value TEXT,
			created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
			updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
			UNIQUE(boat_id, key)
		);
		CREATE INDEX IF NOT EXISTS boat_amenity_boatId_idx ON boat_amenity(boat_id);

		CREATE TABLE IF NOT EXISTS boat_asset (
			id TEXT PRIMARY KEY,
			boat_id TEXT NOT NULL REFERENCES boat(id) ON DELETE CASCADE,
			asset_type TEXT NOT NULL,
			purpose TEXT NOT NULL DEFAULT 'gallery',
			storage_key TEXT NOT NULL,
			file_name TEXT,
			mime_type TEXT,
			size_bytes INTEGER,
			uploaded_by_user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
			sort_order INTEGER NOT NULL DEFAULT 0,
			is_primary INTEGER NOT NULL DEFAULT 0,
			review_status TEXT NOT NULL DEFAULT 'pending',
			review_note TEXT,
			created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
			updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
			UNIQUE(boat_id, storage_key)
		);
		CREATE INDEX IF NOT EXISTS boat_asset_boatId_idx ON boat_asset(boat_id);
		CREATE INDEX IF NOT EXISTS boat_asset_purpose_idx ON boat_asset(purpose);
		CREATE INDEX IF NOT EXISTS boat_asset_uploadedByUserId_idx ON boat_asset(uploaded_by_user_id);

		CREATE TABLE IF NOT EXISTS boat_calendar_connection (
			id TEXT PRIMARY KEY,
			boat_id TEXT NOT NULL REFERENCES boat(id) ON DELETE CASCADE,
			provider TEXT NOT NULL DEFAULT 'manual',
			external_calendar_id TEXT NOT NULL,
			sync_token TEXT,
			watch_channel_id TEXT,
			watch_resource_id TEXT,
			watch_expires_at INTEGER,
			last_synced_at INTEGER,
			sync_status TEXT NOT NULL DEFAULT 'idle',
			last_error TEXT,
			is_primary INTEGER NOT NULL DEFAULT 0,
			created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
			updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
			UNIQUE(boat_id, provider, external_calendar_id)
		);
		CREATE INDEX IF NOT EXISTS boat_calendar_connection_boatId_idx ON boat_calendar_connection(boat_id);
		CREATE INDEX IF NOT EXISTS boat_calendar_connection_provider_idx ON boat_calendar_connection(provider);

		CREATE TABLE IF NOT EXISTS boat_availability_rule (
			id TEXT PRIMARY KEY,
			boat_id TEXT NOT NULL REFERENCES boat(id) ON DELETE CASCADE,
			day_of_week INTEGER NOT NULL,
			start_minute INTEGER NOT NULL,
			end_minute INTEGER NOT NULL,
			is_active INTEGER NOT NULL DEFAULT 1,
			created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
			updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
			UNIQUE(boat_id, day_of_week, start_minute, end_minute)
		);
		CREATE INDEX IF NOT EXISTS boat_availability_rule_boatId_idx ON boat_availability_rule(boat_id);
		CREATE INDEX IF NOT EXISTS boat_availability_rule_dayOfWeek_idx ON boat_availability_rule(day_of_week);

		CREATE TABLE IF NOT EXISTS boat_availability_block (
			id TEXT PRIMARY KEY,
			boat_id TEXT NOT NULL REFERENCES boat(id) ON DELETE CASCADE,
			calendar_connection_id TEXT REFERENCES boat_calendar_connection(id) ON DELETE SET NULL,
			source TEXT NOT NULL DEFAULT 'manual',
			external_ref TEXT,
			starts_at INTEGER NOT NULL,
			ends_at INTEGER NOT NULL,
			reason TEXT,
			created_by_user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
			is_active INTEGER NOT NULL DEFAULT 1,
			created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
			updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
			UNIQUE(calendar_connection_id, external_ref)
		);
		CREATE INDEX IF NOT EXISTS boat_availability_block_boatId_idx ON boat_availability_block(boat_id);
		CREATE INDEX IF NOT EXISTS boat_availability_block_calendarConnectionId_idx ON boat_availability_block(calendar_connection_id);
		CREATE INDEX IF NOT EXISTS boat_availability_block_source_idx ON boat_availability_block(source);
		CREATE INDEX IF NOT EXISTS boat_availability_block_startsAt_idx ON boat_availability_block(starts_at);
		CREATE INDEX IF NOT EXISTS boat_availability_block_endsAt_idx ON boat_availability_block(ends_at);

		CREATE TABLE IF NOT EXISTS boat_pricing_profile (
			id TEXT PRIMARY KEY,
			boat_id TEXT NOT NULL REFERENCES boat(id) ON DELETE CASCADE,
			name TEXT NOT NULL,
			currency TEXT NOT NULL DEFAULT 'RUB',
			base_hourly_price_cents INTEGER NOT NULL,
			minimum_hours INTEGER NOT NULL DEFAULT 1,
			deposit_percentage INTEGER NOT NULL DEFAULT 0,
			service_fee_percentage INTEGER NOT NULL DEFAULT 0,
			affiliate_fee_percentage INTEGER NOT NULL DEFAULT 0,
			tax_percentage INTEGER NOT NULL DEFAULT 0,
			acquiring_fee_percentage INTEGER NOT NULL DEFAULT 0,
			valid_from INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
			valid_to INTEGER,
			is_default INTEGER NOT NULL DEFAULT 0,
			created_by_user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
			archived_at INTEGER,
			created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
			updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
		);
		CREATE INDEX IF NOT EXISTS boat_pricing_profile_boatId_idx ON boat_pricing_profile(boat_id);
		CREATE INDEX IF NOT EXISTS boat_pricing_profile_isDefault_idx ON boat_pricing_profile(is_default);
		CREATE INDEX IF NOT EXISTS boat_pricing_profile_validFrom_idx ON boat_pricing_profile(valid_from);

		CREATE TABLE IF NOT EXISTS boat_pricing_rule (
			id TEXT PRIMARY KEY,
			boat_id TEXT NOT NULL REFERENCES boat(id) ON DELETE CASCADE,
			pricing_profile_id TEXT REFERENCES boat_pricing_profile(id) ON DELETE CASCADE,
			name TEXT NOT NULL,
			rule_type TEXT NOT NULL,
			condition_json TEXT NOT NULL DEFAULT '{}',
			adjustment_type TEXT NOT NULL,
			adjustment_value INTEGER NOT NULL,
			priority INTEGER NOT NULL DEFAULT 0,
			is_active INTEGER NOT NULL DEFAULT 1,
			created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
			updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
		);
		CREATE INDEX IF NOT EXISTS boat_pricing_rule_boatId_idx ON boat_pricing_rule(boat_id);
		CREATE INDEX IF NOT EXISTS boat_pricing_rule_pricingProfileId_idx ON boat_pricing_rule(pricing_profile_id);
		CREATE INDEX IF NOT EXISTS boat_pricing_rule_priority_idx ON boat_pricing_rule(priority);

		CREATE TABLE IF NOT EXISTS todo (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			text TEXT NOT NULL,
			completed INTEGER NOT NULL DEFAULT 0
		);
	`);

	return {
		db,
		close: () => sqlite.close(),
	};
};

export const clearTestDatabase = (db: TestDatabase): void => {
	db.run(sql`DELETE FROM boat_pricing_rule`);
	db.run(sql`DELETE FROM boat_pricing_profile`);
	db.run(sql`DELETE FROM boat_availability_block`);
	db.run(sql`DELETE FROM boat_availability_rule`);
	db.run(sql`DELETE FROM boat_calendar_connection`);
	db.run(sql`DELETE FROM boat_asset`);
	db.run(sql`DELETE FROM boat_amenity`);
	db.run(sql`DELETE FROM boat`);
	db.run(sql`DELETE FROM boat_dock`);
	db.run(sql`DELETE FROM session`);
	db.run(sql`DELETE FROM account`);
	db.run(sql`DELETE FROM verification`);
	db.run(sql`DELETE FROM invitation`);
	db.run(sql`DELETE FROM member`);
	db.run(sql`DELETE FROM organization`);
	db.run(sql`DELETE FROM user`);
	db.run(sql`DELETE FROM todo`);
};
