import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import type {
	EmailAddress,
	EmailAttachment,
	EmailMessage,
	EmailProvider,
	EmailSendResult,
} from "../provider";

export interface SmtpEmailProviderConfig {
	auth?: {
		pass: string;
		user: string;
	};
	defaultFrom: EmailAddress;
	defaultReplyTo?: EmailAddress;
	host: string;
	ignoreTls?: boolean;
	port: number;
	providerId: string;
	secure?: boolean;
	transporter?: Mail<SMTPTransport.SentMessageInfo>;
}

export class SmtpEmailProvider implements EmailProvider {
	readonly providerId: string;

	private readonly defaultFrom: EmailAddress;
	private readonly defaultReplyTo?: EmailAddress;
	private readonly transporter: Mail<SMTPTransport.SentMessageInfo>;

	constructor(config: SmtpEmailProviderConfig) {
		this.providerId = config.providerId;
		this.defaultFrom = config.defaultFrom;
		this.defaultReplyTo = config.defaultReplyTo;
		this.transporter =
			config.transporter ??
			nodemailer.createTransport({
				auth: config.auth,
				host: config.host,
				ignoreTLS: config.ignoreTls ?? false,
				port: config.port,
				secure: config.secure ?? false,
			});
	}

	async sendEmail(message: EmailMessage): Promise<EmailSendResult> {
		const info = await this.transporter.sendMail({
			attachments: message.attachments?.map((attachment) => ({
				content: toAttachmentContent(attachment.content),
				contentType: attachment.contentType,
				filename: attachment.filename,
			})),
			from: formatAddress(message.from ?? this.defaultFrom),
			headers: message.headers,
			html: message.html,
			replyTo: formatAddresses(
				message.replyTo ??
					(this.defaultReplyTo ? [this.defaultReplyTo] : undefined),
			),
			subject: message.subject,
			text: message.text,
			to: formatAddresses(message.to),
		});

		return {
			accepted: toStringArray(info.accepted),
			providerMessageId:
				typeof info.messageId === "string" ? info.messageId : undefined,
			rejected: toStringArray(info.rejected),
			response: typeof info.response === "string" ? info.response : undefined,
		};
	}
}

export const createSmtpEmailProvider = (
	config: SmtpEmailProviderConfig,
): EmailProvider => new SmtpEmailProvider(config);

const formatAddress = (address: EmailAddress): string => {
	const trimmedName = address.name?.trim();
	if (!trimmedName) {
		return address.address;
	}

	return `"${trimmedName.replace(/"/g, '\\"')}" <${address.address}>`;
};

const formatAddresses = (addresses: EmailAddress[] | undefined): string[] | undefined => {
	if (!addresses || addresses.length === 0) {
		return undefined;
	}

	return addresses.map(formatAddress);
};

const toStringArray = (value: unknown): string[] => {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.map((entry) => String(entry));
};

const toAttachmentContent = (
	content: EmailAttachment["content"],
): string | Buffer => {
	if (typeof content === "string" || Buffer.isBuffer(content)) {
		return content;
	}

	return Buffer.from(content);
};
