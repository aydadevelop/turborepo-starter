import { organization } from "@my-app/db/schema/auth";
import {
	contaktlyPrefillDraft,
	contaktlyWorkspaceConfig,
} from "@my-app/db/schema/contaktly";
import { bootstrapTestDatabase } from "@my-app/db/test";
import { describe, expect, it, vi } from "vitest";

const testDbState = bootstrapTestDatabase();

vi.doMock("@my-app/db", () => ({
	get db() {
		return testDbState.db;
	},
}));

const { getContaktlyKnowledgeBase } = await import(
	"../lib/contaktly-knowledge"
);

describe("contaktly knowledge base", () => {
	it("returns an empty state until a prefill draft exists", async () => {
		await testDbState.db.insert(organization).values({
			id: "org-empty-knowledge",
			name: "Knowledge Empty",
			slug: "knowledge-empty",
		});
		await testDbState.db.insert(contaktlyWorkspaceConfig).values({
			id: "config-empty-knowledge",
			organizationId: "org-empty-knowledge",
			publicConfigId: "ctly-empty-knowledge",
			bookingUrl: "https://calendly.com/demo-team/intro",
		});

		const knowledge = await getContaktlyKnowledgeBase("ctly-empty-knowledge");

		expect(knowledge.siteTitle).toBeNull();
		expect(knowledge.sourceUrl).toBeNull();
		expect(knowledge.documents).toEqual([]);
	});

	it("derives a compact knowledge inventory from the persisted prefill draft", async () => {
		await testDbState.db.insert(organization).values({
			id: "org-knowledge",
			name: "Knowledge Org",
			slug: "knowledge-org",
		});
		await testDbState.db.insert(contaktlyWorkspaceConfig).values({
			id: "config-knowledge",
			organizationId: "org-knowledge",
			publicConfigId: "ctly-demo-founder",
			bookingUrl: "https://calendly.com/demo-team/intro",
		});
		await testDbState.db.insert(contaktlyPrefillDraft).values({
			id: "prefill-knowledge",
			publicConfigId: "ctly-demo-founder",
			sourceUrl: "https://marygold.studio/",
			siteTitle: "Mary Gold Studio",
			businessSummary: "Studio for founder-led B2B service businesses.",
			openingMessage: "Tell me what you are building.",
			starterCards: ["Website redesign", "Messaging", "Lead generation"],
			customInstructions: "Keep the flow concise.",
			qualifiedLeadDefinition: "Founder-led B2B team with urgency.",
		});

		const knowledge = await getContaktlyKnowledgeBase("ctly-demo-founder");

		expect(knowledge.siteTitle).toBe("Mary Gold Studio");
		expect(knowledge.documents).toHaveLength(4);
		expect(knowledge.documents.map((document) => document.title)).toEqual([
			"Homepage",
			"Services",
			"Pricing",
			"FAQ",
		]);
		expect(knowledge.documents.map((document) => document.sourceUrl)).toEqual([
			"https://marygold.studio/",
			"https://marygold.studio/services",
			"https://marygold.studio/pricing",
			"https://marygold.studio/faq",
		]);
	});
});
