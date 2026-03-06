import { getContaktlyPrefillDraft } from "./contaktly-prefill";

export interface ContaktlyKnowledgeDocument {
	id: string;
	kind: "scraped_page";
	sourceUrl: string;
	status: "active";
	summary: string;
	tags: string[];
	title: string;
}

export interface ContaktlyKnowledgeBase {
	configId: string;
	documents: ContaktlyKnowledgeDocument[];
	siteTitle: string | null;
	sourceUrl: string | null;
}

const KNOWLEDGE_PAGE_BLUEPRINTS = [
	{
		pathname: "",
		summary: (
			draft: NonNullable<Awaited<ReturnType<typeof getContaktlyPrefillDraft>>>
		) => draft.businessSummary,
		tags: ["homepage", "overview"],
		title: "Homepage",
	},
	{
		pathname: "/services",
		summary: (
			draft: NonNullable<Awaited<ReturnType<typeof getContaktlyPrefillDraft>>>
		) => draft.customInstructions,
		tags: ["services", "offer"],
		title: "Services",
	},
	{
		pathname: "/pricing",
		summary: (
			draft: NonNullable<Awaited<ReturnType<typeof getContaktlyPrefillDraft>>>
		) => draft.openingMessage,
		tags: ["pricing", "cta"],
		title: "Pricing",
	},
	{
		pathname: "/faq",
		summary: (
			draft: NonNullable<Awaited<ReturnType<typeof getContaktlyPrefillDraft>>>
		) => draft.qualifiedLeadDefinition,
		tags: ["faq", "qualification"],
		title: "FAQ",
	},
] as const;

export const getContaktlyKnowledgeBase = async (
	configId: string
): Promise<ContaktlyKnowledgeBase> => {
	const draft = await getContaktlyPrefillDraft(configId);

	if (!draft) {
		return {
			configId,
			documents: [],
			siteTitle: null,
			sourceUrl: null,
		};
	}

	return {
		configId,
		documents: KNOWLEDGE_PAGE_BLUEPRINTS.map((blueprint) => ({
			id: `${configId}:${blueprint.title.toLowerCase()}`,
			kind: "scraped_page" as const,
			sourceUrl: new URL(blueprint.pathname || ".", draft.sourceUrl).toString(),
			status: "active" as const,
			summary: blueprint.summary(draft),
			tags: [...blueprint.tags],
			title: blueprint.title,
		})),
		siteTitle: draft.siteTitle,
		sourceUrl: draft.sourceUrl,
	};
};
