import { createContext } from "@my-app/api/context";
import { hasOrganizationPermission } from "@my-app/api/organization";
import {
	buildGoogleCalendarAccountAuthorizationUrl,
	connectOrganizationCalendarAccount,
	exchangeGoogleCalendarOAuthCode,
	fetchGoogleCalendarAccountProfile,
	refreshOrganizationCalendarSources,
} from "@my-app/calendar";
import { db } from "@my-app/db";
import { env } from "@my-app/env/server";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { Hono } from "hono";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const GOOGLE_CALLBACK_PATH = "/api/calendar/oauth/google/callback";
const GOOGLE_STATE_COOKIE = "calendar_google_oauth_nonce";
const GOOGLE_STATE_TTL_MS = 10 * 60 * 1000;
const TRAILING_SLASHES_RE = /\/+$/;

interface GoogleCalendarOAuthState {
	nonce: string;
	organizationId: string;
	returnTo: string;
	startedAt: number;
	userId: string;
}

const parseCorsOrigins = (value: string): string[] =>
	value
		.split(",")
		.map((origin) => origin.trim())
		.filter(Boolean);

const getPublicServerBaseUrl = (): string => {
	const authBaseUrl = env.BETTER_AUTH_URL.replace(TRAILING_SLASHES_RE, "");
	return authBaseUrl.endsWith("/api/auth")
		? authBaseUrl.slice(0, -"/api/auth".length)
		: authBaseUrl;
};

const getGoogleRedirectUri = (): string =>
	`${getPublicServerBaseUrl()}${GOOGLE_CALLBACK_PATH}`;

const encodeState = (payload: GoogleCalendarOAuthState): string => {
	const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
	const signature = createHmac("sha256", env.BETTER_AUTH_SECRET)
		.update(encodedPayload)
		.digest("base64url");
	return `${encodedPayload}.${signature}`;
};

const decodeState = (
	value: string | undefined
): GoogleCalendarOAuthState | null => {
	if (!value) {
		return null;
	}

	const separatorIndex = value.lastIndexOf(".");
	if (separatorIndex <= 0) {
		return null;
	}

	const encodedPayload = value.slice(0, separatorIndex);
	const encodedSignature = value.slice(separatorIndex + 1);
	const expectedSignature = createHmac("sha256", env.BETTER_AUTH_SECRET)
		.update(encodedPayload)
		.digest("base64url");

	const providedBuffer = Buffer.from(encodedSignature);
	const expectedBuffer = Buffer.from(expectedSignature);
	if (
		providedBuffer.length !== expectedBuffer.length ||
		!timingSafeEqual(providedBuffer, expectedBuffer)
	) {
		return null;
	}

	try {
		const parsed = JSON.parse(
			Buffer.from(encodedPayload, "base64url").toString("utf8")
		) as GoogleCalendarOAuthState;
		if (
			typeof parsed.userId !== "string" ||
			typeof parsed.organizationId !== "string" ||
			typeof parsed.nonce !== "string" ||
			typeof parsed.returnTo !== "string" ||
			typeof parsed.startedAt !== "number"
		) {
			return null;
		}
		if (Date.now() - parsed.startedAt > GOOGLE_STATE_TTL_MS) {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
};

const resolveReturnTo = (referer: string | undefined): string => {
	const allowedOrigins = new Set([
		...parseCorsOrigins(env.CORS_ORIGIN),
		getPublicServerBaseUrl(),
	]);
	const fallbackOrigin =
		parseCorsOrigins(env.CORS_ORIGIN)[0] ?? getPublicServerBaseUrl();

	if (referer) {
		try {
			const url = new URL(referer);
			if (allowedOrigins.has(url.origin)) {
				return url.toString();
			}
		} catch {
			// ignore invalid referer
		}
	}

	return new URL("/org/listings", fallbackOrigin).toString();
};

const buildReturnUrl = (
	returnTo: string,
	status: "connected" | "error",
	syncStatus?: "error"
): string => {
	const url = new URL(returnTo);
	url.searchParams.set("calendarConnect", status);
	if (syncStatus) {
		url.searchParams.set("calendarSync", syncStatus);
	} else {
		url.searchParams.delete("calendarSync");
	}
	return url.toString();
};

export const calendarOauthRoutes = new Hono();

calendarOauthRoutes.get("/api/calendar/oauth/google/start", async (c) => {
	const context = await createContext({ context: c });
	const userId = context.session?.user?.id;
	const activeMembership = context.activeMembership;

	if (!userId || !activeMembership) {
		return c.json({ error: "Unauthorized" }, 401);
	}
	if (
		!hasOrganizationPermission(activeMembership.role, {
			availability: ["create"],
		})
	) {
		return c.json({ error: "Forbidden" }, 403);
	}
	if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
		return c.json({ error: "Google calendar OAuth is not configured" }, 503);
	}

	const nonce = randomUUID();
	const returnTo = resolveReturnTo(c.req.header("referer"));
	const state = encodeState({
		nonce,
		organizationId: activeMembership.organizationId,
		returnTo,
		startedAt: Date.now(),
		userId,
	});

	setCookie(c, GOOGLE_STATE_COOKIE, nonce, {
		httpOnly: true,
		maxAge: GOOGLE_STATE_TTL_MS / 1000,
		path: GOOGLE_CALLBACK_PATH,
		sameSite: "Lax",
		secure: getPublicServerBaseUrl().startsWith("https://"),
	});

	return c.redirect(
		buildGoogleCalendarAccountAuthorizationUrl(
			{
				clientId: env.GOOGLE_CLIENT_ID,
				redirectUri: getGoogleRedirectUri(),
			},
			state
		)
	);
});

calendarOauthRoutes.get("/api/calendar/oauth/google/callback", async (c) => {
	const state = decodeState(c.req.query("state"));
	const nonce = getCookie(c, GOOGLE_STATE_COOKIE);
	deleteCookie(c, GOOGLE_STATE_COOKIE, { path: GOOGLE_CALLBACK_PATH });

	if (!state || nonce !== state.nonce) {
		return c.json({ error: "Invalid calendar OAuth state" }, 400);
	}

	if (c.req.query("error")) {
		return c.redirect(buildReturnUrl(state.returnTo, "error"));
	}

	const code = c.req.query("code");
	if (!code) {
		return c.redirect(buildReturnUrl(state.returnTo, "error"));
	}

	const context = await createContext({ context: c });
	if (
		context.session?.user?.id !== state.userId ||
		context.activeMembership?.organizationId !== state.organizationId
	) {
		return c.redirect(buildReturnUrl(state.returnTo, "error"));
	}

	try {
		const tokenSet = await exchangeGoogleCalendarOAuthCode(
			{
				clientId: env.GOOGLE_CLIENT_ID,
				clientSecret: env.GOOGLE_CLIENT_SECRET,
				redirectUri: getGoogleRedirectUri(),
			},
			code
		);
		const profile = await fetchGoogleCalendarAccountProfile(tokenSet.accessToken);
		const account = await connectOrganizationCalendarAccount(
			{
				organizationId: state.organizationId,
				provider: "google",
				externalAccountId: profile.externalAccountId,
				accountEmail: profile.accountEmail,
				displayName: profile.displayName,
				createdByUserId: context.session?.user?.id,
				providerMetadata: {
					credentials: {
						accessToken: tokenSet.accessToken,
						expiresAt: tokenSet.expiresAt,
						refreshToken: tokenSet.refreshToken,
						scope: tokenSet.scope,
						tokenType: tokenSet.tokenType,
					},
					profile: {
						accountEmail: profile.accountEmail,
						avatarUrl: profile.avatarUrl,
						displayName: profile.displayName,
						externalAccountId: profile.externalAccountId,
					},
				},
			},
			db
		);

		try {
			await refreshOrganizationCalendarSources(
				account.id,
				state.organizationId,
				db
			);
			return c.redirect(buildReturnUrl(state.returnTo, "connected"));
		} catch {
			return c.redirect(buildReturnUrl(state.returnTo, "connected", "error"));
		}
	} catch {
		return c.redirect(buildReturnUrl(state.returnTo, "error"));
	}
});
