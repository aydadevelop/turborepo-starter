import { DEMO_WIDGET_CONFIG_ID } from "@my-app/contaktly-widget/constants";

export type DemoWidgetIntent =
	| "website-redesign"
	| "messaging"
	| "lead-generation"
	| "pricing"
	| "general";

export type DemoWidgetPromptKey =
	| "pain_point"
	| "audience"
	| "channel"
	| "timeline"
	| "goal";

export type DemoWidgetStage = "qualification" | "ready_to_book";

export type DemoWidgetSlots = Partial<Record<DemoWidgetPromptKey, string>>;

export interface DemoWidgetReply {
	assistantMessage: string;
	intent: DemoWidgetIntent;
	promptKey: DemoWidgetPromptKey;
	slots: DemoWidgetSlots;
	stage: DemoWidgetStage;
}

export interface DemoWidgetConfig {
	allowedDomains: string[];
	bookingUrl: string;
	botName: string;
	openingMessage: string;
	starterCards: string[];
	theme: {
		accentColor: string;
		backgroundColor: string;
	};
}

const PROMPT_QUESTION_BY_KEY: Record<DemoWidgetPromptKey, string> = {
	goal: "What outcome do you need this assistant to drive first?",
	audience: "Who needs to understand the offer faster for this to convert?",
	channel: "Which channel needs to produce more qualified meetings first?",
	timeline: "What timeline are you targeting for launch?",
	pain_point:
		"What is the biggest conversion blocker on the current site right now?",
};

const REQUIRED_PROMPTS_BY_INTENT: Record<
	DemoWidgetIntent,
	DemoWidgetPromptKey[]
> = {
	"website-redesign": ["goal", "pain_point", "timeline"],
	messaging: ["goal", "audience", "timeline"],
	"lead-generation": ["goal", "channel", "timeline"],
	pricing: ["goal", "timeline", "audience"],
	general: ["goal", "audience", "timeline"],
};

export const DEMO_WIDGETS: Record<string, DemoWidgetConfig> = {
	[DEMO_WIDGET_CONFIG_ID]: {
		allowedDomains: ["localhost", "127.0.0.1", "app.contaktly.com"],
		bookingUrl: "https://calendly.com/",
		botName: "Ava",
		openingMessage:
			"Hi, I am Ava. Tell me what you are building and I will guide you to the fastest next step.",
		starterCards: [
			"I need a website redesign",
			"I want help with messaging",
			"I need lead generation support",
		],
		theme: {
			accentColor: "#14532d",
			backgroundColor: "#f8fafc",
		},
	},
};

const containsAny = (value: string, phrases: string[]) =>
	phrases.some((phrase) => value.includes(phrase));

const normalize = (value: string) => value.trim().toLowerCase();

const normalizeHost = (value: string) => value.trim().toLowerCase();

const extractHost = (sourceUrl: string) => {
	if (!sourceUrl.trim()) {
		return "";
	}

	try {
		return normalizeHost(new URL(sourceUrl).hostname);
	} catch {
		return "";
	}
};

const isAllowedHost = (host: string, allowedDomains: string[]) =>
	allowedDomains.some((domain) => {
		const normalizedDomain = normalizeHost(domain);
		return host === normalizedDomain || host.endsWith(`.${normalizedDomain}`);
	});

export const isDemoWidgetSourceAllowed = ({
	allowedDomains,
	sourceUrl,
}: {
	allowedDomains: string[];
	sourceUrl: string;
}) => {
	const host = extractHost(sourceUrl);

	if (!host) {
		return true;
	}

	return isAllowedHost(host, allowedDomains);
};

export const buildWidgetSessionToken = ({
	configId,
	visitorId,
	widgetInstanceId,
}: {
	configId: string;
	visitorId: string;
	widgetInstanceId: string;
}) =>
	[
		"widget",
		configId,
		visitorId.slice(0, 8),
		widgetInstanceId.slice(0, 8),
	].join("_");

export const resolveDemoWidget = (configId: string): DemoWidgetConfig => {
	const fallbackWidget = DEMO_WIDGETS[DEMO_WIDGET_CONFIG_ID];

	if (!fallbackWidget) {
		throw new Error("Missing default Contaktly widget config");
	}

	return DEMO_WIDGETS[configId] ?? fallbackWidget;
};

export const detectDemoWidgetIntent = ({
	currentIntent = "general",
	message,
	pageTitle = "",
	tags = [],
}: {
	currentIntent?: DemoWidgetIntent;
	message: string;
	pageTitle?: string;
	tags?: string[];
}): DemoWidgetIntent => {
	if (currentIntent !== "general") {
		return currentIntent;
	}

	const normalizedMessage = normalize(message);
	const normalizedPageTitle = normalize(pageTitle);
	const normalizedTags = tags.map((tag) => normalize(tag));
	const pricingContext =
		normalizedTags.includes("pricing") ||
		normalizedPageTitle.includes("pricing");

	if (
		containsAny(normalizedMessage, [
			"website",
			"redesign",
			"landing page",
			"conversion",
			"homepage",
		])
	) {
		return "website-redesign";
	}

	if (
		containsAny(normalizedMessage, [
			"message",
			"messaging",
			"positioning",
			"copy",
			"offer",
			"narrative",
		])
	) {
		return "messaging";
	}

	if (
		containsAny(normalizedMessage, [
			"lead",
			"pipeline",
			"book meetings",
			"appointments",
			"inbound",
			"outbound",
		])
	) {
		return "lead-generation";
	}

	if (pricingContext) {
		return "pricing";
	}

	return "general";
};

const getNextPromptForIntent = ({
	intent,
	slots,
}: {
	intent: DemoWidgetIntent;
	slots: DemoWidgetSlots;
}) => REQUIRED_PROMPTS_BY_INTENT[intent].find((promptKey) => !slots[promptKey]);

export const buildReadyToBookMessage = () =>
	"Great, you are qualified for a focused strategy call. Use the booking action to lock a meeting right now.";

export const buildDemoFlowReply = ({
	currentIntent = "general",
	currentPromptKey,
	message,
	pageTitle = "",
	slots = {},
	tags = [],
}: {
	currentIntent?: DemoWidgetIntent;
	currentPromptKey: DemoWidgetPromptKey;
	message: string;
	pageTitle?: string;
	slots?: DemoWidgetSlots;
	tags?: string[];
}): DemoWidgetReply => {
	const trimmedMessage = message.trim();
	const normalizedSlots: DemoWidgetSlots = { ...slots };

	if (trimmedMessage) {
		normalizedSlots[currentPromptKey] = trimmedMessage;
	}

	const intent = detectDemoWidgetIntent({
		currentIntent,
		message,
		pageTitle,
		tags,
	});
	const nextPrompt = getNextPromptForIntent({
		intent,
		slots: normalizedSlots,
	});

	if (!nextPrompt) {
		return {
			assistantMessage: buildReadyToBookMessage(),
			intent,
			promptKey: currentPromptKey,
			stage: "ready_to_book",
			slots: normalizedSlots,
		};
	}

	return {
		assistantMessage: PROMPT_QUESTION_BY_KEY[nextPrompt],
		intent,
		promptKey: nextPrompt,
		stage: "qualification",
		slots: normalizedSlots,
	};
};

export const buildDemoAssistantReply = ({
	message,
	pageTitle = "",
	tags = [],
}: {
	message: string;
	pageTitle?: string;
	tags?: string[];
}) =>
	buildDemoFlowReply({
		message,
		pageTitle,
		tags,
		currentPromptKey: "goal",
		currentIntent: "general",
		slots: {},
	});
