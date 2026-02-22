import { expect, test } from "@playwright/test";
import { getPlaywrightRuntimeEnv } from "../playwright.env";
import { signInAsSeedAdmin } from "./utils";
import { url } from "./utils/url";

const { serverURL } = getPlaywrightRuntimeEnv();

// oRPC RPCHandler wire format: POST /rpc/{path}, body: { json: <input>, meta?: [...] }
const rpcBody = (input: Record<string, unknown>) => ({ json: input });

test.describe("YouTube Search API", () => {
	test("semantic search endpoint responds", async ({ page }) => {
		await signInAsSeedAdmin(page);

		const response = await page
			.context()
			.request.post(`${serverURL}/rpc/youtube/search/semantic`, {
				headers: { "content-type": "application/json" },
				data: rpcBody({ query: "playtest feedback", limit: 5 }),
			});

		console.log("status:", response.status());
		const body = await response.json().catch(() => response.text());
		console.log("body:", JSON.stringify(body, null, 2));

		// Endpoint should respond (200 with results array, or 200 with empty array)
		expect(response.status()).toBe(200);
		// oRPC wraps response in { json: <output> }
		expect(body).toHaveProperty("json");
		expect(Array.isArray((body as { json: unknown }).json)).toBe(true);
	});

	test("semantic search with empty query returns validation error", async ({
		page,
	}) => {
		await signInAsSeedAdmin(page);

		const response = await page
			.context()
			.request.post(`${serverURL}/rpc/youtube/search/semantic`, {
				headers: { "content-type": "application/json" },
				data: rpcBody({ query: "", limit: 5 }),
				failOnStatusCode: false,
			});

		// Empty query should fail validation (too short, min(1))
		expect(response.status()).toBeGreaterThanOrEqual(400);
	});

	test("semantic search without auth returns 401", async ({ page }) => {
		// Navigate to page but do NOT sign in
		await page.goto(url("/"));

		const response = await page
			.context()
			.request.post(`${serverURL}/rpc/youtube/search/semantic`, {
				headers: { "content-type": "application/json" },
				data: rpcBody({ query: "playtest feedback", limit: 5 }),
				failOnStatusCode: false,
			});

		expect(response.status()).toBe(401);
	});
});
