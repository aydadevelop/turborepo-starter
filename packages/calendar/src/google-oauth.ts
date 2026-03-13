const GOOGLE_OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GOOGLE_CALENDAR_OAUTH_SCOPE = [
	"https://www.googleapis.com/auth/calendar",
	"https://www.googleapis.com/auth/userinfo.email",
	"https://www.googleapis.com/auth/userinfo.profile",
].join(" ");

export interface GoogleOAuthClientConfig {
	clientId: string;
	clientSecret: string;
	redirectUri: string;
}

export interface GoogleOAuthTokenSet {
	accessToken: string;
	refreshToken: string | null;
	tokenType: string;
	scope: string;
	expiresAt: number;
}

export interface GoogleOAuthAccountProfile {
	accountEmail: string | null;
	avatarUrl: string | null;
	displayName: string | null;
	externalAccountId: string;
}

interface GoogleOAuthTokenResponse {
	access_token: string;
	expires_in: number;
	refresh_token?: string;
	scope?: string;
	token_type: string;
}

interface GoogleOAuthUserInfoResponse {
	email?: string;
	id: string;
	name?: string;
	picture?: string;
}

export function buildGoogleCalendarAccountAuthorizationUrl(
	config: Pick<GoogleOAuthClientConfig, "clientId" | "redirectUri">,
	state: string
): string {
	const url = new URL(GOOGLE_OAUTH_AUTHORIZE_URL);
	url.searchParams.set("access_type", "offline");
	url.searchParams.set("client_id", config.clientId);
	url.searchParams.set("include_granted_scopes", "true");
	url.searchParams.set("prompt", "consent select_account");
	url.searchParams.set("redirect_uri", config.redirectUri);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("scope", GOOGLE_CALENDAR_OAUTH_SCOPE);
	url.searchParams.set("state", state);
	return url.toString();
}

export async function exchangeGoogleCalendarOAuthCode(
	config: GoogleOAuthClientConfig,
	code: string
): Promise<GoogleOAuthTokenSet> {
	const body = new URLSearchParams();
	body.set("client_id", config.clientId);
	body.set("client_secret", config.clientSecret);
	body.set("code", code);
	body.set("grant_type", "authorization_code");
	body.set("redirect_uri", config.redirectUri);

	const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: body.toString(),
	});

	if (!response.ok) {
		throw new Error(
			`GOOGLE_CALENDAR_OAUTH_TOKEN_ERROR: ${response.status} ${response.statusText}`
		);
	}

	const payload = (await response.json()) as GoogleOAuthTokenResponse;
	return {
		accessToken: payload.access_token,
		refreshToken: payload.refresh_token ?? null,
		tokenType: payload.token_type,
		scope: payload.scope ?? GOOGLE_CALENDAR_OAUTH_SCOPE,
		expiresAt: Date.now() + payload.expires_in * 1000,
	};
}

export async function fetchGoogleCalendarAccountProfile(
	accessToken: string
): Promise<GoogleOAuthAccountProfile> {
	const response = await fetch(GOOGLE_USERINFO_URL, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	});

	if (!response.ok) {
		throw new Error(
			`GOOGLE_CALENDAR_OAUTH_PROFILE_ERROR: ${response.status} ${response.statusText}`
		);
	}

	const payload = (await response.json()) as GoogleOAuthUserInfoResponse;
	return {
		accountEmail: payload.email ?? null,
		avatarUrl: payload.picture ?? null,
		displayName: payload.name ?? payload.email ?? null,
		externalAccountId: payload.id,
	};
}
