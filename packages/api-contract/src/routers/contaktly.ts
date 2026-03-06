import { eventIterator, oc } from "@orpc/contract";
import z from "zod";

const widgetThemeSchema = z.object({
	accentColor: z.string(),
	backgroundColor: z.string(),
});

const widgetIntentSchema = z.enum([
	"website-redesign",
	"messaging",
	"lead-generation",
	"pricing",
	"general",
]);

const widgetPromptKeySchema = z.enum([
	"pain_point",
	"audience",
	"channel",
	"timeline",
	"goal",
]);

const widgetStageSchema = z.enum(["qualification", "ready_to_book"]);
const googleCalendarConnectionStatusSchema = z.object({
	configId: z.string(),
	provider: z.literal("google"),
	oauthConfigured: z.boolean(),
	status: z.enum([
		"not_linked",
		"missing_scope",
		"linked_account",
		"connected",
	]),
	accountEmail: z.string().nullable(),
	calendarId: z.string().nullable(),
	scopes: z.array(z.string()),
	connectedAt: z.string().nullable(),
});
const widgetConfigSchema = z.object({
	configId: z.string(),
	botName: z.string(),
	bookingUrl: z.string(),
	openingMessage: z.string(),
	starterCards: z.array(z.string()),
	allowedDomains: z.array(z.string()),
	theme: widgetThemeSchema,
});
const prefillDraftSchema = z.object({
	configId: z.string(),
	sourceUrl: z.string(),
	siteTitle: z.string(),
	businessSummary: z.string(),
	openingMessage: z.string(),
	starterCards: z.array(z.string()),
	customInstructions: z.string(),
	qualifiedLeadDefinition: z.string(),
});

const widgetMessageSchema = z.object({
	id: z.string(),
	role: z.enum(["assistant", "user"]),
	text: z.string(),
	createdAt: z.string(),
	intent: widgetIntentSchema.optional(),
	promptKey: widgetPromptKeySchema.optional(),
});
const widgetChatMessagePartSchema = z.record(z.string(), z.unknown());
const widgetChatMessageSchema = z.object({
	id: z.string(),
	role: z.enum(["user", "assistant", "system"]),
	parts: z.array(widgetChatMessagePartSchema),
});
const adminConversationSchema = z.object({
	activePromptKey: widgetPromptKeySchema,
	configId: z.string(),
	conversationId: z.string(),
	lastIntent: widgetIntentSchema,
	lastMessageText: z.string().nullable(),
	messageCount: z.number().int().nonnegative(),
	messages: z.array(widgetMessageSchema),
	slots: z.record(z.string(), z.string()),
	stage: widgetStageSchema,
	updatedAt: z.string().datetime(),
	visitorId: z.string(),
});
const analyticsConversationPreviewSchema = z.object({
	conversationId: z.string(),
	lastIntent: widgetIntentSchema,
	lastMessageText: z.string().nullable(),
	stage: widgetStageSchema,
	updatedAt: z.string().datetime(),
	visitorId: z.string(),
});
const analyticsSummarySchema = z.object({
	averageMessagesPerConversation: z.number().nonnegative(),
	calendarConnected: z.boolean(),
	configId: z.string(),
	hasPrefillDraft: z.boolean(),
	intentBreakdown: z.array(
		z.object({
			intent: widgetIntentSchema,
			count: z.number().int().nonnegative(),
		})
	),
	lastUpdatedAt: z.string().datetime().nullable(),
	qualificationRate: z.number().int().min(0).max(100),
	readyToBookConversations: z.number().int().nonnegative(),
	recentConversations: z.array(analyticsConversationPreviewSchema),
	totalConversations: z.number().int().nonnegative(),
	totalMessages: z.number().int().nonnegative(),
});
const knowledgeDocumentSchema = z.object({
	id: z.string(),
	kind: z.literal("scraped_page"),
	sourceUrl: z.string(),
	status: z.literal("active"),
	summary: z.string(),
	tags: z.array(z.string()),
	title: z.string(),
});
const knowledgeBaseSchema = z.object({
	configId: z.string(),
	documents: z.array(knowledgeDocumentSchema),
	siteTitle: z.string().nullable(),
	sourceUrl: z.string().nullable(),
});
const meetingQueueItemSchema = z.object({
	conversationId: z.string(),
	lastIntent: widgetIntentSchema,
	lastMessageText: z.string().nullable(),
	slots: z.record(z.string(), z.string()),
	updatedAt: z.string().datetime(),
	visitorId: z.string(),
});
const meetingPipelineSchema = z.object({
	bookingUrl: z.string(),
	calendar: googleCalendarConnectionStatusSchema,
	configId: z.string(),
	readyToBookConversations: z.array(meetingQueueItemSchema),
});

const widgetBootstrapSchema = z.object({
	botName: z.string(),
	bookingUrl: z.string(),
	configId: z.string(),
	conversationId: z.string(),
	openingMessage: z.string(),
	pageContext: z.object({
		hostOrigin: z.string(),
		pageTitle: z.string(),
		referrer: z.string(),
		sourceUrl: z.string(),
		tags: z.array(z.string()),
	}),
	starterCards: z.array(z.string()),
	theme: widgetThemeSchema,
	messages: z.array(widgetMessageSchema),
	activePromptKey: widgetPromptKeySchema,
	stage: widgetStageSchema,
	stateVersion: z.number().int().nonnegative(),
	visitorId: z.string(),
	widgetSessionToken: z.string(),
	widgetInstanceId: z.string(),
});

const widgetTurnReplySchema = z.object({
	assistantMessage: z.string(),
	bookingUrl: z.string(),
	intent: widgetIntentSchema,
	promptKey: widgetPromptKeySchema,
	stage: widgetStageSchema,
	conversationId: z.string(),
	messages: z.array(widgetMessageSchema),
	activePromptKey: widgetPromptKeySchema,
	stateVersion: z.number().int().nonnegative(),
});

export const contaktlyContract = {
	getGoogleCalendarConnection: oc
		.route({
			tags: ["Contaktly"],
			summary: "Resolve Google calendar connection status",
			description:
				"Returns the workspace calendar connection state for the selected public config id, plus whether Google OAuth is configured.",
		})
		.input(
			z.object({
				configId: z.string().min(1),
			})
		)
		.output(googleCalendarConnectionStatusSchema),

	connectGoogleCalendar: oc
		.route({
			tags: ["Contaktly"],
			summary:
				"Connect a linked Google account as the active workspace calendar",
			description:
				"Persists the current user's Google calendar access as the booking calendar for the selected public config id.",
		})
		.input(
			z.object({
				configId: z.string().min(1),
			})
		)
		.output(googleCalendarConnectionStatusSchema),

	getPrefillDraft: oc
		.route({
			tags: ["Contaktly"],
			summary: "Resolve stored admin prefill draft",
			description:
				"Returns the latest persisted draft generated from the configured website scrape source.",
		})
		.input(
			z.object({
				configId: z.string().min(1),
			})
		)
		.output(prefillDraftSchema.nullable()),

	generatePrefillDraft: oc
		.route({
			tags: ["Contaktly"],
			summary: "Generate admin prefill draft",
			description:
				"Scrapes the supplied site URL, derives messaging defaults, and persists a draft for admin review.",
		})
		.input(
			z.object({
				configId: z.string().min(1),
				sourceUrl: z.string().min(1),
			})
		)
		.output(prefillDraftSchema),

	getWidgetConfig: oc
		.route({
			tags: ["Contaktly"],
			summary: "Resolve admin widget config",
			description:
				"Returns the merged admin-facing widget config for the selected public config id.",
		})
		.input(
			z.object({
				configId: z.string().min(1),
			})
		)
		.output(widgetConfigSchema),

	updateWidgetConfig: oc
		.route({
			tags: ["Contaktly"],
			summary: "Update admin widget config",
			description:
				"Persists the admin booking URL override for the selected public config id.",
		})
		.input(
			z.object({
				configId: z.string().min(1),
				bookingUrl: z.string().min(1),
			})
		)
		.output(widgetConfigSchema),

	listConversations: oc
		.route({
			tags: ["Contaktly"],
			summary: "List organization conversations",
			description:
				"Returns Contaktly conversations scoped to the active organization for the operator dashboard.",
		})
		.input(z.object({}))
		.output(z.array(adminConversationSchema)),

	getAnalyticsSummary: oc
		.route({
			tags: ["Contaktly"],
			summary: "Resolve analytics summary for the selected workspace",
			description:
				"Returns the current conversation and setup metrics used by the Contaktly overview and analytics pages.",
		})
		.input(
			z.object({
				configId: z.string().min(1),
			})
		)
		.output(analyticsSummarySchema),

	getKnowledgeBase: oc
		.route({
			tags: ["Contaktly"],
			summary: "Resolve derived knowledge inventory",
			description:
				"Returns the current knowledge inventory derived from the latest persisted prefill draft.",
		})
		.input(
			z.object({
				configId: z.string().min(1),
			})
		)
		.output(knowledgeBaseSchema),

	getMeetingPipeline: oc
		.route({
			tags: ["Contaktly"],
			summary: "Resolve booking setup and ready-to-book queue",
			description:
				"Returns the current booking handoff configuration, calendar status, and ready-to-book conversations for the selected workspace.",
		})
		.input(
			z.object({
				configId: z.string().min(1),
			})
		)
		.output(meetingPipelineSchema),

	getWidgetBootstrap: oc
		.route({
			tags: ["Contaktly"],
			summary: "Resolve widget bootstrap state",
			description:
				"Returns the public widget configuration and trace identifiers for the iframe runtime.",
		})
		.input(
			z.object({
				configId: z.string().min(1),
				hostOrigin: z.string().default(""),
				pageTitle: z.string().default(""),
				referrer: z.string().default(""),
				sourceUrl: z.string().default(""),
				tags: z.array(z.string()).default([]),
				visitorId: z.string().min(1),
				widgetInstanceId: z.string().min(1),
			})
		)
		.output(widgetBootstrapSchema),

	sendWidgetTurn: oc
		.route({
			tags: ["Contaktly"],
			summary: "Send a public widget turn",
			description:
				"Accepts one visitor message and returns one deterministic assistant reply for the widget demo flow.",
		})
		.input(
			z.object({
				configId: z.string().min(1),
				hostOrigin: z.string().default(""),
				message: z.string().min(1),
				pageTitle: z.string().default(""),
				tags: z.array(z.string()).default([]),
				sourceUrl: z.string().default(""),
				visitorId: z.string().min(1),
				widgetInstanceId: z.string().min(1),
				widgetSessionToken: z.string().min(1),
				clientTurnId: z.string().min(1),
				stateVersion: z.number().int().nonnegative(),
			})
		)
		.output(widgetTurnReplySchema),

	streamWidgetChat: oc
		.route({
			tags: ["Contaktly"],
			summary: "Stream a public widget chat response",
			description:
				"Streams one assistant turn for the public widget using the shared AI SDK chat protocol.",
		})
		.input(
			z.object({
				configId: z.string().min(1),
				clientTurnId: z.string().min(1),
				hostOrigin: z.string().default(""),
				messageId: z.string().optional(),
				messages: z.array(widgetChatMessageSchema),
				pageTitle: z.string().default(""),
				sourceUrl: z.string().default(""),
				stateVersion: z.number().int().nonnegative(),
				tags: z.array(z.string()).default([]),
				visitorId: z.string().min(1),
				widgetInstanceId: z.string().min(1),
				widgetSessionToken: z.string().min(1),
			})
		)
		.output(eventIterator(z.record(z.string(), z.unknown()))),
};
