import { passkey } from "@better-auth/passkey";
import { db } from "@full-stack-cf-app/db";
import * as schema from "@full-stack-cf-app/db/schema/auth";
import { env } from "@full-stack-cf-app/env/server";
import { checkout, polar, portal } from "@polar-sh/better-auth";
import type { BetterAuthPlugin } from "better-auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { openAPI } from "better-auth/plugins";
import { organization } from "better-auth/plugins/organization";

import { polarClient } from "./lib/payments";
import {
	organizationAccessControl,
	organizationRoles,
} from "./organization-access";

const parseCorsOrigins = (value: string | undefined) =>
	(value ?? "")
		.split(",")
		.map((origin) => origin.trim())
		.filter(Boolean);

const corsOrigins = parseCorsOrigins(env.CORS_ORIGIN);
const authBaseUrl = env.BETTER_AUTH_URL.replace(/\/+$/, "");
const authUrl = new URL(authBaseUrl);
const passkeyRpId =
	authUrl.hostname === "localhost" ? "localhost" : authUrl.hostname;

// Only enable Polar plugin if access token is configured
const plugins: BetterAuthPlugin[] = [
	openAPI({ disableDefaultReference: true }),
	passkey({
		rpID: passkeyRpId,
		rpName: "Cloudflare App",
	}),
	organization({
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
];

if (env.POLAR_ACCESS_TOKEN) {
	plugins.push(
		polar({
			client: polarClient,
			createCustomerOnSignUp: true,
			enableCustomerPortal: true,
			use: [
				checkout({
					products: [
						{
							productId: env.POLAR_PRODUCT_ID ?? "your-product-id",
							slug: "pro",
						},
					],
					successUrl: env.POLAR_SUCCESS_URL,
					authenticatedUsersOnly: true,
				}),
				portal(),
			],
		})
	);
}

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "sqlite",
		schema,
	}),
	trustedOrigins: corsOrigins,
	emailAndPassword: {
		enabled: true,
	},
	// uncomment cookieCache setting when ready to deploy to Cloudflare using *.workers.dev domains
	// session: {
	//   cookieCache: {
	//     enabled: true,
	//     maxAge: 60,
	//   },
	// },
	secret: env.BETTER_AUTH_SECRET,
	baseURL: env.BETTER_AUTH_URL,
	advanced: {
		defaultCookieAttributes: {
			sameSite: "none",
			secure: true,
			httpOnly: true,
		},
		// uncomment crossSubDomainCookies setting when ready to deploy and replace <your-workers-subdomain> with your actual workers subdomain
		// https://developers.cloudflare.com/workers/wrangler/configuration/#workersdev
		// crossSubDomainCookies: {
		//   enabled: true,
		//   domain: "<your-workers-subdomain>",
		// },
	},
	plugins,
});
