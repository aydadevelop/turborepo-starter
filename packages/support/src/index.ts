// biome-ignore lint/performance/noBarrelFile: Package-level support entrypoint re-exports supported use cases.
export { processInboundSupportIntent } from "./inbound/workflow";
export type {
	InboundSupportIntent,
	OutboundSupportIntent,
} from "./intents/types";
export {
	addCustomerTicketMessage,
	addTicketMessage,
	getCustomerTicketThread,
	getOperatorTicketThread,
	listTicketMessages,
} from "./messages/service";
export type {
	AddCustomerTicketMessageInput,
	AddTicketMessageInput,
	AssignTicketInput,
	CreateSupportTicketInput,
	CustomerTicketThread,
	InboundMessageRow,
	InboundMessageStatus,
	ListCustomerTicketsFilter,
	ListOrgTicketsFilter,
	OperatorTicketThread,
	ProcessInboundSupportIntentInput,
	ProcessInboundSupportIntentOutput,
	SupportActorContext,
	SupportAttachment,
	SupportMessageChannel,
	SupportTicketMessageRow,
	SupportTicketPriority,
	SupportTicketRow,
	SupportTicketSource,
	SupportTicketStatus,
	UpdateTicketDueAtInput,
	UpdateTicketPriorityInput,
	UpdateTicketStatusInput,
} from "./shared/types";
export {
	assignTicket,
	createTicket as createSupportTicket,
	getCustomerTicket,
	getTicket,
	listCustomerTickets,
	listOrgTickets,
	updateTicketDueAt,
	updateTicketPriority,
	updateTicketStatus,
} from "./tickets/service";
