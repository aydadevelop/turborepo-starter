import { randomUUID } from "node:crypto";
import { db } from "@my-app/db";
import { contaktlyPrefillDraft } from "@my-app/db/schema/contaktly";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";

export interface ContaktlyScrapedPrefillPage {
	text: string;
	title: string;
	url: string;
}

export interface ContaktlyScrapedPrefillSite {
	combinedText: string;
	pages: ContaktlyScrapedPrefillPage[];
	siteTitle: string;
	sourceUrl: string;
}

export interface ContaktlyGeneratedPrefillDraft {
	businessSummary: string;
	customInstructions: string;
	openingMessage: string;
	qualifiedLeadDefinition: string;
	siteTitle: string;
	sourceUrl: string;
	starterCards: string[];
}

export interface ContaktlyPrefillDraftRecord
	extends ContaktlyGeneratedPrefillDraft {
	configId: string;
}

interface GeneratePrefillDraftInput {
	configId: string;
	fetchImpl?: typeof fetch;
	sourceUrl: string;
}

const HTML_TAG_RE = /<[^>]+>/g;
const SCRIPT_STYLE_RE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;
const TITLE_RE = /<title>([\s\S]*?)<\/title>/i;
const WHITESPACE_RE = /\s+/g;
const SENTENCE_RE = /[^.!?]+[.!?]?/g;
const SUMMARY_SENTENCE_RE =
	/(i am|my clients|founder|consultants|service businesses)/i;
const PRIORITY_PATHS = ["/services", "/pricing", "/faq"];
const HTML_ENTITIES: Record<string, string> = {
	"&amp;": "&",
	"&apos;": "'",
	"&#39;": "'",
	"&gt;": ">",
	"&lt;": "<",
	"&nbsp;": " ",
	"&quot;": '"',
};

const decodeHtmlEntities = (value: string) =>
	value.replace(
		/&(?:amp|apos|#39|gt|lt|nbsp|quot);/g,
		(entity) => HTML_ENTITIES[entity] ?? entity
	);

const normalizeWhitespace = (value: string) =>
	decodeHtmlEntities(value).replace(WHITESPACE_RE, " ").trim();

const stripHtml = (html: string) =>
	normalizeWhitespace(
		html.replace(SCRIPT_STYLE_RE, " ").replace(HTML_TAG_RE, " ")
	);

const extractTitle = (html: string) => {
	const match = html.match(TITLE_RE);
	return normalizeWhitespace(match?.[1] ?? "");
};

const extractLinks = ({ baseUrl, html }: { baseUrl: string; html: string }) => {
	const links = new Set<string>();
	const hrefMatches = html.matchAll(/<a\b[^>]*href="([^"]+)"/gi);

	for (const match of hrefMatches) {
		const href = match[1]?.trim();
		if (!href || href.startsWith("#") || href.startsWith("mailto:")) {
			continue;
		}
		if (href.startsWith("javascript:")) {
			continue;
		}

		try {
			const resolved = new URL(href, baseUrl);
			links.add(resolved.toString());
		} catch {
			// Ignore invalid href values while collecting same-origin links.
		}
	}

	return [...links];
};

const normalizeAbsoluteUrl = (value: string) => {
	try {
		return new URL(value).toString();
	} catch {
		throw new ORPCError("BAD_REQUEST", {
			message: "Source URL must be a valid absolute URL.",
		});
	}
};

const readPage = async ({
	fetchImpl,
	url,
}: {
	fetchImpl: typeof fetch;
	url: string;
}): Promise<ContaktlyScrapedPrefillPage> => {
	const response = await fetchImpl(url);

	if (!response.ok) {
		throw new ORPCError("BAD_REQUEST", {
			message: `Failed to fetch source page: ${url}`,
		});
	}

	const html = await response.text();
	const title = extractTitle(html) || new URL(url).pathname || url;

	return {
		url,
		title,
		text: stripHtml(html),
	};
};

const selectLinkedPages = ({
	homeHtml,
	sourceUrl,
}: {
	homeHtml: string;
	sourceUrl: string;
}) => {
	const source = new URL(sourceUrl);
	const sameOriginLinks = extractLinks({
		baseUrl: sourceUrl,
		html: homeHtml,
	}).filter((candidate) => {
		try {
			const parsed = new URL(candidate);
			return parsed.origin === source.origin;
		} catch {
			return false;
		}
	});

	const uniqueLinks = [...new Set(sameOriginLinks)];
	const prioritized = PRIORITY_PATHS.flatMap((pathname) => {
		const target = new URL(pathname, sourceUrl).toString();
		return uniqueLinks.includes(target) ? [target] : [];
	});
	const remaining = uniqueLinks.filter(
		(candidate) => !prioritized.includes(candidate)
	);

	return [...prioritized, ...remaining].slice(0, 3);
};

const splitSentences = (value: string) =>
	(value.match(SENTENCE_RE) ?? [])
		.map((sentence) => normalizeWhitespace(sentence))
		.filter(Boolean);

const pickBrandName = (siteTitle: string) =>
	normalizeWhitespace(siteTitle.split("|")[0] ?? siteTitle);

const buildBusinessSummary = (pages: ContaktlyScrapedPrefillPage[]) => {
	const sentences = splitSentences(pages[0]?.text ?? "");
	const preferred = sentences.filter((sentence) =>
		SUMMARY_SENTENCE_RE.test(sentence)
	);

	return (preferred.length > 0 ? preferred : sentences).slice(0, 2).join(" ");
};

const buildStarterCards = (combinedText: string) => {
	const normalized = combinedText.toLowerCase();
	const cards: string[] = [];

	if (
		normalized.includes("website") ||
		normalized.includes("landing page") ||
		normalized.includes("site copy")
	) {
		cards.push("I need a website redesign");
	}

	if (
		normalized.includes("messaging") ||
		normalized.includes("positioning") ||
		normalized.includes("narrative")
	) {
		cards.push("I want sharper sales messaging");
	}

	if (
		normalized.includes("qualif") ||
		normalized.includes("books") ||
		normalized.includes("booking") ||
		normalized.includes("lead flow")
	) {
		cards.push("I need a lead qualification flow");
	}

	for (const fallback of [
		"I need a website redesign",
		"I want sharper sales messaging",
		"I need a lead qualification flow",
	]) {
		if (!cards.includes(fallback)) {
			cards.push(fallback);
		}
	}

	return cards.slice(0, 3);
};

export const scrapeContaktlyPrefillSite = async ({
	fetchImpl = fetch,
	sourceUrl,
}: {
	fetchImpl?: typeof fetch;
	sourceUrl: string;
}): Promise<ContaktlyScrapedPrefillSite> => {
	const normalizedSourceUrl = normalizeAbsoluteUrl(sourceUrl);
	const homeResponse = await fetchImpl(normalizedSourceUrl);

	if (!homeResponse.ok) {
		throw new ORPCError("BAD_REQUEST", {
			message: `Failed to fetch source page: ${normalizedSourceUrl}`,
		});
	}

	const homeHtml = await homeResponse.text();
	const linkedPages = selectLinkedPages({
		homeHtml,
		sourceUrl: normalizedSourceUrl,
	});

	const [homePage, ...pages] = await Promise.all([
		Promise.resolve({
			url: normalizedSourceUrl,
			title: extractTitle(homeHtml) || new URL(normalizedSourceUrl).hostname,
			text: stripHtml(homeHtml),
		}),
		...linkedPages.map((url) =>
			readPage({
				fetchImpl,
				url,
			})
		),
	]);

	return {
		sourceUrl: normalizedSourceUrl,
		siteTitle: homePage.title,
		pages: [homePage, ...pages],
		combinedText: [homePage, ...pages]
			.map((page) => `${page.title} ${page.text}`)
			.join(" "),
	};
};

export const buildContaktlyPrefillDraft = (
	scraped: ContaktlyScrapedPrefillSite
): ContaktlyGeneratedPrefillDraft => {
	const brandName = pickBrandName(scraped.siteTitle);
	const businessSummary = buildBusinessSummary(scraped.pages);

	return {
		sourceUrl: scraped.sourceUrl,
		siteTitle: scraped.siteTitle,
		businessSummary,
		openingMessage: `Hi, I'm Ava for ${brandName}. Tell me whether you need a sharper website story, better sales messaging, or a stronger qualification flow, and I'll guide you to the fastest next step.`,
		starterCards: buildStarterCards(scraped.combinedText),
		customInstructions:
			"Use a concise, clarity-first tone. Stay aligned with founder-led B2B positioning, messy qualification pain, stronger website story, sharper discovery calls, and fast booking momentum.",
		qualifiedLeadDefinition:
			"Qualified lead: founder-led B2B company, consultant, or service business with traction that needs clearer positioning, stronger website messaging, or a tighter qualification and booking flow.",
	};
};

const toDraftRecord = (
	row: typeof contaktlyPrefillDraft.$inferSelect
): ContaktlyPrefillDraftRecord => ({
	configId: row.publicConfigId,
	sourceUrl: row.sourceUrl,
	siteTitle: row.siteTitle,
	businessSummary: row.businessSummary,
	openingMessage: row.openingMessage,
	starterCards: row.starterCards,
	customInstructions: row.customInstructions,
	qualifiedLeadDefinition: row.qualifiedLeadDefinition,
});

export const getContaktlyPrefillDraft = async (
	configId: string
): Promise<ContaktlyPrefillDraftRecord | null> => {
	const [stored] = await db
		.select()
		.from(contaktlyPrefillDraft)
		.where(eq(contaktlyPrefillDraft.publicConfigId, configId))
		.limit(1);

	return stored ? toDraftRecord(stored) : null;
};

export const generateContaktlyPrefillDraft = async ({
	configId,
	fetchImpl = fetch,
	sourceUrl,
}: GeneratePrefillDraftInput): Promise<ContaktlyPrefillDraftRecord> => {
	const scraped = await scrapeContaktlyPrefillSite({
		sourceUrl,
		fetchImpl,
	});
	const draft = buildContaktlyPrefillDraft(scraped);

	await db
		.insert(contaktlyPrefillDraft)
		.values({
			id: randomUUID(),
			publicConfigId: configId,
			sourceUrl: draft.sourceUrl,
			siteTitle: draft.siteTitle,
			businessSummary: draft.businessSummary,
			openingMessage: draft.openingMessage,
			starterCards: draft.starterCards,
			customInstructions: draft.customInstructions,
			qualifiedLeadDefinition: draft.qualifiedLeadDefinition,
		})
		.onConflictDoUpdate({
			target: contaktlyPrefillDraft.publicConfigId,
			set: {
				sourceUrl: draft.sourceUrl,
				siteTitle: draft.siteTitle,
				businessSummary: draft.businessSummary,
				openingMessage: draft.openingMessage,
				starterCards: draft.starterCards,
				customInstructions: draft.customInstructions,
				qualifiedLeadDefinition: draft.qualifiedLeadDefinition,
				updatedAt: new Date(),
			},
		});

	const stored = await getContaktlyPrefillDraft(configId);

	if (!stored) {
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Failed to persist prefill draft.",
		});
	}

	return stored;
};
