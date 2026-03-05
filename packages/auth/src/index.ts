import { passkey } from "@better-auth/passkey";
import { db } from "@my-app/db";
import * as schema from "@my-app/db/schema/auth";
import { env } from "@my-app/env/server";
import type { BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { openAPI } from "better-auth/plugins";
import { admin } from "better-auth/plugins/admin";
import { anonymous } from "better-auth/plugins/anonymous";
import { organization } from "better-auth/plugins/organization";
import { phoneNumber } from "better-auth/plugins/phone-number";
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
const SESSION_COOKIE_CACHE_MAX_AGE_SECONDS = 5 * 60;

const initAuth = () => {
	const corsOrigins = parseCorsOrigins(env.CORS_ORIGIN);
	const serverBaseUrl = env.SERVER_URL.replace(TRAILING_SLASH_RE, "");
	const serverUrl = new URL(serverBaseUrl);

	// For *.workers.dev deployments, use the workers subdomain (e.g. "smartcache.workers.dev")
	// so passkey and cookies work across server/web/assistant subdomains.
	const workersDevMatch = serverUrl.hostname.match(WORKERS_DEV_RE);

	// For custom multi-subdomain deployments (e.g. api.staging.ayda.studio → staging.ayda.studio),
	// strip the first segment to derive the shared parent domain for cross-subdomain cookies.
	// Better Auth expects no leading dot (e.g. "staging.ayda.studio", not ".staging.ayda.studio").
	const hostParts = serverUrl.hostname.split(".");
	const cookieDomain: string | null =
		workersDevMatch?.[1] ??
		(!workersDevMatch && hostParts.length >= 3
			? hostParts.slice(1).join(".")
			: null);
	const crossSubDomainCookiesConfig = cookieDomain
		? { crossSubDomainCookies: { enabled: true, domain: cookieDomain } }
		: {};

	const passkeyRpId =
		serverUrl.hostname === "localhost"
			? "localhost"
			: (workersDevMatch?.[1] ?? serverUrl.hostname);

	const plugins: BetterAuthPlugin[] = [
		admin(),
		anonymous(),
		openAPI({ disableDefaultReference: true }),
		passkey({
			rpID: passkeyRpId,
			rpName: "Playpulse",
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
			provider: "pg",
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
		session: {
			cookieCache: {
				enabled: true,
				maxAge: SESSION_COOKIE_CACHE_MAX_AGE_SECONDS,
			},
		},
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.SERVER_URL,
		advanced: {
			// On localhost (HTTP), SameSite=None+Secure cookies are rejected by Playwright/Chromium.
			// Use Lax for local dev and None+Secure only for deployed environments.
			defaultCookieAttributes:
				serverUrl.hostname === "localhost"
					? { sameSite: "lax" as const, httpOnly: true }
					: { sameSite: "none" as const, secure: true, httpOnly: true },
			...crossSubDomainCookiesConfig,
		},
		databaseHooks: {
			session: {
				create: {
					// biome-ignore lint/suspicious/noExplicitAny: better-auth hook type is not exported
					before: async (session: any) => {
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

// Lazily initialize auth on first access to avoid import-time side effects
// before environment is fully loaded.
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
