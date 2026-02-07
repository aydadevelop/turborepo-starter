import {
	account,
	invitation,
	member,
	organization,
	session,
	user,
	verification,
} from "@full-stack-cf-app/db/schema/auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization as organizationPlugin } from "better-auth/plugins/organization";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import {
	organizationAccessControl,
	organizationRoles,
} from "../organization-access";

const authSchema = {
	account,
	invitation,
	member,
	organization,
	session,
	user,
	verification,
};

/**
 * Creates a test auth instance with an in-memory SQLite database.
 * This is useful for integration testing authentication flows.
 */
export const createTestAuth = () => {
	const sqlite = new Database(":memory:");
	sqlite.pragma("journal_mode = WAL");

	// Apply auth schema
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS user (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			email TEXT NOT NULL UNIQUE,
			email_verified INTEGER NOT NULL DEFAULT 0,
			image TEXT,
			created_at INTEGER NOT NULL DEFAULT (cast(unixepoch() * 1000 as integer)),
			updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch() * 1000 as integer))
		);

			CREATE TABLE IF NOT EXISTS session (
				id TEXT PRIMARY KEY,
				expires_at INTEGER NOT NULL,
				token TEXT NOT NULL UNIQUE,
				created_at INTEGER NOT NULL DEFAULT (cast(unixepoch() * 1000 as integer)),
				updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch() * 1000 as integer)),
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
			created_at INTEGER NOT NULL DEFAULT (cast(unixepoch() * 1000 as integer)),
			updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch() * 1000 as integer))
		);
		CREATE INDEX IF NOT EXISTS account_userId_idx ON account(user_id);

			CREATE TABLE IF NOT EXISTS verification (
				id TEXT PRIMARY KEY,
				identifier TEXT NOT NULL,
				value TEXT NOT NULL,
				expires_at INTEGER NOT NULL,
			created_at INTEGER NOT NULL DEFAULT (cast(unixepoch() * 1000 as integer)),
			updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch() * 1000 as integer))
			);
			CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification(identifier);

			CREATE TABLE IF NOT EXISTS organization (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				slug TEXT NOT NULL UNIQUE,
				logo TEXT,
				metadata TEXT,
				created_at INTEGER NOT NULL DEFAULT (cast(unixepoch() * 1000 as integer))
			);

			CREATE TABLE IF NOT EXISTS member (
				id TEXT PRIMARY KEY,
				organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
				user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
				role TEXT NOT NULL DEFAULT 'member',
				created_at INTEGER NOT NULL DEFAULT (cast(unixepoch() * 1000 as integer)),
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
				created_at INTEGER NOT NULL DEFAULT (cast(unixepoch() * 1000 as integer))
			);
			CREATE INDEX IF NOT EXISTS invitation_organizationId_idx ON invitation(organization_id);
			CREATE INDEX IF NOT EXISTS invitation_email_idx ON invitation(email);
			CREATE INDEX IF NOT EXISTS invitation_status_idx ON invitation(status);
			CREATE INDEX IF NOT EXISTS invitation_inviterId_idx ON invitation(inviter_id);
		`);

	const db = drizzle(sqlite, { schema: authSchema });

	const auth = betterAuth({
		database: drizzleAdapter(db, {
			provider: "sqlite",
			schema: authSchema,
		}),
		trustedOrigins: ["http://localhost:3000", "http://localhost:5173"],
		emailAndPassword: {
			enabled: true,
		},
		plugins: [
			organizationPlugin({
				ac: organizationAccessControl,
				creatorRole: "org_owner",
				roles: organizationRoles,
				schema: {
					session: {
						fields: {
							activeOrganizationId: "active_organization_id",
						},
					},
					organization: {
						fields: {
							createdAt: "created_at",
						},
					},
					member: {
						fields: {
							organizationId: "organization_id",
							userId: "user_id",
							createdAt: "created_at",
						},
					},
					invitation: {
						fields: {
							organizationId: "organization_id",
							inviterId: "inviter_id",
							expiresAt: "expires_at",
							createdAt: "created_at",
						},
					},
				},
			}),
		],
		secret: "test-secret-key-for-testing-only",
		baseURL: "http://localhost:3000",
	});

	return {
		auth,
		close: () => sqlite.close(),
	};
};

export type TestAuth = ReturnType<typeof createTestAuth>;
