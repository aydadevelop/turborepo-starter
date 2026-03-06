import { expect, test } from "./fixtures";
import { url } from "./utils/url";

const CONTAKTLY_CONVERSATIONS_URL_RE = /\/dashboard\/contaktly\/conversations$/;

test("admin sees org-scoped Contaktly conversations and thread details", async ({
	adminPage,
}) => {
	await adminPage.goto(url("/dashboard/contaktly"));

	await adminPage.getByTestId("contaktly-subnav-conversations").click();
	await expect(adminPage).toHaveURL(CONTAKTLY_CONVERSATIONS_URL_RE);
	await expect(adminPage.getByTestId("contaktly-subnav")).toBeVisible();
	await expect(
		adminPage.getByTestId("contaktly-conversations-list")
	).toBeVisible();
	await expect(
		adminPage.getByTestId(
			"contaktly-conversation-row-seed-contaktly-conversation-1"
		)
	).toBeVisible();
	await expect(
		adminPage.getByTestId(
			"contaktly-conversation-row-seed-contaktly-conversation-2"
		)
	).toBeVisible();
	await expect(
		adminPage.getByTestId("contaktly-conversation-status-ready_to_book")
	).toBeVisible();
	await expect(
		adminPage
			.getByTestId("contaktly-conversations-list")
			.locator("button")
			.first()
	).toHaveAttribute(
		"data-testid",
		"contaktly-conversation-row-seed-contaktly-conversation-1"
	);

	await adminPage.getByTestId("contaktly-sort-visitor").click();
	await expect(
		adminPage
			.getByTestId("contaktly-conversations-list")
			.locator("button")
			.first()
	).toHaveAttribute(
		"data-testid",
		"contaktly-conversation-row-seed-contaktly-conversation-2"
	);

	await adminPage.getByTestId("contaktly-sort-qualified").click();
	await expect(
		adminPage
			.getByTestId("contaktly-conversations-list")
			.locator("button")
			.first()
	).toHaveAttribute(
		"data-testid",
		"contaktly-conversation-row-seed-contaktly-conversation-1"
	);
	await expect(
		adminPage.getByTestId("contaktly-conversation-thread")
	).toContainText("Book the strategy call now.");
});
