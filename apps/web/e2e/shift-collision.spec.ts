import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { url } from "./helpers";

const AUTO_SEED_BASELINE = process.env.PLAYWRIGHT_SEED_BASELINE === "1";
const SERVER_URL =
	process.env.PLAYWRIGHT_SERVER_URL ?? "http://localhost:43100";
const NO_LONGER_AVAILABLE_RE = /no longer available/i;
const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../.."
);
const seedScriptPath = path.resolve(
	repoRoot,
	"packages/db/scripts/seed-local.mjs"
);

const OWNER_EMAIL = "boat@boat.com";
const OWNER_PASSWORD = "boatboat";
const SHIFT_REASON_TEXT = "Shift to later daytime slot";

const seedBaselineScenario = () => {
	execFileSync(
		"node",
		[seedScriptPath, "--scenario", "baseline", "--anchor-date", "2026-03-15"],
		{
			cwd: repoRoot,
			stdio: "pipe",
		}
	);
};

const signInAsSeededOwner = async (page: Page) => {
	await page.goto(url("/"));

	const signInResult = await page.evaluate(
		async ({ email, password, serverUrl }) => {
			const response = await fetch(`${serverUrl}/api/auth/sign-in/email`, {
				method: "POST",
				credentials: "include",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({
					email,
					password,
				}),
			});

			const text = await response.text();
			let json: unknown = null;
			if (text.length > 0) {
				try {
					json = JSON.parse(text);
				} catch {
					json = null;
				}
			}

			return { ok: response.ok, status: response.status, text, json };
		},
		{
			email: OWNER_EMAIL,
			password: OWNER_PASSWORD,
			serverUrl: SERVER_URL,
		}
	);

	expect(
		signInResult.ok,
		`sign-in failed with ${signInResult.status}: ${signInResult.text || "<empty>"}`
	).toBe(true);
	expect(signInResult.status).toBe(200);
};

test.describe("Shift Collision Flow", () => {
	test.describe.configure({ mode: "serial" });

	test.beforeAll(() => {
		if (AUTO_SEED_BASELINE) {
			seedBaselineScenario();
		}
	});

	test("owner approval resolves to cancelled when proposed slot was blocked", async ({
		page,
	}) => {
		await signInAsSeededOwner(page);
		await page.goto(url("/bookings"));

		await expect(
			page.getByRole("heading", { name: "Shift Requests Review", exact: true })
		).toBeVisible();

		const shiftListItem = page
			.locator("li")
			.filter({ hasText: SHIFT_REASON_TEXT })
			.first();

		await expect(shiftListItem).toBeVisible();
		await expect(
			shiftListItem.getByText("pending", { exact: false })
		).toBeVisible();

		await shiftListItem.getByRole("button", { name: "Review shift" }).click();
		await shiftListItem
			.getByRole("button", { name: "Approve shift", exact: true })
			.click();

		await expect(
			shiftListItem.getByText("cancelled", { exact: false })
		).toBeVisible();
		await expect(shiftListItem.getByText(NO_LONGER_AVAILABLE_RE)).toBeVisible();
	});
});
