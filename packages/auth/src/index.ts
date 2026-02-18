import { passkey } from "@better-auth/passkey";
import { db } from "@full-stack-cf-app/db";
import * as schema from "@full-stack-cf-app/db/schema/auth";
import { env } from "@full-stack-cf-app/env/server";
import type { BetterAuthPlugin } from "better-auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, anonymous, openAPI, phoneNumber } from "better-auth/plugins";
import { organization } from "better-auth/plugins/organization";
import { telegram } from "better-auth-telegram";
import { asc, eq } from "drizzle-orm";

import {
	organizationAccessControl,
	organizationRoles,
} from "./organization-access";

const parseCorsOrigins = (value: string | undefined) =>
	(value ?? "")
		.split(",")
		.map((origin) => origin.trim())
		.filter(Boolean);

const TRAILING_SLASH_RE = /\/+$/;
const WORKERS_DEV_RE = /\.([^.]+\.workers\.dev)$/;

const initAuth = () => {
	const corsOrigins = parseCorsOrigins(env.CORS_ORIGIN);
	const authBaseUrl = env.BETTER_AUTH_URL.replace(TRAILING_SLASH_RE, "");
	const authUrl = new URL(authBaseUrl);

	// For *.workers.dev deployments, use the workers subdomain (e.g. "smartcache.workers.dev")
	// so passkey and cookies work across server/web/assistant subdomains.
	const workersDevMatch = authUrl.hostname.match(WORKERS_DEV_RE);
	const passkeyRpId =
		authUrl.hostname === "localhost"
			? "localhost"
			: (workersDevMatch?.[1] ?? authUrl.hostname);

	const plugins: BetterAuthPlugin[] = [
		admin(),
		anonymous(),
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

	return betterAuth({
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
			...(workersDevMatch
				? {
						crossSubDomainCookies: {
							enabled: true,
							domain: `.${workersDevMatch[1]}`,
						},
					}
				: {}),
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
};

// Lazily initialize auth on first access to avoid exceeding Cloudflare Worker
// startup CPU time limits during script validation.
let _auth: ReturnType<typeof initAuth> | undefined;

export const auth: ReturnType<typeof initAuth> = new Proxy(
	{} as ReturnType<typeof initAuth>,
	{
		get(_, prop: PropertyKey) {
			if (!_auth) {
				_auth = initAuth();
			}
			return (_auth as Record<PropertyKey, unknown>)[prop];
		},
	}
);
