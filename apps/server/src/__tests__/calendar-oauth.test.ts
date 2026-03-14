import { beforeEach, describe, expect, it, vi } from "vitest";

const createContextMock = vi.fn();
const hasOrganizationPermissionMock = vi.fn();
const exchangeGoogleCalendarOAuthCodeMock = vi.fn();
const fetchGoogleCalendarAccountProfileMock = vi.fn();
const connectOrganizationCalendarAccountMock = vi.fn();
const refreshOrganizationCalendarSourcesMock = vi.fn();

vi.mock("@my-app/env/server", () => {
	return {
		env: {
			CORS_ORIGIN: "http://localhost:5173",
			BETTER_AUTH_SECRET: "test-secret-123456",
			BETTER_AUTH_URL: "http://localhost:3000/api/auth",
			GOOGLE_CLIENT_ID: "test-google-client-id",
			GOOGLE_CLIENT_SECRET: "test-google-client-secret",
		},
	};
});

vi.mock("@my-app/api/context", () => {
	return {
		createContext: createContextMock,
	};
});

vi.mock("@my-app/api/organization", () => {
	return {
		hasOrganizationPermission: hasOrganizationPermissionMock,
	};
});

vi.mock("@my-app/db", () => {
	return {
		db: {},
	};
});

vi.mock("@my-app/calendar", async () => {
	const actual =
		await vi.importActual<typeof import("@my-app/calendar")>(
			"@my-app/calendar"
		);
	return {
		...actual,
		exchangeGoogleCalendarOAuthCode: exchangeGoogleCalendarOAuthCodeMock,
		fetchGoogleCalendarAccountProfile: fetchGoogleCalendarAccountProfileMock,
		connectOrganizationCalendarAccount: connectOrganizationCalendarAccountMock,
		refreshOrganizationCalendarSources: refreshOrganizationCalendarSourcesMock,
	};
});

describe("calendarOauthRoutes", () => {
	beforeEach(() => {
		vi.resetModules();
		createContextMock.mockReset();
		hasOrganizationPermissionMock.mockReset();
		exchangeGoogleCalendarOAuthCodeMock.mockReset();
		fetchGoogleCalendarAccountProfileMock.mockReset();
		connectOrganizationCalendarAccountMock.mockReset();
		refreshOrganizationCalendarSourcesMock.mockReset();

		createContextMock.mockResolvedValue({
			session: {
				user: {
					id: "user-1",
				},
			},
			activeMembership: {
				organizationId: "org-1",
				role: "org_owner",
			},
		});
		hasOrganizationPermissionMock.mockReturnValue(true);
		exchangeGoogleCalendarOAuthCodeMock.mockResolvedValue({
			accessToken: "access-token-1",
			refreshToken: "refresh-token-1",
			tokenType: "Bearer",
			scope: "calendar email profile",
			expiresAt: Date.now() + 3_600_000,
		});
		fetchGoogleCalendarAccountProfileMock.mockResolvedValue({
			accountEmail: "fleet@example.com",
			avatarUrl: "https://example.com/avatar.png",
			displayName: "Fleet Google",
			externalAccountId: "google-account-1",
		});
		connectOrganizationCalendarAccountMock.mockResolvedValue({
			id: "account-1",
		});
		refreshOrganizationCalendarSourcesMock.mockResolvedValue([]);
	});

	it("starts the Google OAuth connect flow with a signed state cookie", async () => {
		const { calendarOauthRoutes } = await import("../routes/calendar-oauth");

		const response = await calendarOauthRoutes.request(
			"http://localhost:3000/api/calendar/oauth/google/start",
			{
				headers: new Headers({
					referer: "http://localhost:5173/org/listings/listing-1",
				}),
			}
		);

		expect(response.status).toBe(302);
		const location = response.headers.get("location");
		expect(location).toBeTruthy();
		expect(location).toContain("accounts.google.com/o/oauth2/v2/auth");
		if (!location) {
			throw new Error("Expected OAuth redirect location header");
		}
		const redirectUrl = new URL(location);
		expect(redirectUrl.searchParams.get("client_id")).toBe(
			"test-google-client-id"
		);
		expect(redirectUrl.searchParams.get("redirect_uri")).toBe(
			"http://localhost:3000/api/calendar/oauth/google/callback"
		);
		expect(redirectUrl.searchParams.get("state")).toBeTruthy();
		expect(response.headers.get("set-cookie")).toContain(
			"calendar_google_oauth_nonce="
		);
	});

	it("exchanges the callback code, persists the account, refreshes sources, and redirects back", async () => {
		const { calendarOauthRoutes } = await import("../routes/calendar-oauth");

		const startResponse = await calendarOauthRoutes.request(
			"http://localhost:3000/api/calendar/oauth/google/start",
			{
				headers: new Headers({
					referer: "http://localhost:5173/org/listings/listing-1",
				}),
			}
		);

		const startLocationHeader = startResponse.headers.get("location");
		expect(startLocationHeader).toBeTruthy();
		if (!startLocationHeader) {
			throw new Error("Expected OAuth start location header");
		}
		const startLocation = new URL(startLocationHeader);
		const state = startLocation.searchParams.get("state");
		const cookieHeader = startResponse.headers.get("set-cookie");

		const response = await calendarOauthRoutes.request(
			`http://localhost:3000/api/calendar/oauth/google/callback?code=test-code&state=${encodeURIComponent(state ?? "")}`,
			{
				headers: new Headers({
					cookie: cookieHeader ?? "",
				}),
			}
		);

		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe(
			"http://localhost:5173/org/listings/listing-1?calendarConnect=connected"
		);
		expect(exchangeGoogleCalendarOAuthCodeMock).toHaveBeenCalledWith(
			{
				clientId: "test-google-client-id",
				clientSecret: "test-google-client-secret",
				redirectUri: "http://localhost:3000/api/calendar/oauth/google/callback",
			},
			"test-code"
		);
		expect(connectOrganizationCalendarAccountMock).toHaveBeenCalledWith(
			expect.objectContaining({
				organizationId: "org-1",
				provider: "google",
				externalAccountId: "google-account-1",
				accountEmail: "fleet@example.com",
				displayName: "Fleet Google",
				createdByUserId: "user-1",
				providerMetadata: expect.objectContaining({
					credentials: expect.objectContaining({
						accessToken: "access-token-1",
						refreshToken: "refresh-token-1",
					}),
				}),
			}),
			expect.anything()
		);
		expect(refreshOrganizationCalendarSourcesMock).toHaveBeenCalledWith(
			"account-1",
			"org-1",
			expect.anything()
		);
	});
});
