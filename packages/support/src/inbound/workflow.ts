import type { WorkflowContext } from "@my-app/workflows";
import { createStep, createWorkflow } from "@my-app/workflows";
import { addInboundTicketMessage } from "../messages/service";
import {
	emitSupportInboundProcessed,
	emitSupportInboundReceived,
} from "../shared/events";
import type {
	Db,
	ProcessInboundSupportIntentInput,
	ProcessInboundSupportIntentOutput,
	SupportActorContext,
} from "../shared/types";
import { createTicket, getTicket } from "../tickets/service";
import {
	findTicketIdByExternalThread,
	insertInboundMessage,
	updateInboundProcessingState,
} from "./repository";

const toActorContext = (context: WorkflowContext): SupportActorContext => ({
	actorUserId: context.actorUserId,
	eventBus: context.eventBus,
});

const resolveInboundBody = (
	input: ProcessInboundSupportIntentInput
): string => {
	if (input.normalizedText?.trim()) {
		return input.normalizedText.trim();
	}

	const payloadText = input.payload.text;
	if (typeof payloadText === "string" && payloadText.trim()) {
		return payloadText.trim();
	}

	return `Inbound ${input.channel} message`;
};

const buildInboundSubject = (
	input: ProcessInboundSupportIntentInput
): string => {
	if (input.defaultSubject?.trim()) {
		return input.defaultSubject.trim();
	}

	if (input.senderDisplayName?.trim()) {
		return `Message from ${input.senderDisplayName.trim()}`;
	}

	return `Inbound ${input.channel} message`;
};

const persistInboundStep = (db: Db) =>
	createStep<
		ProcessInboundSupportIntentInput,
		{
			inbound: ProcessInboundSupportIntentOutput["inbound"];
			intent: ProcessInboundSupportIntentInput;
		}
	>("support-persist-inbound", async (input, ctx) => {
		const inbound = await insertInboundMessage(
			{
				id: crypto.randomUUID(),
				organizationId: input.organizationId,
				ticketId: input.ticketId,
				channel: input.channel,
				externalMessageId: input.externalMessageId,
				externalThreadId: input.externalThreadId,
				externalSenderId: input.externalSenderId,
				senderDisplayName: input.senderDisplayName,
				dedupeKey: input.dedupeKey,
				normalizedText: input.normalizedText,
				payload: input.payload,
				status: "received",
			},
			db
		);

		await emitSupportInboundReceived(toActorContext(ctx), {
			channel: inbound.channel,
			inboundMessageId: inbound.id,
			organizationId: input.organizationId,
		});

		return {
			intent: input,
			inbound,
		};
	});

const resolveTicketStep = (db: Db) =>
	createStep<
		{
			inbound: ProcessInboundSupportIntentOutput["inbound"];
			intent: ProcessInboundSupportIntentInput;
		},
		{
			inbound: ProcessInboundSupportIntentOutput["inbound"];
			intent: ProcessInboundSupportIntentInput;
			ticket: ProcessInboundSupportIntentOutput["ticket"];
		}
	>("support-resolve-inbound-ticket", async (input, ctx) => {
		if (input.intent.ticketId) {
			const ticket = await getTicket(
				input.intent.ticketId,
				input.intent.organizationId,
				db
			);
			return { ...input, ticket };
		}

		const ticketId = await findTicketIdByExternalThread(
			{
				channel: input.intent.channel,
				externalThreadId: input.intent.externalThreadId,
				organizationId: input.intent.organizationId,
			},
			db
		);

		if (ticketId) {
			const ticket = await getTicket(ticketId, input.intent.organizationId, db);
			return { ...input, ticket };
		}

		const ticket = await createTicket(
			{
				organizationId: input.intent.organizationId,
				customerUserId: input.intent.customerUserId,
				createdByUserId: input.intent.createdByUserId,
				subject: buildInboundSubject(input.intent),
				description:
					input.intent.defaultDescription ?? input.intent.normalizedText,
				source: input.intent.channel,
			},
			db,
			toActorContext(ctx)
		);

		return { ...input, ticket };
	});

const persistInboundMessageStep = (db: Db) =>
	createStep<
		{
			inbound: ProcessInboundSupportIntentOutput["inbound"];
			intent: ProcessInboundSupportIntentInput;
			ticket: ProcessInboundSupportIntentOutput["ticket"];
		},
		ProcessInboundSupportIntentOutput
	>("support-persist-inbound-message", async (input, ctx) => {
		const message = await addInboundTicketMessage(
			{
				ticketId: input.ticket.id,
				organizationId: input.ticket.organizationId,
				authorUserId: input.intent.createdByUserId,
				channel: input.intent.channel,
				body: resolveInboundBody(input.intent),
				inboundMessageId: input.inbound.id,
				attachments: input.intent.attachments,
			},
			db,
			toActorContext(ctx)
		);
		const ticket = await getTicket(
			input.ticket.id,
			input.ticket.organizationId,
			db
		);

		return {
			inbound: input.inbound,
			ticket,
			message,
		};
	});

const markInboundProcessedStep = (db: Db) =>
	createStep<
		ProcessInboundSupportIntentOutput,
		ProcessInboundSupportIntentOutput
	>("support-mark-inbound-processed", async (input, ctx) => {
		const inbound = await updateInboundProcessingState(
			{
				id: input.inbound.id,
				processedAt: new Date(),
				status: "processed",
				ticketId: input.ticket.id,
			},
			db
		);

		await emitSupportInboundProcessed(toActorContext(ctx), {
			channel: inbound.channel,
			inboundMessageId: inbound.id,
			messageId: input.message.id,
			organizationId: input.ticket.organizationId,
			ticketId: input.ticket.id,
		});

		return {
			...input,
			inbound,
		};
	});

export const processInboundSupportWorkflow = (db: Db) => {
	const persistInbound = persistInboundStep(db);
	const resolveTicket = resolveTicketStep(db);
	const persistInboundMessage = persistInboundMessageStep(db);
	const markInboundProcessed = markInboundProcessedStep(db);

	return createWorkflow<
		ProcessInboundSupportIntentInput,
		ProcessInboundSupportIntentOutput
	>("support-process-inbound", async (input, ctx) => {
		const inboundState = await persistInbound(input, ctx);

		try {
			const resolved = await resolveTicket(inboundState, ctx);
			const withMessage = await persistInboundMessage(resolved, ctx);
			return await markInboundProcessed(withMessage, ctx);
		} catch (error) {
			await updateInboundProcessingState(
				{
					errorMessage: error instanceof Error ? error.message : String(error),
					id: inboundState.inbound.id,
					processedAt: new Date(),
					status: "failed",
					ticketId: inboundState.intent.ticketId ?? null,
				},
				db
			);
			throw error;
		}
	});
};

export async function processInboundSupportIntent(
	input: ProcessInboundSupportIntentInput,
	db: Db,
	workflowContext: WorkflowContext
): Promise<ProcessInboundSupportIntentOutput> {
	const result = await processInboundSupportWorkflow(db).execute(
		input,
		workflowContext
	);

	if (!result.success) {
		throw result.error;
	}

	return result.output;
}
