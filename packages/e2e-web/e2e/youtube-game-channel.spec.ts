import { expect, test } from "@playwright/test";
import { getPlaywrightRuntimeEnv } from "../playwright.env";
import { signInAsSeedAdmin } from "./utils";
import { url } from "./utils/url";

const { serverURL } = getPlaywrightRuntimeEnv();

// oRPC wire format: POST /rpc/{path}, body: { json: <input> }
const rpcBody = (input: Record<string, unknown>) => ({ json: input });

// A known gaming video (Mewgenics gameplay) — known to have a game channel section
const GAMING_VIDEO_ID = "CAjOvd0whuM";
const EXPECTED_GAME_CHANNEL_ID = "UCr3Ii8z6M_SukYNJFurj6JA";
const EXPECTED_GAME_TITLE = "Mewgenics";

// A non-gaming YouTube video (Rick Astley — Never Gonna Give You Up)
const NON_GAMING_VIDEO_ID = "dQw4w9WgXcQ";

test.describe("YouTube getGameChannel API", () => {
	test("returns game channel for a known gaming video", async ({ page }) => {
		await signInAsSeedAdmin(page);

		const response = await page
			.context()
			.request.post(`${serverURL}/rpc/youtube/channels/getGameChannel`, {
				headers: { "content-type": "application/json" },
				data: rpcBody({ youtubeVideoId: GAMING_VIDEO_ID }),
			});

		expect(response.status()).toBe(200);
		const body = await response.json();
		expect(body).toHaveProperty("json");

		const result = (body as { json: unknown }).json;
		expect(result).not.toBeNull();
		expect(result).toMatchObject({
			channelId: EXPECTED_GAME_CHANNEL_ID,
			title: EXPECTED_GAME_TITLE,
		});
	});

	test("returns null for a non-gaming video", async ({ page }) => {
		await signInAsSeedAdmin(page);

		const response = await page
			.context()
			.request.post(`${serverURL}/rpc/youtube/channels/getGameChannel`, {
				headers: { "content-type": "application/json" },
				data: rpcBody({ youtubeVideoId: NON_GAMING_VIDEO_ID }),
			});

		expect(response.status()).toBe(200);
		const body = await response.json();
		expect(body).toHaveProperty("json");

		const result = (body as { json: unknown }).json;
		expect(result).toBeNull();
	});

	test("returns 400 for invalid video ID format", async ({ page }) => {
		await signInAsSeedAdmin(page);

		const response = await page
			.context()
			.request.post(`${serverURL}/rpc/youtube/channels/getGameChannel`, {
				headers: { "content-type": "application/json" },
				data: rpcBody({ youtubeVideoId: "not-valid" }),
				failOnStatusCode: false,
			});

		expect(response.status()).toBeGreaterThanOrEqual(400);
	});

	test("returns 401 without authentication", async ({ page }) => {
		await page.goto(url("/"));

		const response = await page
			.context()
			.request.post(`${serverURL}/rpc/youtube/channels/getGameChannel`, {
				headers: { "content-type": "application/json" },
				data: rpcBody({ youtubeVideoId: GAMING_VIDEO_ID }),
				failOnStatusCode: false,
			});

		expect(response.status()).toBe(401);
	});
});
