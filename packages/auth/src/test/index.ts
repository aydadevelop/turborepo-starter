import {
	account,
	invitation,
	member,
	organization,
	session,
	user,
	verification,
} from "@my-app/db/schema/auth";
import { createTestDatabase } from "@my-app/db/test";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
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

export const createTestAuth = () => {
	const { db, close } = createTestDatabase();

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
		close,
	};
};

export type TestAuth = ReturnType<typeof createTestAuth>;
