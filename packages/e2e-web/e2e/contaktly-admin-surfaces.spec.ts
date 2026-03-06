import { expect, test } from "./fixtures";
import { url } from "./utils/url";

const siteURL = process.env.PLAYWRIGHT_SITE_URL ?? "http://localhost:43275/";

test.describe("Contaktly admin demo surfaces", () => {
	test("analytics page shows seeded funnel and conversation metrics", async ({
		adminPage,
	}) => {
		await adminPage.goto(url("/dashboard/contaktly/analytics"));

		await expect(
			adminPage.getByTestId("contaktly-analytics-heading")
		).toBeVisible();
		await expect(
			adminPage.getByTestId("contaktly-analytics-total-conversations")
		).toContainText("2");
		await expect(
			adminPage.getByTestId("contaktly-analytics-ready-to-book")
		).toContainText("1");
		await expect(
			adminPage.getByTestId("contaktly-analytics-qualified-rate")
		).toContainText("50%");
		await expect(
			adminPage.getByTestId("contaktly-analytics-avg-depth")
		).toContainText("5.0");
		await expect(
			adminPage.getByTestId("contaktly-analytics-intent-breakdown")
		).toContainText("website-redesign");
	});

	test("meetings page exposes booking setup and the ready-to-book queue", async ({
		adminPage,
	}) => {
		await adminPage.goto(url("/dashboard/contaktly/meetings"));

		await expect(
			adminPage.getByTestId("contaktly-meetings-heading")
		).toBeVisible();
		await expect(
			adminPage.getByTestId("contaktly-meetings-booking-url")
		).toContainText("https://calendly.com/demo-team/intro");
		await expect(
			adminPage.getByTestId("contaktly-meetings-ready-queue")
		).toContainText("seed-visitor-1");
		await expect(
			adminPage.getByTestId("contaktly-meetings-ready-queue")
		).toContainText("Launch in 2 weeks");
	});

	test("knowledge page reflects the generated prefill source inventory", async ({
		adminPage,
	}) => {
		await adminPage.goto(url("/dashboard/contaktly/prefill"));
		await adminPage.getByTestId("contaktly-prefill-url-input").fill(siteURL);
		await adminPage.getByRole("button", { name: "Generate draft" }).click();
		await expect(
			adminPage.getByTestId("contaktly-prefill-summary")
		).toContainText("Mary Gold Studio");

		await adminPage.goto(url("/dashboard/contaktly/knowledge"));

		await expect(
			adminPage.getByTestId("contaktly-knowledge-heading")
		).toBeVisible();
		await expect(
			adminPage.getByTestId("contaktly-knowledge-site-title")
		).toContainText("Mary Gold Studio");
		await expect(
			adminPage.getByTestId("contaktly-knowledge-documents")
		).toContainText("/services");
		await expect(
			adminPage.getByTestId("contaktly-knowledge-documents")
		).toContainText("/pricing");
		await expect(
			adminPage.getByTestId("contaktly-knowledge-documents")
		).toContainText("/faq");
	});
});
