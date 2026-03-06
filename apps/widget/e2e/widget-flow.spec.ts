import { expect, type FrameLocator, type Page, test } from "@playwright/test";

const CONFIG_ID = "ctly-demo-founder";
const OVERRIDE_CONFIG_ID = "ctly-demo-founder-booking-url";
const VISITOR_STORAGE_KEY = `contaktly:widget:visitor:${CONFIG_ID}`;
const READY_MESSAGE =
	"Great, you are qualified for a focused strategy call. Use the booking action to lock a meeting right now.";

const getWidgetLauncher = (page: Page, configId?: string) =>
	page.locator(
		configId
			? `[data-contaktly-widget-launcher="${configId}"]`
			: "[data-contaktly-widget-launcher]"
	);

const getWidgetFrame = (page: Page): FrameLocator =>
	page.frameLocator('iframe[title="Contaktly widget"]');

const getVisitorId = async (page: Page) =>
	page.evaluate((key) => window.localStorage.getItem(key), VISITOR_STORAGE_KEY);

const waitForVisitorId = async (page: Page) => {
	await page.waitForFunction(
		(key) => window.localStorage.getItem(key) !== null,
		VISITOR_STORAGE_KEY
	);
	return getVisitorId(page);
};

const waitForWidgetReady = async (page: Page) => {
	const launcher = getWidgetLauncher(page);
	const iframeLocator = page.locator('iframe[title="Contaktly widget"]');
	if (
		!(await iframeLocator.isVisible()) &&
		(await launcher.count()) > 0 &&
		(await launcher.isVisible())
	) {
		await launcher.click();
	}

	const frame = getWidgetFrame(page);
	await expect(iframeLocator).toBeVisible();
	await expect(
		frame.getByPlaceholder("Tell me what you want help with...")
	).toBeVisible();
	return frame;
};

const sendTurn = async ({
	expectedReply,
	frame,
	message,
}: {
	expectedReply: string;
	frame: FrameLocator;
	message: string;
}) => {
	const composer = frame.getByPlaceholder("Tell me what you want help with...");

	await composer.fill(message);
	await frame.getByRole("button", { name: "Send" }).click();
	await expect(frame.getByText(message)).toBeVisible();
	await expect(frame.getByText(expectedReply)).toBeVisible();
};

const completeQualificationFlow = async (
	page: Page,
	expectedBookingUrl = "https://calendly.com/"
) => {
	const frame = await waitForWidgetReady(page);

	await sendTurn({
		frame,
		message: "We need a website redesign",
		expectedReply:
			"What is the biggest conversion blocker on the current site right now?",
	});

	await sendTurn({
		frame,
		message: "Homepage does not convert",
		expectedReply: "What timeline are you targeting for launch?",
	});

	await sendTurn({
		frame,
		message: "Launch in 2 weeks",
		expectedReply: READY_MESSAGE,
	});

	await expect(
		frame.getByRole("link", { name: "Open booking" })
	).toHaveAttribute("href", expectedBookingUrl);

	return frame;
};

test("widget host preserves server-backed history after reload", async ({
	page,
}) => {
	await page.goto(`/widget?params=${CONFIG_ID}&open=1&tags=demo,founder`);

	const visitorIdBefore = await waitForVisitorId(page);
	expect(visitorIdBefore).toBeTruthy();

	const frame = await completeQualificationFlow(page);
	await expect(frame.getByText("We need a website redesign")).toBeVisible();
	await expect(frame.getByText(READY_MESSAGE)).toBeVisible();

	await page.reload();

	const visitorIdAfter = await waitForVisitorId(page);
	expect(visitorIdAfter).toBe(visitorIdBefore);

	const reloadedFrame = await waitForWidgetReady(page);
	await expect(
		reloadedFrame.getByText("We need a website redesign")
	).toBeVisible();
	await expect(
		reloadedFrame.getByText("Homepage does not convert")
	).toBeVisible();
	await expect(reloadedFrame.getByText("Launch in 2 weeks")).toBeVisible();
	await expect(reloadedFrame.getByText(READY_MESSAGE)).toBeVisible();
	await expect(
		reloadedFrame.getByRole("link", { name: "Open booking" })
	).toBeVisible();
});

test("widget app root stays clean and still boots the floating launcher", async ({
	page,
}) => {
	await page.goto("/");

	await expect(getWidgetLauncher(page)).toBeVisible();
	await expect(
		page.getByText("Widget host, iframe runtime, and embed loader")
	).toHaveCount(0);
});

test("astro embed reload keeps the anonymous widget conversation", async ({
	page,
}) => {
	const siteURL = process.env.PLAYWRIGHT_SITE_URL;
	if (!siteURL) {
		throw new Error("PLAYWRIGHT_SITE_URL is required for widget embed E2E.");
	}

	await page.goto(siteURL);
	await expect(getWidgetLauncher(page, CONFIG_ID)).toBeVisible();

	const visitorIdBefore = await waitForVisitorId(page);
	expect(visitorIdBefore).toBeTruthy();

	const frame = await completeQualificationFlow(page);
	await expect(frame.getByText("Launch in 2 weeks")).toBeVisible();

	await page.reload();

	const visitorIdAfter = await waitForVisitorId(page);
	expect(visitorIdAfter).toBe(visitorIdBefore);

	const reloadedFrame = await waitForWidgetReady(page);
	await expect(
		reloadedFrame.getByText("We need a website redesign")
	).toBeVisible();
	await expect(
		reloadedFrame.getByText("Homepage does not convert")
	).toBeVisible();
	await expect(reloadedFrame.getByText("Launch in 2 weeks")).toBeVisible();
	await expect(reloadedFrame.getByText(READY_MESSAGE)).toBeVisible();
});

test("astro embed passes page context and page-specific tags into the iframe runtime", async ({
	page,
}) => {
	const siteURL = process.env.PLAYWRIGHT_SITE_URL;
	if (!siteURL) {
		throw new Error("PLAYWRIGHT_SITE_URL is required for widget embed E2E.");
	}

	await page.goto(`${siteURL}/pricing`);
	await expect(getWidgetLauncher(page, CONFIG_ID)).toBeVisible();

	const iframeSrc = await page
		.locator('iframe[title="Contaktly widget"]')
		.getAttribute("src");
	expect(iframeSrc).toBeTruthy();

	const frameUrl = new URL(iframeSrc ?? "");
	expect(frameUrl.searchParams.get("sourceUrl")).toBe(`${siteURL}/pricing`);
	expect(frameUrl.searchParams.get("pageTitle")).toContain("Pricing");
	expect(frameUrl.searchParams.get("hostOrigin")).toBe(siteURL);
	expect(frameUrl.searchParams.get("tags")?.split(",")).toEqual(
		expect.arrayContaining(["astro-site", "founder-led", "pricing"])
	);
});

test("widget host uses a persisted booking URL override after qualification", async ({
	page,
}) => {
	await page.goto(
		`/widget?params=${OVERRIDE_CONFIG_ID}&open=1&tags=demo,founder`
	);

	const frame = await completeQualificationFlow(
		page,
		"https://calendly.com/demo-team/intro"
	);

	await expect(
		frame.getByRole("link", { name: "Open booking" })
	).toHaveAttribute("href", "https://calendly.com/demo-team/intro");
});
