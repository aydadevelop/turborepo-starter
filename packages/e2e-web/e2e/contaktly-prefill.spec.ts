import { expect, test } from "./fixtures";
import { url } from "./utils/url";

const siteURL = process.env.PLAYWRIGHT_SITE_URL ?? "http://localhost:43275/";
const normalizedSiteURL = new URL(siteURL).toString();
const MARY_GOLD_STUDIO_RE = /Mary Gold Studio/;

test.describe("Contaktly Prefill", () => {
	test("admin generates and reloads a persisted prefill draft from the Astro fixture", async ({
		adminPage,
	}) => {
		await adminPage.goto(url("/dashboard/contaktly/prefill"));

		await adminPage.getByTestId("contaktly-prefill-url-input").fill(siteURL);
		await adminPage.getByRole("button", { name: "Generate draft" }).click();

		await expect(
			adminPage.getByTestId("contaktly-prefill-summary")
		).toContainText("Mary Gold Studio");
		await expect(
			adminPage.getByTestId("contaktly-prefill-opening-message")
		).toHaveValue(MARY_GOLD_STUDIO_RE);
		await expect(
			adminPage.getByTestId("contaktly-prefill-starter-cards")
		).toContainText("website redesign");
		await expect(
			adminPage.getByTestId("contaktly-prefill-qualified-lead-definition")
		).toContainText("founder-led B2B");

		await adminPage.reload();

		await expect(
			adminPage.getByTestId("contaktly-prefill-url-input")
		).toHaveValue(normalizedSiteURL);
		await expect(
			adminPage.getByTestId("contaktly-prefill-opening-message")
		).toHaveValue(MARY_GOLD_STUDIO_RE);
	});
});
