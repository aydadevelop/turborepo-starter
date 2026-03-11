export interface EmailAddress {
	address: string;
	name?: string;
}

export interface EmailAttachment {
	content: Buffer | Uint8Array | string;
	contentType?: string;
	filename: string;
}

export interface EmailMessage {
	attachments?: EmailAttachment[];
	from?: EmailAddress;
	headers?: Record<string, string>;
	html?: string;
	replyTo?: EmailAddress[];
	subject: string;
	text: string;
	to: EmailAddress[];
}

export interface EmailSendResult {
	accepted: string[];
	providerMessageId?: string;
	rejected: string[];
	response?: string;
}

export interface EmailProvider {
	readonly providerId: string;
	sendEmail(message: EmailMessage): Promise<EmailSendResult>;
}
