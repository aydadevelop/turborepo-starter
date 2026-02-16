import { passkey } from "@better-auth/passkey";
import { db } from "@full-stack-cf-app/db";
import * as schema from "@full-stack-cf-app/db/schema/auth";
import { env } from "@full-stack-cf-app/env/server";
import { checkout, polar, portal } from "@polar-sh/better-auth";
import type { BetterAuthPlugin } from "better-auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, openAPI, phoneNumber } from "better-auth/plugins";
import { organization } from "better-auth/plugins/organization";
import { telegram } from "better-auth-telegram";
import { asc, eq } from "drizzle-orm";

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
	admin(),
	openAPI({ disableDefaultReference: true }),
	passkey({
		rpID: passkeyRpId,
		rpName: "Cloudflare App",
	}),
	phoneNumber({
		sendOTP: ({ phoneNumber: phone, code }) => {
			// In production, integrate your SMS provider here (e.g. Twilio, AWS SNS)
			// Don't await — fire-and-forget to avoid timing attacks
			console.log(`[OTP] ${phone}: ${code}`);
		},
		signUpOnVerification: {
			getTempEmail: (phone) => `${phone.replace(/\+/g, "")}@phone.local`,
		},
	}),
	organization({
		ac: organizationAccessControl,
		creatorRole: "org_owner",
		roles: organizationRoles,
		// Field mappings removed — the Drizzle schema already maps
		// camelCase JS properties to snake_case columns (e.g. activeOrganizationId → active_organization_id).
		// Keeping them caused double-mapping errors in databaseHooks.
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

if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_BOT_USERNAME) {
	plugins.push(
		telegram({
			botToken: env.TELEGRAM_BOT_TOKEN,
			botUsername: env.TELEGRAM_BOT_USERNAME,
			mapTelegramDataToUser: (data) => ({
				name: data.last_name
					? `${data.first_name} ${data.last_name}`
					: data.first_name,
				image: data.photo_url,
				email: `tg_${data.id}@telegram.local`,
			}),
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
	account: {
		accountLinking: {
			enabled: true,
			trustedProviders: ["email-password"],
		},
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
	databaseHooks: {
		session: {
			create: {
				before: async (session) => {
					const [firstMembership] = await db
						.select({ organizationId: schema.member.organizationId })
						.from(schema.member)
						.where(eq(schema.member.userId, session.userId))
						.orderBy(asc(schema.member.createdAt))
						.limit(1);
					return {
						data: {
							...session,
							activeOrganizationId: firstMembership?.organizationId ?? null,
						},
					};
				},
			},
		},
	},
	plugins,
});
