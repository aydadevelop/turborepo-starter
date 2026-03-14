export type {
	FakeEmailProviderOptions,
	FakeEmailProviderRecord,
} from "./adapters/fake";
// biome-ignore lint/performance/noBarrelFile: Package-level notifications email entrypoint re-exports supported provider APIs.
export { createFakeEmailProvider, FakeEmailProvider } from "./adapters/fake";
export type { SmtpEmailProviderConfig } from "./adapters/smtp";
export { createSmtpEmailProvider, SmtpEmailProvider } from "./adapters/smtp";
export { EmailNotificationProvider } from "./channel-provider";
export { DEFAULT_NOTIFICATION_EMAIL_PROVIDER_ID } from "./constants";
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
