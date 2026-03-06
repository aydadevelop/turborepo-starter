import { env } from "@my-app/env/server";
import { ORPCError, streamToEventIterator } from "@orpc/server";

import { organizationProcedure, publicProcedure } from "../index";
import { getContaktlyAnalyticsSummary } from "../lib/contaktly-analytics";
import {
	appendContaktlyConversationTurn,
	ensureContaktlyConversation,
} from "../lib/contaktly-conversation";
import { listContaktlyConversationsForOrganization } from "../lib/contaktly-conversations";
import {
	buildWidgetSessionToken,
	isDemoWidgetSourceAllowed,
} from "../lib/contaktly-demo";
import {
	connectContaktlyGoogleCalendar,
	getContaktlyGoogleCalendarConnectionStatus,
} from "../lib/contaktly-google-calendar";
import { getContaktlyKnowledgeBase } from "../lib/contaktly-knowledge";
import { getContaktlyMeetingPipeline } from "../lib/contaktly-meetings";
import {
	generateContaktlyPrefillDraft,
	getContaktlyPrefillDraft,
} from "../lib/contaktly-prefill";
import { createContaktlyWidgetChatStream } from "../lib/contaktly-widget-chat";
import {
	ensureContaktlyWorkspaceOwnership,
	getContaktlyWidgetAdminConfig,
	resolveContaktlyWidgetConfig,
	resolveContaktlyWorkspaceOrganizationId,
	saveContaktlyWidgetAdminConfig,
} from "../lib/contaktly-widget-config";

const assertAllowedSourceUrl = ({
	allowedDomains,
	hostOrigin,
	sourceUrl,
}: {
	allowedDomains: string[];
	hostOrigin?: string;
	sourceUrl: string;
}) => {
	const candidateSource = sourceUrl.trim() || hostOrigin?.trim() || "";
	if (
		!isDemoWidgetSourceAllowed({
			allowedDomains,
			sourceUrl: candidateSource,
		})
	) {
		throw new ORPCError("FORBIDDEN", {
			message:
				"Widget source URL is not allowed for this configuration. Update allowedDomains before embedding.",
		});
	}
};

const isGoogleOAuthConfigured = () =>
	Boolean(
		env.GOOGLE_OAUTH_CLIENT_ID.trim() && env.GOOGLE_OAUTH_CLIENT_SECRET.trim()
	);

const requireSessionUserId = (userId: string | null | undefined): string => {
	if (!userId) {
		throw new ORPCError("UNAUTHORIZED");
	}

	return userId;
};

const requireOrganizationId = ({
	activeMembership,
}: {
	activeMembership?: { organizationId: string } | null;
}) => {
	if (!activeMembership?.organizationId) {
		throw new ORPCError("FORBIDDEN");
	}

	return activeMembership.organizationId;
};

export const contaktlyRouter = {
	getGoogleCalendarConnection:
		organizationProcedure.contaktly.getGoogleCalendarConnection.handler(
			async ({ context, input }) => {
				const userId = requireSessionUserId(context.session?.user?.id);
				const organizationId = requireOrganizationId(context);
				await ensureContaktlyWorkspaceOwnership({
					configId: input.configId,
					organizationId,
				});
				const status = await getContaktlyGoogleCalendarConnectionStatus({
					configId: input.configId,
					userId,
				});

				return {
					...status,
					oauthConfigured: isGoogleOAuthConfigured(),
				};
			}
		),
	connectGoogleCalendar:
		organizationProcedure.contaktly.connectGoogleCalendar.handler(
			async ({ context, input }) => {
				const userId = requireSessionUserId(context.session?.user?.id);
				const organizationId = requireOrganizationId(context);
				await ensureContaktlyWorkspaceOwnership({
					configId: input.configId,
					organizationId,
				});
				const status = await connectContaktlyGoogleCalendar({
					configId: input.configId,
					userId,
				});

				return {
					...status,
					oauthConfigured: isGoogleOAuthConfigured(),
				};
			}
		),
	getPrefillDraft: organizationProcedure.contaktly.getPrefillDraft.handler(
		async ({ context, input }) => {
			await ensureContaktlyWorkspaceOwnership({
				configId: input.configId,
				organizationId: requireOrganizationId(context),
			});
			return await getContaktlyPrefillDraft(input.configId);
		}
	),
	generatePrefillDraft:
		organizationProcedure.contaktly.generatePrefillDraft.handler(
			async ({ context, input }) => {
				await ensureContaktlyWorkspaceOwnership({
					configId: input.configId,
					organizationId: requireOrganizationId(context),
				});
				return await generateContaktlyPrefillDraft(input);
			}
		),
	getWidgetConfig: organizationProcedure.contaktly.getWidgetConfig.handler(
		async ({ context, input }) => {
			return await getContaktlyWidgetAdminConfig(
				input.configId,
				requireOrganizationId(context)
			);
		}
	),
	updateWidgetConfig:
		organizationProcedure.contaktly.updateWidgetConfig.handler(
			async ({ context, input }) => {
				return await saveContaktlyWidgetAdminConfig({
					...input,
					organizationId: requireOrganizationId(context),
				});
			}
		),
	listConversations: organizationProcedure.contaktly.listConversations.handler(
		async ({ context }) => {
			return await listContaktlyConversationsForOrganization(
				requireOrganizationId(context)
			);
		}
	),
	getAnalyticsSummary:
		organizationProcedure.contaktly.getAnalyticsSummary.handler(
			async ({ context, input }) => {
				const organizationId = requireOrganizationId(context);
				await ensureContaktlyWorkspaceOwnership({
					configId: input.configId,
					organizationId,
				});

				return await getContaktlyAnalyticsSummary(
					organizationId,
					input.configId
				);
			}
		),
	getKnowledgeBase: organizationProcedure.contaktly.getKnowledgeBase.handler(
		async ({ context, input }) => {
			await ensureContaktlyWorkspaceOwnership({
				configId: input.configId,
				organizationId: requireOrganizationId(context),
			});
			return await getContaktlyKnowledgeBase(input.configId);
		}
	),
	getMeetingPipeline:
		organizationProcedure.contaktly.getMeetingPipeline.handler(
			async ({ context, input }) => {
				const organizationId = requireOrganizationId(context);
				await ensureContaktlyWorkspaceOwnership({
					configId: input.configId,
					organizationId,
				});
				const pipeline = await getContaktlyMeetingPipeline({
					configId: input.configId,
					organizationId,
					userId: requireSessionUserId(context.session?.user?.id),
				});

				return {
					...pipeline,
					calendar: {
						...pipeline.calendar,
						oauthConfigured: isGoogleOAuthConfigured(),
					},
				};
			}
		),
	getWidgetBootstrap: publicProcedure.contaktly.getWidgetBootstrap.handler(
		async ({ input }) => {
			const widget = await resolveContaktlyWidgetConfig(input.configId);
			const organizationId = await resolveContaktlyWorkspaceOrganizationId(
				input.configId
			);
			assertAllowedSourceUrl({
				allowedDomains: widget.allowedDomains,
				hostOrigin: input.hostOrigin,
				sourceUrl: input.sourceUrl,
			});
			const conversation = await ensureContaktlyConversation({
				configId: input.configId,
				organizationId,
				visitorId: input.visitorId,
				widgetInstanceId: input.widgetInstanceId,
				openingMessage: widget.openingMessage,
			});

			return {
				configId: input.configId,
				botName: widget.botName,
				bookingUrl: widget.bookingUrl,
				openingMessage: widget.openingMessage,
				starterCards: [...widget.starterCards],
				theme: widget.theme,
				pageContext: {
					hostOrigin: input.hostOrigin,
					pageTitle: input.pageTitle,
					referrer: input.referrer,
					sourceUrl: input.sourceUrl,
					tags: input.tags,
				},
				visitorId: input.visitorId,
				widgetInstanceId: input.widgetInstanceId,
				widgetSessionToken: buildWidgetSessionToken(input),
				conversationId: conversation.id,
				messages: conversation.messages,
				activePromptKey: conversation.activePromptKey,
				stage: conversation.stage,
				stateVersion: conversation.stateVersion,
			};
		}
	),
	sendWidgetTurn: publicProcedure.contaktly.sendWidgetTurn.handler(
		async ({ input }) => {
			const expectedToken = buildWidgetSessionToken(input);

			if (input.widgetSessionToken !== expectedToken) {
				throw new ORPCError("UNAUTHORIZED");
			}

			const widget = await resolveContaktlyWidgetConfig(input.configId);
			const organizationId = await resolveContaktlyWorkspaceOrganizationId(
				input.configId
			);
			assertAllowedSourceUrl({
				allowedDomains: widget.allowedDomains,
				hostOrigin: input.hostOrigin,
				sourceUrl: input.sourceUrl,
			});
			await ensureContaktlyConversation({
				configId: input.configId,
				organizationId,
				visitorId: input.visitorId,
				widgetInstanceId: input.widgetInstanceId,
				openingMessage: widget.openingMessage,
			});

			const result = await appendContaktlyConversationTurn({
				configId: input.configId,
				visitorId: input.visitorId,
				widgetInstanceId: input.widgetInstanceId,
				message: input.message,
				pageTitle: input.pageTitle,
				tags: input.tags,
				stateVersion: input.stateVersion,
				clientTurnId: input.clientTurnId,
			});

			return {
				assistantMessage: result.reply.assistantMessage,
				bookingUrl: widget.bookingUrl,
				intent: result.reply.intent,
				promptKey: result.reply.promptKey,
				stage: result.reply.stage,
				conversationId: result.conversationId,
				messages: result.messages,
				activePromptKey: result.activePromptKey,
				stateVersion: result.stateVersion,
			};
		}
	),
	streamWidgetChat: publicProcedure.contaktly.streamWidgetChat.handler(
		async ({ input }) => {
			const expectedToken = buildWidgetSessionToken(input);

			if (input.widgetSessionToken !== expectedToken) {
				throw new ORPCError("UNAUTHORIZED");
			}

			const widget = await resolveContaktlyWidgetConfig(input.configId);
			const organizationId = await resolveContaktlyWorkspaceOrganizationId(
				input.configId
			);
			assertAllowedSourceUrl({
				allowedDomains: widget.allowedDomains,
				hostOrigin: input.hostOrigin,
				sourceUrl: input.sourceUrl,
			});
			await ensureContaktlyConversation({
				configId: input.configId,
				organizationId,
				visitorId: input.visitorId,
				widgetInstanceId: input.widgetInstanceId,
				openingMessage: widget.openingMessage,
			});

			const stream = await createContaktlyWidgetChatStream({
				aiModel: env.AI_MODEL,
				clientTurnId: input.clientTurnId,
				configId: input.configId,
				hostOrigin: input.hostOrigin,
				messageId: input.messageId,
				messages: input.messages,
				openRouterApiKey: env.OPEN_ROUTER_API_KEY,
				pageTitle: input.pageTitle,
				sourceUrl: input.sourceUrl,
				stateVersion: input.stateVersion,
				tags: input.tags,
				visitorId: input.visitorId,
				widgetInstanceId: input.widgetInstanceId,
			});

			return streamToEventIterator(stream);
		}
	),
};
