export { DEFAULT_NOTIFICATION_EMAIL_PROVIDER_ID } from "./constants";
export { EmailNotificationProvider } from "./channel-provider";
export { createFakeEmailProvider, FakeEmailProvider } from "./adapters/fake";
export { createSmtpEmailProvider, SmtpEmailProvider } from "./adapters/smtp";
export type {
	FakeEmailProviderOptions,
	FakeEmailProviderRecord,
} from "./adapters/fake";
export type { SmtpEmailProviderConfig } from "./adapters/smtp";
export type {
	EmailAddress,
	EmailAttachment,
	EmailMessage,
	EmailProvider,
	EmailSendResult,
} from "./provider";
export {
	getEmailProvider,
	registerEmailProvider,
	resetEmailProviderRegistry,
} from "./registry";
