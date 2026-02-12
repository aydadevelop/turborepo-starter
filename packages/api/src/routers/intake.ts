import { db } from "@full-stack-cf-app/db";
import {
	inboundMessage,
	supportTicket,
} from "@full-stack-cf-app/db/schema/support";
import { ORPCError } from "@orpc/server";
import { and, desc, eq } from "drizzle-orm";
import z from "zod";

import { organizationPermissionProcedure } from "../index";
import {
	inboundMessageOutputSchema,
	ingestInboundMessageInputSchema,
	listManagedInboundMessagesInputSchema,
	processManagedInboundMessageInputSchema,
} from "./intake.schemas";
import { requireActiveMembership } from "./shared/auth-utils";

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
			const dedupeKey = normalizeDedupeKey({
				channel: input.channel,
				externalMessageId: input.externalMessageId,
				externalThreadId: input.externalThreadId,
				dedupeKey: input.dedupeKey,
			});

			if (input.ticketId) {
				const [managedTicket] = await db
					.select({ id: supportTicket.id })
					.from(supportTicket)
					.where(
						and(
							eq(supportTicket.id, input.ticketId),
							eq(supportTicket.organizationId, activeMembership.organizationId)
						)
					)
					.limit(1);

				if (!managedTicket) {
					throw new ORPCError("BAD_REQUEST", {
						message: "Ticket is not available in the active organization",
					});
				}
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
