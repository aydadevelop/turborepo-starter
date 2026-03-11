import { env } from "@my-app/env/server";
import {
	createFakeEmailProvider,
	createSmtpEmailProvider,
	DEFAULT_NOTIFICATION_EMAIL_PROVIDER_ID,
	registerEmailProvider,
} from "@my-app/notifications/email";

let integrationsRegistered = false;

export const registerNotificationIntegrations = (): void => {
	if (integrationsRegistered) {
		return;
	}

	if (env.EMAIL_BACKEND === "smtp") {
		if (!env.SMTP_HOST.trim()) {
			throw new Error(
				"EMAIL_BACKEND is configured as smtp, but SMTP_HOST is empty."
			);
		}

		registerEmailProvider(
			createSmtpEmailProvider({
				auth:
					env.SMTP_USER.trim() && env.SMTP_PASS.trim()
						? {
								user: env.SMTP_USER,
								pass: env.SMTP_PASS,
							}
						: undefined,
				defaultFrom: {
					address: env.EMAIL_FROM_ADDRESS,
					name: env.EMAIL_FROM_NAME,
				},
				defaultReplyTo: env.EMAIL_REPLY_TO.trim()
					? {
							address: env.EMAIL_REPLY_TO,
						}
					: undefined,
				host: env.SMTP_HOST,
				ignoreTls: env.SMTP_IGNORE_TLS === "1",
				port: env.SMTP_PORT,
				providerId: DEFAULT_NOTIFICATION_EMAIL_PROVIDER_ID,
				secure: env.SMTP_SECURE === "1",
			})
		);
	} else {
		registerEmailProvider(
			createFakeEmailProvider({
				providerId: DEFAULT_NOTIFICATION_EMAIL_PROVIDER_ID,
			})
		);
	}

	integrationsRegistered = true;
};
