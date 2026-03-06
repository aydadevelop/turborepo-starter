import { describe, expect, it } from "vitest";

import {
	buildDemoFlowReply,
	buildWidgetSessionToken,
	isDemoWidgetSourceAllowed,
	resolveDemoWidget,
} from "../lib/contaktly-demo";

const countQuestions = (value: string) => (value.match(/\?/g) ?? []).length;

describe("resolveDemoWidget", () => {
	it("falls back to the seeded demo widget config", () => {
		const widget = resolveDemoWidget("missing-config");

		expect(widget.botName).toBe("Ava");
		expect(widget.starterCards).toContain("I need a website redesign");
		expect(widget.bookingUrl).toContain("calendly.com");
	});
});

describe("buildWidgetSessionToken", () => {
	it("derives the public widget token from config and trace ids", () => {
		expect(
			buildWidgetSessionToken({
				configId: "ctly-demo-founder",
				visitorId: "visitor-12345678",
				widgetInstanceId: "instance-abcdefgh",
			})
		).toBe("widget_ctly-demo-founder_visitor-_instance");
	});
});

describe("isDemoWidgetSourceAllowed", () => {
	it("allows matching domains and subdomains", () => {
		expect(
			isDemoWidgetSourceAllowed({
				allowedDomains: ["app.contaktly.com"],
				sourceUrl: "https://app.contaktly.com/pricing",
			})
		).toBe(true);
		expect(
			isDemoWidgetSourceAllowed({
				allowedDomains: ["contaktly.com"],
				sourceUrl: "https://staging.contaktly.com/demo",
			})
		).toBe(true);
	});

	it("rejects domains that are not allowlisted", () => {
		expect(
			isDemoWidgetSourceAllowed({
				allowedDomains: ["app.contaktly.com"],
				sourceUrl: "https://example.com",
			})
		).toBe(false);
	});
});

describe("buildDemoFlowReply", () => {
	it("asks a single follow-up question for redesign intent", () => {
		const reply = buildDemoFlowReply({
			currentIntent: "general",
			currentPromptKey: "goal",
			message: "I need a website redesign for our homepage",
			slots: {},
		});

		expect(reply.intent).toBe("website-redesign");
		expect(reply.promptKey).toBe("pain_point");
		expect(reply.stage).toBe("qualification");
		expect(reply.slots.goal).toContain("website redesign");
		expect(countQuestions(reply.assistantMessage)).toBe(1);
	});

	it("moves to ready_to_book after required slots are complete", () => {
		const reply = buildDemoFlowReply({
			currentIntent: "website-redesign",
			currentPromptKey: "timeline",
			message: "We want launch in 3 weeks",
			slots: {
				goal: "Increase qualified meetings",
				pain_point: "Homepage does not convert",
			},
		});

		expect(reply.stage).toBe("ready_to_book");
		expect(reply.assistantMessage).toContain("qualified");
		expect(reply.slots.timeline).toContain("3 weeks");
		expect(countQuestions(reply.assistantMessage)).toBe(0);
	});
});
