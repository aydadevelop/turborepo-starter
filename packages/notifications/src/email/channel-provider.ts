import type { notificationEvent } from "@my-app/db/schema/notification";
import type { NotificationRecipient } from "../contracts";

import type {
	NotificationProvider,
	NotificationProviderResult,
} from "../processor";
import { getEmailProvider } from "./registry";

export interface EmailNotificationProviderOptions {
	emailProviderId: string;
}

export class EmailNotificationProvider implements NotificationProvider {
	channel = "email" as const;
	name: string;

	private readonly emailProviderId: string;

	constructor(options: EmailNotificationProviderOptions) {
		this.emailProviderId = options.emailProviderId;
		this.name = `email:${options.emailProviderId}`;
	}

	async send(params: {
		event: typeof notificationEvent.$inferSelect;
		intentId: string;
		recipient: NotificationRecipient;
	}): Promise<NotificationProviderResult> {
		const email = String(params.recipient.metadata?.email ?? "").trim();
		if (!email) {
			return {
				status: "failed",
				failureReason: "email is missing in recipient metadata",
			};
		}

		try {
			const provider = getEmailProvider(this.emailProviderId);
			const result = await provider.sendEmail({
				headers: {
					"X-Notification-Event-ID": params.event.id,
					"X-Notification-Event-Type": params.event.eventType,
					"X-Notification-Intent-ID": params.intentId,
					"X-Notification-Organization-ID": params.event.organizationId,
				},
				html: buildHtmlBody(params.recipient),
				subject: params.recipient.title.trim(),
				text: buildTextBody(params.recipient),
				to: [{ address: email }],
			});

			return {
				status: result.rejected.length === 0 ? "sent" : "failed",
				failureReason:
					result.rejected.length > 0
						? `SMTP_REJECTED_RECIPIENTS: ${result.rejected.join(", ")}`
						: undefined,
				providerMessageId: result.providerMessageId,
				providerRecipient: email,
				responsePayload: result.response,
			};
		} catch (error) {
			return {
				status: "failed",
				failureReason:
					error instanceof Error ? error.message : "Email delivery failed",
				providerRecipient: email,
			};
		}
	}
}

const buildTextBody = (recipient: NotificationRecipient): string => {
	const sections = [recipient.title.trim()];
	const body = recipient.body?.trim();
	if (body) {
		sections.push(body);
	}
	if (recipient.ctaUrl) {
		sections.push(`Open: ${recipient.ctaUrl}`);
	}

	return sections.join("\n\n");
};

const buildHtmlBody = (recipient: NotificationRecipient): string => {
	const parts = [`<h1>${escapeHtml(recipient.title.trim())}</h1>`];
	const body = recipient.body?.trim();
	if (body) {
		parts.push(`<p>${escapeHtml(body)}</p>`);
	}
	if (recipient.ctaUrl) {
		const href = escapeHtml(recipient.ctaUrl);
		parts.push(`<p><a href="${href}">Open notification</a></p>`);
	}

	return parts.join("");
};

const escapeHtml = (value: string): string =>
	value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
