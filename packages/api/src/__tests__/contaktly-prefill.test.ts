import { bootstrapTestDatabase } from "@my-app/db/test";
import { describe, expect, it, vi } from "vitest";

const testDbState = bootstrapTestDatabase();

vi.doMock("@my-app/db", () => ({
	get db() {
		return testDbState.db;
	},
}));

const {
	buildContaktlyPrefillDraft,
	generateContaktlyPrefillDraft,
	getContaktlyPrefillDraft,
	scrapeContaktlyPrefillSite,
} = await import("../lib/contaktly-prefill");

const SITE_URL = "http://localhost:43275/";
const FIXTURE_PAGES = new Map<string, string>([
	[
		SITE_URL,
		`<!doctype html>
		<html>
			<head>
				<title>Mary Gold Studio | Founder-led Growth Messaging</title>
			</head>
			<body>
				<nav>
					<a href="/services">Services</a>
					<a href="/pricing">Pricing</a>
					<a href="/faq">FAQ</a>
				</nav>
				<h1>Helping solo founders sound sharp before they scale.</h1>
				<p>I am Mary Gold, a strategist and product marketer who turns scattered offers into clear, high-conversion positioning systems.</p>
				<p>My clients are typically bootstrapped B2B founders, consultants, or service businesses with a strong product but weak sales messaging.</p>
				<p>If your pipeline is full of vague enquiries, low-fit leads, or demo requests with no context, I help you replace generic contact forms with a guided conversation that qualifies, routes, and books.</p>
			</body>
		</html>`,
	],
	[
		`${SITE_URL}services`,
		`<!doctype html>
		<html>
			<head><title>Services | Mary Gold Studio</title></head>
			<body>
				<h2>Messaging sprints</h2>
				<p>Clarify ICP, offer framing, landing page narrative, and demo call structure in one focused sprint.</p>
				<h2>Launch systems</h2>
				<p>Build the lead journey from first visit through qualification, booking, and follow-up automation.</p>
			</body>
		</html>`,
	],
	[
		`${SITE_URL}pricing`,
		`<!doctype html>
		<html>
			<head><title>Pricing | Mary Gold Studio</title></head>
			<body>
				<h2>Clarity Sprint</h2>
				<p>A one-week engagement for founders who need immediate message clarity before a launch or investor round.</p>
				<h2>Lead Engine Build</h2>
				<p>Strategy, website messaging, qualification flow, and booking automation for founder-led teams that are ready to systemize inbound.</p>
			</body>
		</html>`,
	],
	[
		`${SITE_URL}faq`,
		`<!doctype html>
		<html>
			<head><title>FAQ | Mary Gold Studio</title></head>
			<body>
				<p>Mostly. The sweet spot is founder-led B2B, boutique agencies, and consulting offers with a higher-ticket sales process.</p>
				<p>Customer interviews, current site copy, and clarity on company size, market, and ideal customer profile.</p>
			</body>
		</html>`,
	],
]);

const fetchFixturePage: typeof fetch = (input) => {
	const url = typeof input === "string" ? input : input.toString();
	const body = FIXTURE_PAGES.get(url);

	if (!body) {
		return Promise.resolve(new Response("Not found", { status: 404 }));
	}

	return Promise.resolve(
		new Response(body, {
			status: 200,
			headers: {
				"content-type": "text/html; charset=utf-8",
			},
		})
	);
};

describe("contaktly prefill", () => {
	it("extracts founder summary, services, audience, and tone from the Astro fixture pages", async () => {
		const scraped = await scrapeContaktlyPrefillSite({
			sourceUrl: SITE_URL,
			fetchImpl: fetchFixturePage,
		});

		expect(scraped.siteTitle).toContain("Mary Gold Studio");
		expect(scraped.pages).toHaveLength(4);
		expect(scraped.combinedText).toContain("Mary Gold");
		expect(scraped.combinedText).toContain("bootstrapped B2B founders");
		expect(scraped.combinedText).toContain("Messaging sprints");
		expect(scraped.combinedText).toContain("Lead Engine Build");
	});

	it("builds a draft opening message, starter cards, and qualified lead definition from scraped content", async () => {
		const scraped = await scrapeContaktlyPrefillSite({
			sourceUrl: SITE_URL,
			fetchImpl: fetchFixturePage,
		});
		const draft = buildContaktlyPrefillDraft(scraped);

		expect(draft.businessSummary).toContain("Mary Gold");
		expect(draft.openingMessage).toContain("Mary Gold Studio");
		expect(draft.starterCards).toContain("I need a website redesign");
		expect(draft.starterCards).toContain("I want sharper sales messaging");
		expect(draft.qualifiedLeadDefinition).toContain("founder-led B2B");
		expect(draft.customInstructions).toContain("clarity");
	});

	it("stores a draft config for admin review before publish", async () => {
		const draft = await generateContaktlyPrefillDraft({
			configId: "ctly-demo-founder",
			sourceUrl: SITE_URL,
			fetchImpl: fetchFixturePage,
		});

		const stored = await getContaktlyPrefillDraft("ctly-demo-founder");

		expect(stored?.configId).toBe("ctly-demo-founder");
		expect(stored?.sourceUrl).toBe(SITE_URL);
		expect(stored?.openingMessage).toBe(draft.openingMessage);
		expect(stored?.starterCards).toContain("I need a website redesign");
		expect(stored?.qualifiedLeadDefinition).toContain("founder-led B2B");
	});
});
