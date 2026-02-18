import { db } from "@full-stack-cf-app/db";
import {
	inboundMessage,
	supportTicket,
	supportTicketMessage,
} from "@full-stack-cf-app/db/schema/support";
import { ORPCError } from "@orpc/server";
import { and, desc, eq } from "drizzle-orm";
import z from "zod";
import {
	inboundMessageOutputSchema,
	ingestInboundMessageInputSchema,
	listManagedInboundMessagesInputSchema,
	processManagedInboundMessageInputSchema,
} from "../contracts/intake";
import { organizationPermissionProcedure } from "../index";
import { requireActiveMembership } from "./shared/auth-utils";

const MAX_TICKET_SUBJECT_LENGTH = 200;
const MAX_TICKET_DESCRIPTION_LENGTH = 10_000;
const MAX_MESSAGE_BODY_LENGTH = 10_000;
const FIRST_LINE_REGEX = /\r?\n/u;

const normalizeDedupeKey = (params: {
	channel: string;
	externalMessageId: string;
	externalThreadId?: string;
	dedupeKey?: string;
}) => {
	const provided = params.dedupeKey?.trim();
	if (provided) {
		return provided;
	}

	return [
		params.channel,
		params.externalMessageId.trim(),
		params.externalThreadId?.trim() ?? "",
	].join(":");
};

const trimToNull = (value: string | undefined) => {
	const trimmed = value?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : null;
};

const buildInboundSubject = (params: {
	channel: string;
	text?: string;
	externalMessageId: string;
}) => {
	const trimmedText = trimToNull(params.text);
	if (trimmedText) {
		const firstLine = trimmedText.split(FIRST_LINE_REGEX, 1)[0] ?? trimmedText;
		return firstLine.slice(0, MAX_TICKET_SUBJECT_LENGTH);
	}
	return `${params.channel.toUpperCase()} message ${params.externalMessageId}`.slice(
		0,
		MAX_TICKET_SUBJECT_LENGTH
	);
};

const buildInboundBody = (params: {
	channel: string;
	text?: string;
	payload: string;
	externalMessageId: string;
}) => {
	const trimmedText = trimToNull(params.text);
	if (trimmedText) {
		return trimmedText.slice(0, MAX_MESSAGE_BODY_LENGTH);
	}
	return params.payload.slice(0, MAX_MESSAGE_BODY_LENGTH);
};

const requireManagedInboundMessage = async (params: {
	inboundMessageId: string;
	organizationId: string;
}) => {
	const [managedInboundMessage] = await db
		.select()
		.from(inboundMessage)
		.where(
			and(
				eq(inboundMessage.id, params.inboundMessageId),
				eq(inboundMessage.organizationId, params.organizationId)
			)
		)
		.limit(1);

	if (!managedInboundMessage) {
		throw new ORPCError("NOT_FOUND");
	}

	return managedInboundMessage;
};

export const intakeRouter = {
	ingestManaged: organizationPermissionProcedure({
		intake: ["create"],
	})
		.route({
			tags: ["Intake"],
			summary: "Ingest inbound message",
			description:
				"Receive and deduplicate an inbound message from an external channel.",
		})
		.input(ingestInboundMessageInputSchema)
		.output(
			z.object({
				idempotent: z.boolean(),
				inboundMessage: inboundMessageOutputSchema,
			})
		)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			const now = new Date();
			const dedupeKey = normalizeDedupeKey({
				channel: input.channel,
				externalMessageId: input.externalMessageId,
				externalThreadId: input.externalThreadId,
				dedupeKey: input.dedupeKey,
			});
			const inboundBody = buildInboundBody({
				channel: input.channel,
				text: input.text,
				payload: input.payload,
				externalMessageId: input.externalMessageId,
			});
			let managedTicket: typeof supportTicket.$inferSelect | null = null;

			if (input.ticketId) {
				const [existingManagedTicket] = await db
					.select({ id: supportTicket.id })
					.from(supportTicket)
					.where(
						and(
							eq(supportTicket.id, input.ticketId),
							eq(supportTicket.organizationId, activeMembership.organizationId)
						)
					)
					.limit(1);

				if (!existingManagedTicket) {
					throw new ORPCError("BAD_REQUEST", {
						message: "Ticket is not available in the active organization",
					});
				}

				const [managedTicketWithStatus] = await db
					.select()
					.from(supportTicket)
					.where(eq(supportTicket.id, existingManagedTicket.id))
					.limit(1);

				if (!managedTicketWithStatus) {
					throw new ORPCError("INTERNAL_SERVER_ERROR");
				}
				managedTicket = managedTicketWithStatus;
			}

			const [existingInboundMessage] = await db
				.select()
				.from(inboundMessage)
				.where(
					and(
						eq(inboundMessage.channel, input.channel),
						eq(inboundMessage.dedupeKey, dedupeKey)
					)
				)
				.limit(1);

			if (existingInboundMessage) {
				return {
					idempotent: true,
					inboundMessage: existingInboundMessage,
				};
			}

			const inboundMessageId = crypto.randomUUID();
			try {
				await db.insert(inboundMessage).values({
					id: inboundMessageId,
					organizationId: activeMembership.organizationId,
					ticketId: input.ticketId,
					channel: input.channel,
					externalMessageId: input.externalMessageId,
					externalThreadId: input.externalThreadId,
					externalSenderId: input.externalSenderId,
					senderDisplayName: input.senderDisplayName,
					dedupeKey,
					normalizedText: input.text?.toLowerCase(),
					payload: input.payload,
					status: "received",
					receivedAt: new Date(),
					createdAt: new Date(),
					updatedAt: new Date(),
				});
			} catch {
				const [conflictedInboundMessage] = await db
					.select()
					.from(inboundMessage)
					.where(
						and(
							eq(inboundMessage.channel, input.channel),
							eq(inboundMessage.dedupeKey, dedupeKey)
						)
					)
					.limit(1);

				if (conflictedInboundMessage) {
					return {
						idempotent: true,
						inboundMessage: conflictedInboundMessage,
					};
				}

				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			const [createdInboundMessage] = await db
				.select()
				.from(inboundMessage)
				.where(eq(inboundMessage.id, inboundMessageId))
				.limit(1);

			if (!createdInboundMessage) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			if (managedTicket) {
				await db.insert(supportTicketMessage).values({
					id: crypto.randomUUID(),
					ticketId: managedTicket.id,
					organizationId: activeMembership.organizationId,
					channel: input.channel,
					body: inboundBody,
					isInternal: false,
					createdAt: now,
					updatedAt: now,
				});

				await db
					.update(supportTicket)
					.set({
						status:
							managedTicket.status === "resolved" ||
							managedTicket.status === "escalated"
								? managedTicket.status
								: "pending_operator",
						updatedAt: now,
					})
					.where(eq(supportTicket.id, managedTicket.id));
			} else {
				const ticketId = crypto.randomUUID();
				const inboundMetadata = JSON.stringify({
					externalMessageId: input.externalMessageId,
					externalThreadId: input.externalThreadId,
					externalSenderId: input.externalSenderId,
					channel: input.channel,
				});

				await db.insert(supportTicket).values({
					id: ticketId,
					organizationId: activeMembership.organizationId,
					source: input.channel,
					status: "pending_operator",
					priority: "normal",
					subject: buildInboundSubject({
						channel: input.channel,
						text: input.text,
						externalMessageId: input.externalMessageId,
					}),
					description: trimToNull(input.text)?.slice(
						0,
						MAX_TICKET_DESCRIPTION_LENGTH
					),
					metadata: inboundMetadata,
					createdAt: now,
					updatedAt: now,
				});

				await db.insert(supportTicketMessage).values({
					id: crypto.randomUUID(),
					ticketId,
					organizationId: activeMembership.organizationId,
					channel: input.channel,
					body: inboundBody,
					isInternal: false,
					createdAt: now,
					updatedAt: now,
				});

				await db
					.update(inboundMessage)
					.set({
						ticketId,
						updatedAt: now,
					})
					.where(eq(inboundMessage.id, createdInboundMessage.id));

				const [updatedInboundMessage] = await db
					.select()
					.from(inboundMessage)
					.where(eq(inboundMessage.id, createdInboundMessage.id))
					.limit(1);

				if (!updatedInboundMessage) {
					throw new ORPCError("INTERNAL_SERVER_ERROR");
				}

				return {
					idempotent: false,
					inboundMessage: updatedInboundMessage,
				};
			}

			return {
				idempotent: false,
				inboundMessage: createdInboundMessage,
			};
		}),

	listManaged: organizationPermissionProcedure({
		intake: ["read"],
	})
		.route({
			tags: ["Intake"],
			summary: "List inbound messages",
			description:
				"List inbound messages with optional filters for channel, status, and ticket.",
		})
		.input(listManagedInboundMessagesInputSchema)
		.output(z.array(inboundMessageOutputSchema))
		.handler(({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			const where = and(
				eq(inboundMessage.organizationId, activeMembership.organizationId),
				input.channel ? eq(inboundMessage.channel, input.channel) : undefined,
				input.status ? eq(inboundMessage.status, input.status) : undefined,
				input.ticketId ? eq(inboundMessage.ticketId, input.ticketId) : undefined
			);

			if (!where) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return db
				.select()
				.from(inboundMessage)
				.where(where)
				.orderBy(desc(inboundMessage.receivedAt))
				.limit(input.limit);
		}),

	processManaged: organizationPermissionProcedure({
		intake: ["update"],
	})
		.route({
			tags: ["Intake"],
			summary: "Process inbound message",
			description: "Update the processing status of an inbound message.",
		})
		.input(processManagedInboundMessageInputSchema)
		.output(inboundMessageOutputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			const managedInboundMessage = await requireManagedInboundMessage({
				inboundMessageId: input.inboundMessageId,
				organizationId: activeMembership.organizationId,
			});

			await db
				.update(inboundMessage)
				.set({
					status: input.status,
					errorMessage:
						input.status === "failed"
							? input.errorMessage
							: managedInboundMessage.errorMessage,
					processedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(inboundMessage.id, managedInboundMessage.id));

			const [updatedInboundMessage] = await db
				.select()
				.from(inboundMessage)
				.where(eq(inboundMessage.id, managedInboundMessage.id))
				.limit(1);

			if (!updatedInboundMessage) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return updatedInboundMessage;
		}),
};
