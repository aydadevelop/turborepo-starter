import { expect, test } from "@playwright/test";

const CONFIG_ID = "ctly-demo-founder";

test.describe("Widget Roadmap Specs", () => {
	// biome-ignore lint/suspicious/noSkippedTests: roadmap placeholder kept pending slice implementation.
	test.fixme("MVP | Astro homepage and pricing share one conversation and persist page tags", async ({
		page,
	}) => {
		const siteURL = process.env.PLAYWRIGHT_SITE_URL ?? "http://localhost:43275";

		await page.goto(siteURL);

		let frame = page.frameLocator('iframe[title="Contaktly widget"]');
		await frame
			.getByPlaceholder("Tell the widget what you want to improve...")
			.fill("We need a website redesign");
		await frame.getByRole("button", { name: "Send" }).click();

		await page.goto(`${siteURL}pricing`);

		frame = page.frameLocator('iframe[title="Contaktly widget"]');
		await expect(frame.getByText("We need a website redesign")).toBeVisible();
		await expect(frame.getByText("pricing")).toBeVisible();
	});

	// biome-ignore lint/suspicious/noSkippedTests: roadmap placeholder kept pending slice implementation.
	test.fixme("POC | booking CTA uses the configured booking URL instead of the seeded fallback", async ({
		page,
	}) => {
		await page.goto(`/widget?params=${CONFIG_ID}&open=1&tags=demo,founder`);

		const frame = page.frameLocator('iframe[title="Contaktly widget"]');

		await frame
			.getByPlaceholder("Tell the widget what you want to improve...")
			.fill("We need a website redesign");
		await frame.getByRole("button", { name: "Send" }).click();

		await frame
			.getByPlaceholder("Tell the widget what you want to improve...")
			.fill("Homepage does not convert");
		await frame.getByRole("button", { name: "Send" }).click();

		await frame
			.getByPlaceholder("Tell the widget what you want to improve...")
			.fill("Launch in 2 weeks");
		await frame.getByRole("button", { name: "Send" }).click();

		await expect(
			frame.getByRole("link", { name: "Open booking" })
		).toHaveAttribute("href", "https://calendar.google.com/demo-config");
	});

	// biome-ignore lint/suspicious/noSkippedTests: roadmap placeholder kept pending slice implementation.
	test.fixme("MVP | disallowed embed domain shows a safe widget error state", async ({
		page,
	}) => {
		await page.goto(
			`/embed/frame?params=${CONFIG_ID}&visitorId=test-visitor&widgetInstanceId=test-instance&sourceUrl=https://blocked.example.com&tags=blocked`
		);

		await expect(
			page.getByText("Widget source URL is not allowed for this configuration")
		).toBeVisible();
	});

	// biome-ignore lint/suspicious/noSkippedTests: roadmap placeholder kept pending slice implementation.
	test.fixme("MVP | qualified visitor books a Google-backed meeting inline", async ({
		page,
	}) => {
		await page.goto(`/widget?params=${CONFIG_ID}&open=1`);

		const frame = page.frameLocator('iframe[title="Contaktly widget"]');

		await frame
			.getByPlaceholder("Tell the widget what you want to improve...")
			.fill("We need a website redesign");
		await frame.getByRole("button", { name: "Send" }).click();

		await frame
			.getByPlaceholder("Tell the widget what you want to improve...")
			.fill("Homepage does not convert");
		await frame.getByRole("button", { name: "Send" }).click();

		await frame
			.getByPlaceholder("Tell the widget what you want to improve...")
			.fill("Launch in 2 weeks");
		await frame.getByRole("button", { name: "Send" }).click();

		await frame.getByRole("button", { name: "Choose 10:00 AM" }).click();
		await expect(
			frame.getByTestId("contaktly-booking-confirmation")
		).toContainText("Booked");
	});
});
