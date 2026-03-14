import { describe, expect, it, vi } from "vitest";
import {
	buildGoogleCalendarAccountAuthorizationUrl,
	exchangeGoogleCalendarOAuthCode,
	fetchGoogleCalendarAccountProfile,
} from "../google-oauth";

describe("google OAuth helpers", () => {
	it("builds the provider authorization URL with offline calendar scopes", () => {
		const url = new URL(
			buildGoogleCalendarAccountAuthorizationUrl(
				{
					clientId: "google-client-id",
					redirectUri:
						"http://localhost:3000/api/calendar/oauth/google/callback",
				},
				"signed-state",
			),
		);

		expect(url.origin).toBe("https://accounts.google.com");
		expect(url.searchParams.get("client_id")).toBe("google-client-id");
		expect(url.searchParams.get("redirect_uri")).toBe(
			"http://localhost:3000/api/calendar/oauth/google/callback",
		);
		expect(url.searchParams.get("access_type")).toBe("offline");
		expect(url.searchParams.get("state")).toBe("signed-state");
		expect(url.searchParams.get("scope")).toContain(
			"https://www.googleapis.com/auth/calendar",
		);
	});

	it("exchanges an authorization code into normalized tokens", async () => {
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					access_token: "access-token-1",
					refresh_token: "refresh-token-1",
					expires_in: 3600,
					scope: "calendar email profile",
					token_type: "Bearer",
				}),
				{ status: 200 },
			),
		);

		const result = await exchangeGoogleCalendarOAuthCode(
			{
				clientId: "google-client-id",
				clientSecret: "google-client-secret",
				redirectUri: "http://localhost:3000/api/calendar/oauth/google/callback",
			},
			"oauth-code-1",
		);

		expect(result.accessToken).toBe("access-token-1");
		expect(result.refreshToken).toBe("refresh-token-1");
		expect(result.tokenType).toBe("Bearer");
		expect(result.expiresAt).toBeGreaterThan(Date.now());

		fetchMock.mockRestore();
	});

	it("fetches account identity for the connected Google user", async () => {
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					id: "google-account-1",
					email: "fleet@example.com",
					name: "Fleet Google",
					picture: "https://example.com/avatar.png",
				}),
				{ status: 200 },
			),
		);

		const result = await fetchGoogleCalendarAccountProfile("access-token-1");

		expect(result.externalAccountId).toBe("google-account-1");
		expect(result.accountEmail).toBe("fleet@example.com");
		expect(result.displayName).toBe("Fleet Google");
		expect(result.avatarUrl).toBe("https://example.com/avatar.png");

		fetchMock.mockRestore();
	});
});
