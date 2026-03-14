import {
	account,
	invitation,
	member,
	organization,
	session,
	user,
	verification,
} from "@my-app/db/schema/auth";
import { clearTestDatabase, createTestDatabase } from "@my-app/db/test";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { testUtils } from "better-auth/plugins";
import { organization as organizationPlugin } from "better-auth/plugins/organization";

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

export const createTestAuth = async () => {
	const { db, close } = await createTestDatabase();

	const auth = betterAuth({
		database: drizzleAdapter(db, {
			provider: "pg",
			schema: authSchema,
		}),
		trustedOrigins: ["http://localhost:3000", "http://localhost:5173"],
		emailAndPassword: {
			enabled: true,
		},
		telemetry: {
			enabled: false,
		},
		plugins: [
			testUtils(),
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

	const ctx = await auth.$context;

	return {
		auth,
		test: ctx.test as import("better-auth/plugins").TestHelpers,
		clearDb: () => clearTestDatabase(db),
		close,
	};
};

export type TestAuth = Awaited<ReturnType<typeof createTestAuth>>;
export type { TestHelpers } from "better-auth/plugins";
