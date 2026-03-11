import type {
	SupportActorContext,
	SupportTicketInsert,
	SupportTicketStatus,
} from "./types";

const REOPENED_STATUSES = new Set<SupportTicketStatus>([
	"open",
	"pending_customer",
	"pending_operator",
	"escalated",
]);

export const getFollowupStatusFromMessage = (
	isInternal: boolean,
	authorKind: "customer" | "inbound" | "operator"
): SupportTicketStatus | null => {
	if (isInternal) {
		return null;
	}

	return authorKind === "operator" ? "pending_customer" : "pending_operator";
};

export const buildTicketStatusPatch = (
	status: SupportTicketStatus,
	actorContext?: SupportActorContext
): Partial<SupportTicketInsert> => {
	const now = new Date();

	if (status === "resolved") {
		return {
			status,
			resolvedAt: now,
			resolvedByUserId: actorContext?.actorUserId ?? null,
			closedAt: null,
			closedByUserId: null,
		};
	}

	if (status === "closed") {
		return {
			status,
			closedAt: now,
			closedByUserId: actorContext?.actorUserId ?? null,
		};
	}

	if (REOPENED_STATUSES.has(status)) {
		return {
			status,
			resolvedAt: null,
			resolvedByUserId: null,
			closedAt: null,
			closedByUserId: null,
		};
	}

	return { status };
};
