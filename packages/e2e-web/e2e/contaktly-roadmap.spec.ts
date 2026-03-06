import { expect, test } from "./fixtures";
import { url } from "./utils/url";

test.describe("Contaktly Roadmap Specs", () => {
	// biome-ignore lint/suspicious/noSkippedTests: roadmap placeholder kept pending slice implementation.
	test.fixme("POC | workspace admin saves a manual booking URL and the widget uses it", async ({
		adminPage,
		page,
	}) => {
		await adminPage.goto(url("/dashboard/contaktly/widget"));
		await adminPage
			.getByTestId("contaktly-booking-url-input")
			.fill("https://calendly.com/demo-team/intro");
		await adminPage.getByRole("button", { name: "Save booking URL" }).click();

		await page.goto("http://localhost:4174/widget?params=ctly-demo-founder");
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
		).toHaveAttribute("href", "https://calendly.com/demo-team/intro");
	});

	// biome-ignore lint/suspicious/noSkippedTests: roadmap placeholder kept pending slice implementation.
	test.fixme("MVP | workspace admin connects Google calendar with OAuth", async ({
		adminPage,
	}) => {
		await adminPage.goto(url("/dashboard/contaktly/widget"));
		await adminPage
			.getByRole("button", { name: "Connect Google Calendar" })
			.click();
		await expect(
			adminPage.getByTestId("contaktly-google-calendar-status")
		).toContainText("Connected");
		await expect(
			adminPage.getByTestId("contaktly-google-calendar-scopes")
		).toContainText("calendar");
	});

	// biome-ignore lint/suspicious/noSkippedTests: roadmap placeholder kept pending slice implementation.
	test.fixme("POC | workspace admin submits the Astro site URL and receives a prefill draft", async ({
		adminPage,
	}) => {
		await adminPage.goto(url("/dashboard/contaktly/prefill"));
		await adminPage
			.getByTestId("contaktly-prefill-url-input")
			.fill("http://localhost:43275/");
		await adminPage.getByRole("button", { name: "Generate draft" }).click();

		await expect(
			adminPage.getByTestId("contaktly-prefill-opening-message")
		).toContainText("Mary Gold");
		await expect(
			adminPage.getByTestId("contaktly-prefill-starter-cards")
		).toContainText("website redesign");
	});

	// biome-ignore lint/suspicious/noSkippedTests: roadmap placeholder kept pending slice implementation.
	test.fixme("MVP | sales operator sees contaktly conversations and booking outcomes", async ({
		operatorPage,
	}) => {
		await operatorPage.goto(url("/dashboard/contaktly/conversations"));
		await expect(
			operatorPage.getByTestId("contaktly-conversations-list")
		).toBeVisible();
		await expect(
			operatorPage.getByTestId("contaktly-conversation-status-meeting_booked")
		).toBeVisible();
		await expect(
			operatorPage.getByTestId("contaktly-conversation-thread")
		).toContainText("strategy call");
	});

	// biome-ignore lint/suspicious/noSkippedTests: roadmap placeholder kept pending slice implementation.
	test.fixme("POC | workspace admin sees seeded analytics for widget loads, chats, and meetings", async ({
		adminPage,
	}) => {
		await adminPage.goto(url("/dashboard/contaktly/analytics"));
		await expect(
			adminPage.getByTestId("contaktly-analytics-widget-loads")
		).toBeVisible();
		await expect(
			adminPage.getByTestId("contaktly-analytics-chat-starts")
		).toBeVisible();
		await expect(
			adminPage.getByTestId("contaktly-analytics-meetings-booked")
		).toBeVisible();
	});
});
