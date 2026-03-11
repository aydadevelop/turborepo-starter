import type {
	EmailMessage,
	EmailProvider,
	EmailSendResult,
} from "../provider";

export interface FakeEmailProviderRecord {
	message: EmailMessage;
	result: EmailSendResult;
}

export interface FakeEmailProviderOptions {
	onSend?: (record: FakeEmailProviderRecord) => void | Promise<void>;
	providerId?: string;
}

export class FakeEmailProvider implements EmailProvider {
	readonly providerId: string;

	readonly sent: FakeEmailProviderRecord[] = [];

	private readonly onSend?: FakeEmailProviderOptions["onSend"];

	constructor(options: FakeEmailProviderOptions = {}) {
		this.providerId = options.providerId ?? "fake-email";
		this.onSend = options.onSend;
	}

	async sendEmail(message: EmailMessage): Promise<EmailSendResult> {
		const result: EmailSendResult = {
			accepted: message.to.map((recipient) => recipient.address),
			providerMessageId: `fake-email-${this.sent.length + 1}`,
			rejected: [],
			response: "fake-email:accepted",
		};

		const record = {
			message,
			result,
		};
		this.sent.push(record);
		await this.onSend?.(record);
		return result;
	}
}

export const createFakeEmailProvider = (
	options?: FakeEmailProviderOptions,
): FakeEmailProvider => new FakeEmailProvider(options);
